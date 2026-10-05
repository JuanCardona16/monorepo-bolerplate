import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startServer, type RunningServer } from "../../__tests__/helpers/startServer.js";

/**
 * The route module calls `getContainer()` at import time, so mocking the
 * container module is the seam that keeps this suite off the database.
 *
 * `vi.hoisted` gives the `vi.mock` factory a binding to hand back, and it is
 * also the only place we can set `process.env` early enough: the env module
 * reads `required()` variables while it is being imported, and a plain
 * statement at the top of a test file runs *after* the imports.
 *
 * Because the container factory is replaced, `@repo/infrastructure` never
 * loads: no mongoose connection is opened and no model is touched.
 */
const hoisted = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
  process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
  process.env.MONGODB_URI = "mongodb://unused:unused@127.0.0.1:27017/unused";

  const tokenProvider = {
    generate: vi.fn(() => Promise.resolve("signed-access-token")),
    verify: vi.fn(() => Promise.resolve<{ userUuid: string; roles: string[] } | null>(null)),
  };

  const container = {
    tokenProvider,
    loginUseCase: { execute: vi.fn() },
    registerUseCase: { execute: vi.fn() },
    refreshUseCase: { execute: vi.fn() },
    logoutUseCase: { execute: vi.fn() },
    getProfileUseCase: { execute: vi.fn() },
    requestPasswordResetUseCase: { execute: vi.fn() },
    confirmPasswordResetUseCase: { execute: vi.fn() },
    authController: {} as never,
    close: vi.fn(() => Promise.resolve()),
  };

  return { container, tokenProvider };
});

vi.mock("../../core/di/container.js", async () => {
  // The real controller is kept: the suite is about the HTTP layer, and the
  // controller is the thin adapter that maps a use case result onto `res`.
  // Only the use cases behind it are fakes.
  const { AuthController } = await import(
    "../../features/authentication/controllers/auth.controller.js"
  );
  const { createAuthorize } = await import(
    "../../core/middleware/auth/authorize.js"
  );
  const authController = new AuthController(
    hoisted.container.loginUseCase as never,
    hoisted.container.registerUseCase as never,
    hoisted.container.refreshUseCase as never,
    hoisted.container.logoutUseCase as never,
    hoisted.container.getProfileUseCase as never,
    { execute: vi.fn() } as never,
    hoisted.container.requestPasswordResetUseCase as never,
    hoisted.container.confirmPasswordResetUseCase as never,
  );

  return {
    getContainer: () => ({
      ...hoisted.container,
      authentication: {
        controller: authController,
        authorize: createAuthorize(hoisted.tokenProvider),
      },
    }),
    createContainer: vi.fn(),
    closeContainer: vi.fn(() => Promise.resolve()),
  };
});

const USER_UUID = "user-uuid-1";
const REFRESH_COOKIE = "refresh_token";

/** Imported after the mock is registered so the route wires the fake use cases. */
const { default: app } = await import("../../core/app.js");
const { UserAlreadyExistsError, InvalidRefreshTokenError } = await import(
  "@repo/core/authentication"
);

const { container, tokenProvider } = hoisted;

let server: RunningServer;

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { message: string; code: string; status: number; timestamp: string };
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Envelope; setCookie: string | null }> {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const raw = await response.text();
  return {
    status: response.status,
    body: raw ? (JSON.parse(raw) as Envelope) : ({} as Envelope),
    setCookie: response.headers.get("set-cookie"),
  };
}

const post = (path: string, body?: unknown, headers?: Record<string, string>) =>
  call("POST", path, { body, headers });
const get = (path: string, headers?: Record<string, string>) => call("GET", path, { headers });

beforeAll(async () => {
  server = await startServer(app);
});

afterAll(async () => {
  await server?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  tokenProvider.verify.mockResolvedValue({ userUuid: USER_UUID, roles: ["user"] });
});

describe("POST /api/v1/auth/register", () => {
  it("answers 201 with the created user on success", async () => {
    container.registerUseCase.execute.mockResolvedValue({ uuid: USER_UUID });

    const { status, body } = await post("/api/v1/auth/register", {
      email: "user@example.com",
      password: "Password1",
    });

    expect(status).toBe(201);
    expect(body).toEqual({ success: true, data: { uuid: USER_UUID } });
  });

  it("forwards the parsed body to the use case, not the raw one", async () => {
    container.registerUseCase.execute.mockResolvedValue({ uuid: USER_UUID });

    await post("/api/v1/auth/register", {
      email: "user@example.com",
      password: "Password1",
      role: "admin",
    });

    expect(container.registerUseCase.execute).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1",
    });
  });

  it("answers 400 VALIDATION_ERROR on a malformed email", async () => {
    const { status, body } = await post("/api/v1/auth/register", {
      email: "not-an-email",
      password: "Password1",
    });

    expect(status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(container.registerUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 400 when the password is too short, before touching the domain", async () => {
    const { status, body } = await post("/api/v1/auth/register", {
      email: "user@example.com",
      password: "short",
    });

    expect(status).toBe(400);
    expect(body.error?.message).toBe("String must contain at least 8 character(s)");
    expect(container.registerUseCase.execute).not.toHaveBeenCalled();
  });

  it("translates USER_ALREADY_EXISTS into 409", async () => {
    container.registerUseCase.execute.mockRejectedValue(new UserAlreadyExistsError());

    const { status, body } = await post("/api/v1/auth/register", {
      email: "user@example.com",
      password: "Password1",
    });

    expect(status).toBe(409);
    expect(body.error?.code).toBe("USER_ALREADY_EXISTS");
    expect(body.error?.message).toBe("User is already registered.");
  });
});

describe("POST /api/v1/auth/login", () => {
  it("answers 200 and sets the refresh cookie as httpOnly", async () => {
    container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    const { status, body, setCookie } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password1",
    });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { accessToken: "access-token" } });
    expect(setCookie).toContain(`${REFRESH_COOKIE}=raw-refresh-token`);
    expect(setCookie).toContain("HttpOnly");
    // `lax`, not `strict`. Strict never sends the cookie on a cross-site
    // request, which breaks the refresh flow as soon as the API is not
    // same-site with the web app. Lax still blocks the cross-site POSTs that
    // CSRF depends on. Configurable via REFRESH_COOKIE_SAME_SITE.
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("never returns the refresh token in the body", async () => {
    container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    const { body } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password1",
    });

    expect(JSON.stringify(body)).not.toContain("raw-refresh-token");
  });

  it("translates INVALID_CREDENTIALS into 401 and sets no cookie", async () => {
    const { InvalidCredentialsError } = await import("@repo/core/authentication");
    container.loginUseCase.execute.mockRejectedValue(new InvalidCredentialsError());

    const { status, body, setCookie } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "wrong",
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe("INVALID_CREDENTIALS");
    expect(setCookie).toBeNull();
  });

  it("accepts a short password, unlike register", async () => {
    container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
    });

    const { status } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "a",
    });

    expect(status).toBe(200);
  });

  it("answers 400 on a malformed email", async () => {
    const { status, body } = await post("/api/v1/auth/login", {
      email: "not-an-email",
      password: "Password1",
    });

    expect(status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("passes rememberMe through and sets the 30-day cookie when true", async () => {
    container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      rememberMe: true,
    });

    const { status, setCookie } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password1",
      rememberMe: true,
    });

    expect(status).toBe(200);
    expect(container.loginUseCase.execute).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1",
      rememberMe: true,
    });
    expect(setCookie).toContain("Max-Age=2592000");
  });

  it("defaults to the 24-hour cookie when rememberMe is absent", async () => {
    container.loginUseCase.execute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      rememberMe: false,
    });

    const { status, setCookie } = await post("/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password1",
    });

    expect(status).toBe(200);
    expect(container.loginUseCase.execute).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1",
      rememberMe: false,
    });
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).not.toContain("Max-Age=2592000");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("answers 401 when the refresh cookie is missing", async () => {
    const { status, body } = await post("/api/v1/auth/refresh");

    expect(status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(container.refreshUseCase.execute).not.toHaveBeenCalled();
  });

  it("rotates the token and returns a new access token on success", async () => {
    container.refreshUseCase.execute.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-raw-refresh-token",
    });

    const { status, body, setCookie } = await post("/api/v1/auth/refresh", undefined, {
      Cookie: `${REFRESH_COOKIE}=existing-refresh-token`,
    });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { accessToken: "new-access-token" } });
    expect(setCookie).toContain(`${REFRESH_COOKIE}=new-raw-refresh-token`);
    expect(container.refreshUseCase.execute).toHaveBeenCalledWith({
      refreshToken: "existing-refresh-token",
    });
  });

  it("translates INVALID_REFRESH_TOKEN into 401", async () => {
    container.refreshUseCase.execute.mockRejectedValue(new InvalidRefreshTokenError());

    const { status, body } = await post("/api/v1/auth/refresh", undefined, {
      Cookie: `${REFRESH_COOKIE}=revoked-token`,
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("keeps a short session short across rotation", async () => {
    container.refreshUseCase.execute.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-raw-refresh-token",
      rememberMe: false,
    });

    const { status, setCookie } = await post("/api/v1/auth/refresh", undefined, {
      Cookie: `${REFRESH_COOKIE}=existing-refresh-token`,
    });

    expect(status).toBe(200);
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).not.toContain("Max-Age=2592000");
  });

  it("keeps a long session long across rotation", async () => {
    container.refreshUseCase.execute.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-raw-refresh-token",
      rememberMe: true,
    });

    const { status, setCookie } = await post("/api/v1/auth/refresh", undefined, {
      Cookie: `${REFRESH_COOKIE}=existing-refresh-token`,
    });

    expect(status).toBe(200);
    expect(setCookie).toContain("Max-Age=2592000");
  });

  it("clears the refresh cookie when the refresh is rejected", async () => {
    // A rejected refresh means the cookie is dead: revoked, expired, or
    // replayed. Left in the browser, the client resends it on every page load
    // and fails every time, so the app can never recover on its own.
    container.refreshUseCase.execute.mockRejectedValue(new InvalidRefreshTokenError());

    const response = await fetch(`${server.baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `${REFRESH_COOKIE}=revoked-token` },
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFRESH_COOKIE}=;`);
    // Express clears cookies with an epoch `expires`, not `max-age=0`.
    expect(setCookie.toLowerCase()).toMatch(/expires=thu, 01 jan 1970/);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("answers 401 without an Authorization header", async () => {
    const { status, body } = await post("/api/v1/auth/logout");

    expect(status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(container.logoutUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 204 and clears the refresh cookie for an authenticated caller", async () => {
    const { status, setCookie } = await post("/api/v1/auth/logout", undefined, {
      Authorization: "Bearer access-token",
    });

    expect(status).toBe(204);
    expect(container.logoutUseCase.execute).toHaveBeenCalledWith(USER_UUID);
    expect(setCookie).toContain(`${REFRESH_COOKIE}=`);
  });

  it("answers 401 and runs no use case when the token is invalid", async () => {
    tokenProvider.verify.mockResolvedValue(null);

    const { status, body } = await post("/api/v1/auth/logout", undefined, {
      Authorization: "Bearer bad-token",
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(container.logoutUseCase.execute).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/auth/me", () => {
  it("answers 401 without an Authorization header", async () => {
    const { status, body } = await get("/api/v1/auth/me");

    expect(status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(container.getProfileUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 200 with the profile of the authenticated user", async () => {
    container.getProfileUseCase.execute.mockResolvedValue({
      uuid: USER_UUID,
      email: "user@example.com",
      roles: ["user"],
    });

    const { status, body } = await get("/api/v1/auth/me", {
      Authorization: "Bearer access-token",
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { uuid: USER_UUID, email: "user@example.com", roles: ["user"] },
    });
    expect(container.getProfileUseCase.execute).toHaveBeenCalledWith(USER_UUID);
  });

  it("answers 401 when the profile use case rejects the identity", async () => {
    const { InvalidCredentialsError } = await import("@repo/core/authentication");
    container.getProfileUseCase.execute.mockRejectedValue(new InvalidCredentialsError());

    const { status, body } = await get("/api/v1/auth/me", {
      Authorization: "Bearer access-token",
    });

    expect(status).toBe(401);
    expect(body.error?.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("routing", () => {
  it("answers 404 with the failure envelope for an unknown route", async () => {
    const { status, body } = await get("/api/v1/does-not-exist");

    expect(status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: {
        message: "Route not found.",
        code: "NOT_FOUND",
        status: 404,
        timestamp: expect.any(String),
      },
    });
  });

  it("does not mount the auth routes outside the API prefix", async () => {
    const { status } = await get("/auth/me", { Authorization: "Bearer access-token" });

    expect(status).toBe(404);
  });

  it("answers 404, not 401, when a private route is hit without a token", async () => {
    const { status } = await get("/api/v1/auth/unknown");

    expect(status).toBe(404);
  });

  it("rejects a body that is not valid JSON with 400 rather than crashing", async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(response.status).toBe(400);
  });

  it("reports a malformed JSON body as VALIDATION_ERROR, not INTERNAL_ERROR", async () => {
    // `body-parser` throws a SyntaxError with no `code`, so this used to fall
    // through to INTERNAL_ERROR / 500 and be treated as a server fault.
    const response = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("does not leak the body parser internals to the client", async () => {
    // The raw message ("Expected property name or '}' in JSON at position 1")
    // describes our JSON parser, not the caller's mistake.
    const response = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    const raw = await response.text();
    expect(raw).not.toMatch(/position \d+/);
    expect(raw).not.toMatch(/JSON at position/i);
  });

  it("discloses no framework fingerprint header", async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/does-not-exist`);

    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});
