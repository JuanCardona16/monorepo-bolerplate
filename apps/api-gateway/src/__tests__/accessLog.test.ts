import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * The access log, proven against the real HTTP stack.
 *
 * The unit suite on `requestLogger` checks the line format with fake objects.
 * This one checks the thing that actually matters and that no format assertion
 * can prove: that a real request carrying an email in the query string, a
 * password in the body and a bearer token in the header produces a log line
 * with none of it in it.
 *
 * The `vi.hoisted` block is required for the same reason as in
 * `app.http.test.ts`: the env module runs `required()` while it is imported,
 * which happens before any plain statement at the top of this file.
 */
const hoisted = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
  process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
  process.env.MONGODB_URI = "mongodb://unused:unused@127.0.0.1:27017/unused";

  const container = {
    loginUseCase: { execute: vi.fn() },
    registerUseCase: { execute: vi.fn() },
    refreshUseCase: { execute: vi.fn() },
    logoutUseCase: { execute: vi.fn() },
    getProfileUseCase: { execute: vi.fn() },
    changeUserRolesUseCase: { execute: vi.fn() },
  };

  return { container };
});

vi.mock("../core/di/container.js", async () => {
  const actual =
    await vi.importActual<typeof import("../core/di/container.js")>(
      "../core/di/container.js",
    );
  const { createAuthorize } = await import(
    "../core/middleware/auth/authorize.js"
  );
  return { ...actual, getContainer: () => hoisted.container };
});

// `auth.route.ts` destructures `authController` and `authorize` from the
// container at import time, and the routes are mounted while `app.ts` is being
// imported. Returning a container without them fails the import with
// "Cannot read properties of undefined (reading 'register')" — which points at
// the route file and has nothing to do with the access log.
import { AuthController } from "../features/authentication/controllers/auth.controller.js";
import { createAuthorize } from "../core/middleware/auth/authorize.js";
import { JwtTokenProvider } from "@repo/security";

// The controller has to be built on the SAME use case objects the tests assert
// against. Handing it six unrelated stubs produces a 500 that looks like a
// logger bug and is really a wiring mistake.
const authController = new AuthController(
  hoisted.container.loginUseCase as never,
  hoisted.container.registerUseCase as never,
  hoisted.container.refreshUseCase as never,
  hoisted.container.logoutUseCase as never,
  hoisted.container.getProfileUseCase as never,
  hoisted.container.changeUserRolesUseCase as never,
);
const tokenProvider = new JwtTokenProvider("test-only-token-secret", "15m");
hoisted.container.authentication = {
  controller: authController,
  authorize: createAuthorize(tokenProvider),
};

/** Everything the log captured during one test. */
let captured: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

describe("access log", () => {
  let server: RunningServer;

  beforeAll(async () => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      captured.push(String(chunk));
      return true;
    });
    const mod = await import("../core/app.js");
    server = await startServer(mod.default as never);
  });

  afterAll(async () => {
    stdoutSpy.mockRestore();
    await server.close();
  });

  beforeEach(() => {
    captured = [];
    hoisted.container.loginUseCase.execute.mockReset();
  });

  it("logs a line for a successful request", async () => {
    hoisted.container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "Password1" }),
    });

    const line = captured.find((l) => l.includes("/api/v1/auth/login"));
    expect(line).toBeDefined();
    expect(line).toContain('"POST /api/v1/auth/login"');
    expect(line).toContain("200");
  });

  it("leaks neither the email nor the password from the body", async () => {
    hoisted.container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "leaked@example.com",
        password: "hunter2-not-a-real-password",
      }),
    });

    const log = captured.join("");
    expect(log).toContain("/api/v1/auth/login");
    expect(log).not.toContain("leaked@example.com");
    expect(log).not.toContain("hunter2-not-a-real-password");
  });

  it("leaks neither the query string nor the bearer token", async () => {
    hoisted.container.getProfileUseCase.execute.mockResolvedValue({
      uuid: "user-uuid",
      email: "a@b.com",
      roles: ["user"],
    });

    // A REAL signed token, so this asserts on a credential the server actually
    // accepted. A made-up string would be rejected with 401 and the assertion
    // would pass for the wrong reason.
    const token = await tokenProvider.generate({ userUuid: "user-uuid", roles: ["user"] });

    const response = await fetch(
      `${server.baseUrl}/api/v1/auth/me?email=leaked@example.com&token=s3cr3t-query-value`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const log = captured.join("");
    expect(log).toContain("/api/v1/auth/me");
    expect(log).not.toContain("leaked@example.com");
    expect(log).not.toContain("s3cr3t-query-value");
    // The exact token the server accepted must not appear in the log.
    expect(log).not.toContain(token);
  });

  it("logs the refresh token's own response without logging the token", async () => {
    hoisted.container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token-value",
    });

    await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "Password1" }),
    });

    expect(captured.join("")).not.toContain("raw-refresh-token-value");
  });

  it("logs 404s, which a router-mounted logger would miss entirely", async () => {
    await fetch(`${server.baseUrl}/api/v1/auth/nope`);

    const line = captured.find((l) => l.includes("/api/v1/auth/nope"));
    expect(line).toBeDefined();
    expect(line).toContain("404");
  });

  it("logs exactly one line per request", async () => {
    hoisted.container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "Password1" }),
    });

    const lines = captured.filter((l) => l.includes("/api/v1/auth/login"));
    expect(lines).toHaveLength(1);
  });

  it("does not record the client IP by default", async () => {
    // 127.0.0.1 is the address of a request made from this machine. Logging it
    // by default is how an access log quietly becomes a store of personal data.
    await fetch(`${server.baseUrl}/api/docs/openapi.json`);

    const line = captured.find((l) => l.includes("/api/docs/openapi.json"));
    expect(line).toBeDefined();
    expect(line).toMatch(/^- "GET/);
  });
});
