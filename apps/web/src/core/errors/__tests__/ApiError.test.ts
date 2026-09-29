import { describe, expect, it } from "vitest";

import { ApiError } from "../ApiError.js";

/**
 * Builds a `Response`-like stub. Only `json()` and `status` are ever touched by
 * `ApiError.fromResponse`, so a full `Response` would be noise.
 */
function stubResponse(status: number, body: unknown, jsonRejects = false): Response {
  return {
    status,
    json: async () => {
      if (jsonRejects) {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      }
      return body;
    },
  } as unknown as Response;
}

describe("ApiError", () => {
  it("is a real Error subclass carrying code and status", () => {
    const error = new ApiError("INVALID_CREDENTIALS", 401, "Invalid credentials.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("Invalid credentials.");
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.status).toBe(401);
  });

  it("maps the gateway error envelope onto code, status and message", async () => {
    const error = await ApiError.fromResponse(
      stubResponse(409, {
        success: false,
        error: {
          message: "User already exists.",
          code: "USER_ALREADY_EXISTS",
          status: 409,
          timestamp: "2026-09-29T10:00:00.000Z",
        },
      }),
    );

    expect(error.code).toBe("USER_ALREADY_EXISTS");
    expect(error.status).toBe(409);
    expect(error.message).toBe("User already exists.");
  });

  // The gateway's own `status` field is deliberately ignored: `Response.status`
  // is the transport truth, so a proxy rewriting the body cannot desync them.
  it("prefers the transport status over the status inside the envelope", async () => {
    const error = await ApiError.fromResponse(
      stubResponse(503, {
        success: false,
        error: { message: "Down.", code: "SERVICE_UNAVAILABLE", status: 200 },
      }),
    );

    expect(error.status).toBe(503);
  });

  it("falls back to UNKNOWN / Request failed. when the body is not JSON", async () => {
    const error = await ApiError.fromResponse(
      stubResponse(500, undefined, /* jsonRejects */ true),
    );

    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(500);
    expect(error.message).toBe("Request failed.");
  });

  it("falls back when the body parses to null", async () => {
    const error = await ApiError.fromResponse(stubResponse(404, null));

    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Request failed.");
  });

  // Regression: the lookup used to be `body?.error.code`, which only guards
  // `body`. Any payload without an `error` object dereferenced `undefined` and
  // threw a TypeError out of an async function, so the rejection was a TypeError
  // instead of an ApiError. Callers branch on `instanceof ApiError`, so a
  // misrouted request returning a success envelope rendered nothing to the user.
  it("degrades to UNKNOWN when the body is a success envelope, not an error one", async () => {
    const error = await ApiError.fromResponse(
      stubResponse(200, { success: true, data: {} }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
    expect(error.message).toBe("Request failed.");
  });

  it.each([
    ["a bare array", [] as unknown],
    ["a bare string", "oops" as unknown],
    ["an object with no error key", { nope: true } as unknown],
    ["an error key that is not an object", { error: "boom" } as unknown],
    ["a null error key", { error: null } as unknown],
  ])("degrades to UNKNOWN for %s", async (_label, body) => {
    const error = await ApiError.fromResponse(stubResponse(500, body));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
  });

  it("falls back when the error object is present but its fields are empty", async () => {
    const error = await ApiError.fromResponse(
      stubResponse(400, { success: false, error: {} }),
    );

    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(400);
    expect(error.message).toBe("Request failed.");
  });
});
