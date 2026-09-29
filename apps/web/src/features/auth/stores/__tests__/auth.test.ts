import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiPaths } from "../../../../constants/index.js";
import { ApiError } from "../../../../core/errors/ApiError.js";
import { loginRequest, useAuthStore } from "../auth.js";

/**
 * `useAuthStore` is a module-level singleton, so state survives between tests
 * unless it is explicitly reset. Everything here is asserted through
 * `getState()` / `setState()` with no React involved.
 */
beforeEach(() => {
  useAuthStore.setState({ accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAuthStore token state", () => {
  it("starts with no access token", () => {
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("setAccessToken stores the given token", () => {
    useAuthStore.getState().setAccessToken("token-1");

    expect(useAuthStore.getState().accessToken).toBe("token-1");
  });

  it("setAccessToken accepts null to clear the token", () => {
    useAuthStore.getState().setAccessToken("token-1");

    useAuthStore.getState().setAccessToken(null);

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("clear resets the token to null and leaves the actions intact", () => {
    useAuthStore.setState({ accessToken: "token-1" });

    useAuthStore.getState().clear();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(typeof useAuthStore.getState().setAccessToken).toBe("function");
    expect(typeof useAuthStore.getState().refresh).toBe("function");
  });
});

describe("useAuthStore.refresh", () => {
  it("returns true and stores the access token when the API answers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { accessToken: "refreshed" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe("refreshed");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(ApiPaths.REFRESH);
    expect(init.method).toBe("POST");
  });

  it("returns false and clears the token when the API rejects", async () => {
    useAuthStore.setState({ accessToken: "expired" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { message: "Invalid refresh token.", code: "INVALID_REFRESH_TOKEN", status: 401 },
        }),
      }),
    );

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("returns false and clears the token on a network error", async () => {
    useAuthStore.setState({ accessToken: "expired" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

describe("loginRequest", () => {
  it("posts the credentials to the login path and returns the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { accessToken: "session" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginRequest({ email: "user@test.co", password: "Secret123" });

    expect(result).toEqual({ accessToken: "session" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(ApiPaths.LOGIN);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "user@test.co", password: "Secret123" }));
  });

  it("propagates the ApiError when the credentials are rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { message: "Invalid credentials.", code: "INVALID_CREDENTIALS", status: 401 },
        }),
      }),
    );

    const error = await loginRequest({ email: "user@test.co", password: "nope" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
  });
});
