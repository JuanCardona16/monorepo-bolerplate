import {
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidRefreshTokenError,
  InvalidRoleError,
  UserAlreadyExistsError,
  WeakPasswordError,
} from "@repo/core/authentication";
import express, { type Express, type RequestHandler } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startServer, type RunningServer } from "../../../__tests__/helpers/startServer.js";
import { GlobalHandleError } from "../GlobalHandleError.js";
import { HttpError } from "../HttpError.js";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface ErrorBody {
  success: boolean;
  error: {
    message: string;
    code: string;
    status: number;
    timestamp: string;
  };
}

let server: RunningServer;

/** Mounts a route that throws `error` and returns the parsed error envelope. */
async function callWith(error: unknown): Promise<{ status: number; body: ErrorBody }> {
  const app: Express = express();
  app.get("/boom", () => {
    throw error;
  });
  app.use(GlobalHandleError);

  const scoped = await startServer(app);
  try {
    const response = await fetch(`${scoped.baseUrl}/boom`);
    return { status: response.status, body: (await response.json()) as ErrorBody };
  } finally {
    await scoped.close();
  }
}

beforeAll(() => {
  // Pin NODE_ENV so the `development`-only extra keys never leak into assertions.
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  await server?.close();
});

describe("GlobalHandleError", () => {
  describe("response envelope", () => {
    it("answers with the failure envelope, not an Express HTML error page", async () => {
      const { status, body } = await callWith(new InvalidCredentialsError());

      expect(status).toBe(401);
      expect(body.success).toBe(false);
      expect(Object.keys(body).sort()).toEqual(["error", "success"]);
      expect(Object.keys(body.error).sort()).toEqual(["code", "message", "status", "timestamp"]);
    });

    it("stamps a valid ISO-8601 timestamp", async () => {
      const { body } = await callWith(new InvalidCredentialsError());

      expect(body.error.timestamp).toMatch(ISO_TIMESTAMP);
      expect(Number.isNaN(Date.parse(body.error.timestamp))).toBe(false);
    });

    it("sets JSON as the response content type", async () => {
      const app: Express = express();
      app.get("/boom", () => {
        throw new InvalidCredentialsError();
      });
      app.use(GlobalHandleError);

      server = await startServer(app);
      const response = await fetch(`${server.baseUrl}/boom`);

      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("domain code to HTTP status", () => {
    it.each([
      [new InvalidCredentialsError(), 401, "INVALID_CREDENTIALS"],
      [new InvalidRefreshTokenError(), 401, "INVALID_REFRESH_TOKEN"],
      [new UserAlreadyExistsError(), 409, "USER_ALREADY_EXISTS"],
      [new InvalidEmailError(), 400, "INVALID_EMAIL"],
      [new WeakPasswordError(), 400, "WEAK_PASSWORD"],
      [new InvalidRoleError(), 400, "INVALID_ROLE"],
    ])(
      "translates $name into $expected",
      async (error: unknown, expected: number, code: string) => {
        const { status, body } = await callWith(error);

        expect(status).toBe(expected);
        expect(body.error.status).toBe(expected);
        expect(body.error.code).toBe(code);
      },
    );

    it("keeps the domain message verbatim for a 4xx", async () => {
      const { body } = await callWith(new UserAlreadyExistsError());

      expect(body.error.message).toBe("User is already registered.");
    });
  });

  describe("fallbacks", () => {
    it("reports an unrecognised code as INTERNAL_ERROR with a 500", async () => {
      const { status, body } = await callWith(
        Object.assign(new Error("boom"), { code: "SOMETHING_UNKNOWN" }),
      );

      expect(status).toBe(500);
      expect(body.error.code).toBe("SOMETHING_UNKNOWN");
    });

    it("reports a plain Error as INTERNAL_ERROR and hides its message behind a 500", async () => {
      const { status, body } = await callWith(new Error("connection string is: postgres://secret"));

      expect(status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("An error occurred");
      expect(body.error.message).not.toContain("postgres://secret");
    });

    it("handles a thrown non-Error value without crashing", async () => {
      const { status, body } = await callWith("just a string");

      expect(status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("An error occurred");
    });

    it("hides the message of a 5xx that does declare a status", async () => {
      const { status, body } = await callWith(new HttpError(503, "SERVICE_UNAVAILABLE", "db is down"));

      expect(status).toBe(503);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toBe("An error occurred");
    });
  });

  describe("explicit status on HttpError", () => {
    it("prefers the status carried by the error over the code mapping", async () => {
      const { status, body } = await callWith(new HttpError(403, "INVALID_CREDENTIALS", "nope"));

      expect(status).toBe(403);
      expect(body.error.status).toBe(403);
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.message).toBe("nope");
    });

    it("does not add a stack field outside development", async () => {
      const { body } = await callWith(new HttpError(400, "VALIDATION_ERROR", "bad input"));

      expect(body.error).not.toHaveProperty("stack");
    });
  });

  it("is registered as an Express error handler with arity 4", () => {
    expect(typeof GlobalHandleError).toBe("function");
    expect((GlobalHandleError as unknown as RequestHandler).length).toBe(4);
  });
});
