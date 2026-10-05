import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * End-to-end coverage of the two public reset routes against the real HTTP
 * stack, with the use cases replaced by fakes.
 *
 * The point of the fakes is the *route* contract: which status, which body, and
 * above all which response is identical. The domain logic behind them is
 * covered by `@repo/core` against real ports, and testing it again here through
 * a fake would only re-assert the mock.
 *
 * The env comes from `src/test/setupEnv.ts`, a `setupFiles` entry, so nothing
 * in this file has to set it (see D-021).
 *
 * This file spends its whole `forgot-password` budget, deliberately and in
 * order: the rate limiters are process-level singletons, so every call here
 * counts against the same counter `passwordReset.limiter.test.ts` measures
 * (in its own module registry). That is also why both routes are exercised
 * exactly once per assertion below, and why the public-access check reuses an
 * existing expectation instead of spending an extra call.
 */
const h = vi.hoisted(() => ({
  requestPasswordResetUseCase: { execute: vi.fn(async () => undefined) },
  confirmPasswordResetUseCase: { execute: vi.fn(async () => ({ uuid: "user-1" })) },
}));

vi.mock("../core/di/container.js", async () => {
  const actual =
    await vi.importActual<typeof import("../core/di/container.js")>(
      "../core/di/container.js"
    );
  const { createAuthorize } = await import(
    "../core/middleware/auth/authorize.js"
  );
  const tokenProvider = new JwtTokenProvider("test-only-secret-not-used-anywhere-else", "15m");
  return {
    ...actual,
    getContainer: () => ({
      authentication: {
        controller: authController,
        authorize: createAuthorize(tokenProvider),
      },
    }),
  };
});

import { AuthController } from "../features/authentication/controllers/auth.controller.js";
import { JwtTokenProvider } from "@repo/security";

const unused = vi.fn(async () => {
  throw Object.assign(new Error("not used in this suite"), { status: 404 });
});
const authController = new AuthController(
  unused as never,
  unused as never,
  unused as never,
  unused as never,
  unused as never,
  unused as never,
  h.requestPasswordResetUseCase as never,
  h.confirmPasswordResetUseCase as never,
);

const FORGOT_URL = "/api/v1/auth/forgot-password";
const RESET_URL = "/api/v1/auth/reset-password";

const silentMessage =
  "If an account exists for that address, a password reset link is on its way.";

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("password reset routes", () => {
  let server: RunningServer;
  let application: unknown;

  beforeAll(async () => {
    const mod = await import("../core/app.js");
    application = mod.default;
    server = await startServer(application as never);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    h.requestPasswordResetUseCase.execute.mockClear();
    h.confirmPasswordResetUseCase.execute.mockClear();
  });

  /**
   * The enumeration guard, asserted at the boundary where it matters.
   *
   * Comparing the two bodies byte for byte is the only formulation that cannot
   * be satisfied by a hardcoded response: the "no user" path has to produce the
   * same bytes as the "user found" path. `timestamp` is not part of this
   * payload and the access log never sees a body, so the two are directly
   * comparable. Runs first, while budget remains for both calls.
   */
  describe("POST /api/v1/auth/forgot-password", () => {
    it("answers 202 with the same body whether or not the account exists", async () => {
      h.requestPasswordResetUseCase.execute
        .mockResolvedValueOnce(undefined) // account found, link sent
        .mockResolvedValueOnce(undefined); // no account, nothing sent

      const found = await post(`${server.baseUrl}${FORGOT_URL}`, {
        email: "user@example.com",
      });
      const foundBody = await found.text();

      const missing = await post(`${server.baseUrl}${FORGOT_URL}`, {
        email: "nobody@example.com",
      });
      const missingBody = await missing.text();

      expect(found.status).toBe(202);
      expect(missing.status).toBe(202);
      expect(foundBody).toBe(missingBody);
    });

    it("forwards the address and never promises an email", async () => {
      // A promise of an email is false for every unregistered address, and the
      // honest version of "no leaks" is refusing to say either way.
      const response = await post(`${server.baseUrl}${FORGOT_URL}`, {
        email: "user@example.com",
      });
      const body = (await response.json()) as { data?: { message?: string } };

      expect(response.status).toBe(202);
      expect(h.requestPasswordResetUseCase.execute).toHaveBeenCalledWith({
        email: "user@example.com",
      });
      expect(body.data?.message).toBe(silentMessage);
      expect(body.data?.message?.toLowerCase()).not.toContain("we sent");
    });

    it("rejects a malformed or missing email with 400, without reaching the use case", async () => {
      const malformed = await post(`${server.baseUrl}${FORGOT_URL}`, { email: "not-an-email" });
      const missing = await post(`${server.baseUrl}${FORGOT_URL}`, {});

      expect(malformed.status).toBe(400);
      expect(missing.status).toBe(400);
      expect(h.requestPasswordResetUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("forwards the token and password and answers 200 without any Authorization header", async () => {
      // No auth header on purpose: a reset route behind `authorize` would be
      // unreachable for exactly the people who need it.
      const response = await post(`${server.baseUrl}${RESET_URL}`, {
        token: "raw-token",
        password: "Str0ngPassw0rd",
      });
      const body = (await response.json()) as { data?: { uuid?: string } };

      expect(response.status).toBe(200);
      expect(h.confirmPasswordResetUseCase.execute).toHaveBeenCalledWith({
        token: "raw-token",
        password: "Str0ngPassw0rd",
      });
      expect(body.data?.uuid).toBe("user-1");
    });

    it("maps INVALID_RESET_TOKEN to 401 through the shared error envelope", async () => {
      h.confirmPasswordResetUseCase.execute.mockRejectedValueOnce(
        Object.assign(new Error("Invalid or expired reset token."), {
          code: "INVALID_RESET_TOKEN",
        }),
      );

      const response = await post(`${server.baseUrl}${RESET_URL}`, {
        token: "expired",
        password: "Str0ngPassw0rd",
      });
      const body = (await response.json()) as {
        success: boolean;
        error: { code: string; status: number };
      };

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INVALID_RESET_TOKEN");
      expect(body.error.status).toBe(401);
    });

    it("maps WEAK_PASSWORD to 400", async () => {
      h.confirmPasswordResetUseCase.execute.mockRejectedValueOnce(
        Object.assign(new Error("Password must be at least 8 characters long."), {
          code: "WEAK_PASSWORD",
        }),
      );

      const response = await post(`${server.baseUrl}${RESET_URL}`, {
        token: "raw-token",
        password: "weak",
      });

      expect(response.status).toBe(400);
    });

    it("rejects a missing or empty token without forwarding it", async () => {
      const missing = await post(`${server.baseUrl}${RESET_URL}`, {
        password: "Str0ngPassw0rd",
      });
      const empty = await post(`${server.baseUrl}${RESET_URL}`, {
        token: "",
        password: "Str0ngPassw0rd",
      });

      expect(missing.status).toBe(400);
      expect(empty.status).toBe(400);
      expect(h.confirmPasswordResetUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
