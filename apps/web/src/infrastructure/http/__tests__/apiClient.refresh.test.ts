import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../core/errors/ApiError.js";
import { api, configureApi } from "../apiClient.js";

/**
 * Regression suite for the refresh stampede.
 *
 * Refresh tokens rotate: the server revokes the token it just consumed. If two
 * `POST /auth/refresh` requests leave with the SAME cookie, the second one finds
 * the freshly issued token already revoked, trips the replay detector, and the
 * server revokes every session for that user. Measured end to end: the session
 * is unrecoverable. The client has to collapse concurrent refreshes into one.
 */
describe("apiClient refresh deduplication", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    configureApi({
      getAccessToken: () => "stale-token",
      onRefreshed: vi.fn(),
      onUnauthorized: vi.fn(),
    });
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("issues a single refresh when several requests get 401 at the same time", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse({ success: true, data: { accessToken: "fresh" } });
      }
      // First attempt is unauthorized, the retry after refresh succeeds.
      if (fetchMock.mock.calls.length <= 3) {
        return jsonResponse({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
      }
      return jsonResponse({ success: true, data: { ok: true } });
    });

    const results = await Promise.allSettled([
      api.get<{ ok: boolean }>("/api/v1/a"),
      api.get<{ ok: boolean }>("/api/v1/b"),
      api.get<{ ok: boolean }>("/api/v1/c"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });

  it("does not refresh for the refresh endpoint itself", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { accessToken: "x" } }));

    await api.post("/api/v1/auth/refresh");

    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("clears the in-flight promise so a later 401 can refresh again", async () => {
    // If the promise were cached forever, a genuine token expiry later would
    // resolve the first attempt's result and never actually refresh.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse({ success: true, data: { accessToken: "fresh" } });
      }
      return jsonResponse({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
    });

    await Promise.allSettled([api.get("/api/v1/a"), api.get("/api/v1/b")]);
    await Promise.allSettled([api.get("/api/v1/c"), api.get("/api/v1/d")]);

    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/auth/refresh"),
    );
    expect(refreshCalls.length).toBe(2);
  });

  it("propagates an ApiError when the request fails for a non-auth reason", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: "WEAK_PASSWORD", message: "no" } }, 400),
    );

    await expect(api.post("/api/v1/auth/login", {})).rejects.toBeInstanceOf(ApiError);
  });
});
