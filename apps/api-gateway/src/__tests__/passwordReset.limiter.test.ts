import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FORGOT_PASSWORD_RATE_LIMIT,
  RESET_PASSWORD_RATE_LIMIT,
} from "../core/middleware/rateLimit/limiter.js";
import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * The dedicated rate limits on the reset routes.
 *
 * In its own file because the limiters are module-level singletons: their
 * counters live for the whole process, so a suite that also made functional
 * calls would start from a non-zero count and these assertions would depend on
 * execution order. Vitest gives each test file its own module registry, so
 * these counters start fresh here and are spent exactly once, in order.
 *
 * The tests are order-dependent **on purpose** and the comments mark the
 * dependency, because the alternative (one test per limiter, each re-deriving
 * the budget) is what produced a suite that asserted a stale literal.
 *
 * The env comes from `setupFiles`, so nothing here sets it (D-021).
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
  return { ...actual, getContainer: () => ({ authController, tokenProvider }) };
});

import { AuthController } from "../features/authentication/controllers/auth.controller.js";
import { JwtTokenProvider } from "@repo/security";

const tokenProvider = new JwtTokenProvider("test-only-secret-not-used-anywhere-else", "15m");
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

// Module scope, not `describe` scope: the call helpers below are declared at
// module level and a `let` inside the callback would not be visible to them.
let server: RunningServer;
let application: unknown;

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callForgot(): Promise<number> {
  return post(`${server.baseUrl}${FORGOT_URL}`, { email: "user@example.com" }).then(
    (response) => response.status,
  );
}

function callReset(): Promise<number> {
  return post(`${server.baseUrl}${RESET_URL}`, {
    token: "raw-token",
    password: "Str0ngPassw0rd",
  }).then((response) => response.status);
}

describe("password reset rate limits", () => {
  beforeAll(async () => {
    const mod = await import("../core/app.js");
    application = mod.default;
    server = await startServer(application as never);
  });

  afterAll(async () => {
    await server.close();
  });

  it("gives reset-password its own budget instead of sharing the forgot-password one", async () => {
    // Spent first, while `forgot` still has budget. A shared counter would let a
    // burst of reset-link requests lock a user out of the page where they are
    // about to use the link they just received.
    expect(await callReset()).toBe(200);
    // Spends forgotPasswordLimit[0] of the forgot budget.
    expect(await callForgot()).toBe(202);
  });

  it("answers 429 with the shared envelope once the forgot budget is spent", async () => {
    // One 202 already spent by the previous test.
    const statuses: number[] = [202];
    let firstRateLimited: Response | undefined;

    for (let attempt = 0; attempt < FORGOT_PASSWORD_RATE_LIMIT; attempt += 1) {
      const response = await post(`${server.baseUrl}${FORGOT_URL}`, {
        email: "user@example.com",
      });
      statuses.push(response.status);
      if (response.status === 429 && firstRateLimited === undefined) {
        firstRateLimited = response;
      }
    }

    // FORGOT_PASSWORD_RATE_LIMIT 202s in total, then everything after is 429.
    expect(statuses).toEqual([
      ...Array.from({ length: FORGOT_PASSWORD_RATE_LIMIT }, () => 202),
      429,
    ]);

    const body = (await firstRateLimited?.json()) as {
      success: boolean;
      error: { code: string; status: number };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.status).toBe(429);
  });

  it("stops reaching the use case once limited, so it cannot keep sending mail", async () => {
    // A 429 that still ran the use case would keep emailing: the limit would
    // bound the response, not the side effect.
    const before = h.requestPasswordResetUseCase.execute.mock.calls.length;

    expect(await callForgot()).toBe(429);
    expect(h.requestPasswordResetUseCase.execute.mock.calls.length).toBe(before);
  });

  it("answers 429 once the reset budget is spent", async () => {
    // One 200 already spent by the first test.
    const statuses: number[] = [200];
    for (let attempt = 0; attempt < RESET_PASSWORD_RATE_LIMIT; attempt += 1) {
      statuses.push(await callReset());
    }

    expect(statuses).toEqual([
      ...Array.from({ length: RESET_PASSWORD_RATE_LIMIT }, () => 200),
      429,
    ]);
  });
});
