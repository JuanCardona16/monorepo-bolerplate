import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiPaths } from "../../../constants/index.js";
import { ApiError } from "../../../core/errors/ApiError.js";
import { api, configureApi } from "../apiClient.js";

/**
 * Minimal `Response` stand-in: `apiClient` only reads `ok`, `status` and
 * `json()`, so constructing a real `Response` per assertion would add noise
 * without adding coverage.
 */
function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function errorEnvelope(status: number, code: string, message: string): unknown {
  return {
    success: false,
    error: { message, code, status, timestamp: "2026-09-29T10:00:00.000Z" },
  };
}

/** Last `fetch` call arguments, typed so the assertions stay readable. */
function lastCall(mock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  if (!call) {
    throw new Error("fetch was never called");
  }
  return call as [string, RequestInit];
}

function callCount(mock: ReturnType<typeof vi.fn>, urlFragment: string): number {
  return mock.mock.calls.filter(
    (call) => typeof call[0] === "string" && call[0].includes(urlFragment),
  ).length;
}

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * `configureApi` mutates module-level state with no reset hook, so every test
 * overwrites all three accessors instead of relying on the defaults.
 */
function resetAccessors(overrides: {
  getAccessToken?: () => string | null;
  onRefreshed?: (accessToken: string) => void;
  onUnauthorized?: () => void;
} = {}): void {
  configureApi({
    getAccessToken: overrides.getAccessToken ?? (() => null),
    onRefreshed: overrides.onRefreshed ?? (() => undefined),
    onUnauthorized: overrides.onUnauthorized ?? (() => undefined),
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resetAccessors();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A `fetch` that never got a response.
 *
 * Every page renders `mutation.error instanceof ApiError`, so a raw TypeError
 * escaping the client meant the UI showed nothing at all — the button reset to
 * idle and the user had no idea why. These tests pin the normalization that
 * makes the pages' existing error branch actually reachable.
 */
describe("network failures", () => {
  it("rejects with an ApiError rather than the raw TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await api.get("/api/v1/auth/me").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("reports a distinguishable code and a zero status", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = (await api.get("/api/v1/auth/me").catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("NETWORK_ERROR");
    // 0 is the conventional "no HTTP response at all" sentinel, distinct from
    // any status a server could have sent.
    expect(error.status).toBe(0);
  });

  it("carries a message the user can act on", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = (await api.get("/api/v1/auth/me").catch((e: unknown) => e)) as ApiError;

    expect(error.message).toMatch(/could not reach the server/i);
  });

  it("normalizes a DOMException rejection too, not only a TypeError", async () => {
    // CORS rejections and TLS failures arrive as different error types
    // depending on the browser. Normalizing only TypeError would leave a
    // whole class of real failures invisible.
    fetchMock.mockRejectedValue(new DOMException("Failed to fetch", "NetworkError"));

    const error = await api.post("/api/v1/auth/login", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
  });

  it("leaves an abort alone instead of calling it a connection problem", async () => {
    // An abort is a deliberate cancellation. Telling the user to check their
    // connection would be a lie, and it would also make cancellation
    // indistinguishable from failure for anything that retries.
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

    const error = await api.get("/api/v1/auth/me").catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("normalizes the failure of a POST as well as a GET", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await api.post("/api/v1/auth/login", { email: "a@b.co" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe("api.get", () => {
  it("requests the given path and unwraps data from the success envelope", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: { uuid: "u1" } }));

    const result = await api.get<{ uuid: string }>(ApiPaths.ME);

    expect(result).toEqual({ uuid: "u1" });
    const [url, init] = lastCall(fetchMock);
    expect(url).toContain(ApiPaths.ME);
    expect(init.method).toBeUndefined();
  });

  it("sends credentials and a JSON content type", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: null }));

    await api.get(ApiPaths.ME);

    const [, init] = lastCall(fetchMock);
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("omits Authorization when there is no access token", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: null }));

    await api.get(ApiPaths.ME);

    const [, init] = lastCall(fetchMock);
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("attaches the Bearer token when a token is present", async () => {
    resetAccessors({ getAccessToken: () => "token-abc" });
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: null }));

    await api.get(ApiPaths.ME);

    const [, init] = lastCall(fetchMock);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-abc" });
  });

  it("returns undefined for a 204 without touching the body", async () => {
    const jsonSpy = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: jsonSpy } as unknown as Response);

    await expect(api.post(ApiPaths.LOGOUT)).resolves.toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});

describe("api.post", () => {
  it("serializes the body and sets the method", async () => {
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: { accessToken: "t" } }));

    await api.post(ApiPaths.LOGIN, { email: "a@b.co", password: "secret" });

    const [url, init] = lastCall(fetchMock);
    expect(url).toContain(ApiPaths.LOGIN);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.co", password: "secret" }));
  });

  // The logout call is `api.post(ApiPaths.LOGOUT)` with no data, so the guard
  // must produce `undefined` rather than the literal string "undefined".
  it("sends no body when data is omitted", async () => {
    fetchMock.mockResolvedValue(stubResponse(204));

    await api.post(ApiPaths.LOGOUT);

    const [, init] = lastCall(fetchMock);
    expect(init.body).toBeUndefined();
  });
});

describe("error handling", () => {
  it("throws an ApiError built from the gateway envelope", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(409, errorEnvelope(409, "USER_ALREADY_EXISTS", "User already exists.")),
    );

    const error = await api.post(ApiPaths.REGISTER, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("USER_ALREADY_EXISTS");
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe("User already exists.");
  });

  it("degrades to UNKNOWN when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("not json");
      },
    } as unknown as Response);

    const error = (await api.get(ApiPaths.ME).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(502);
  });
});

describe("401 handling", () => {
  it("refreshes once and replays the original request with the new token", async () => {
    let token: string | null = "stale";
    const onRefreshed = vi.fn((next: string) => {
      token = next;
    });
    resetAccessors({ getAccessToken: () => token, onRefreshed });

    fetchMock
      .mockResolvedValueOnce(stubResponse(401, errorEnvelope(401, "UNAUTHORIZED", "Nope.")))
      .mockResolvedValueOnce(
        stubResponse(200, { success: true, data: { accessToken: "fresh" } }),
      )
      .mockResolvedValueOnce(stubResponse(200, { success: true, data: { uuid: "u1" } }));

    const result = await api.get<{ uuid: string }>(ApiPaths.ME);

    expect(result).toEqual({ uuid: "u1" });
    expect(onRefreshed).toHaveBeenCalledWith("fresh");
    expect(callCount(fetchMock, ApiPaths.REFRESH)).toBe(1);
    expect(callCount(fetchMock, ApiPaths.ME)).toBe(2);

    const replay = lastCall(fetchMock);
    expect(replay[0]).toContain(ApiPaths.ME);
    expect(replay[1].headers).toMatchObject({ Authorization: "Bearer fresh" });
  });

  it("posts the refresh with no body and the same JSON content type", async () => {
    fetchMock
      .mockResolvedValueOnce(stubResponse(401, errorEnvelope(401, "UNAUTHORIZED", "Nope.")))
      .mockResolvedValueOnce(stubResponse(200, { success: true, data: { accessToken: "t" } }))
      .mockResolvedValueOnce(stubResponse(200, { success: true, data: null }));

    await api.get(ApiPaths.ME);

    const refreshCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshCall[0]).toContain(ApiPaths.REFRESH);
    expect(refreshCall[1].method).toBe("POST");
    expect(refreshCall[1].body).toBeUndefined();
  });

  it("notifies onUnauthorized and rethrows the original 401 when refresh fails", async () => {
    const onUnauthorized = vi.fn();
    const onRefreshed = vi.fn();
    resetAccessors({ onUnauthorized, onRefreshed });

    fetchMock
      .mockResolvedValueOnce(stubResponse(401, errorEnvelope(401, "UNAUTHORIZED", "Nope.")))
      .mockResolvedValueOnce(stubResponse(401, errorEnvelope(401, "INVALID_REFRESH_TOKEN", "Bad.")));

    const error = await api.get(ApiPaths.ME).catch((e: unknown) => e);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNAUTHORIZED");
  });

  it("retries at most once, so a second 401 surfaces instead of looping", async () => {
    const onUnauthorized = vi.fn();
    resetAccessors({
      getAccessToken: () => "still-stale",
      onUnauthorized,
    });

    fetchMock.mockResolvedValue(
      stubResponse(401, errorEnvelope(401, "UNAUTHORIZED", "Nope.")),
    );

    const error = await api.get(ApiPaths.ME).catch((e: unknown) => e);

    // original + one refresh attempt. `tryRefresh` passes retry=false, so the
    // refresh's own 401 does not spawn further refreshes.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callCount(fetchMock, ApiPaths.REFRESH)).toBe(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect((error as ApiError).status).toBe(401);
  });

  it("does not attempt a refresh when the 401 came from the refresh call itself", async () => {
    const onUnauthorized = vi.fn();
    resetAccessors({ onUnauthorized });

    fetchMock.mockResolvedValue(
      stubResponse(401, errorEnvelope(401, "INVALID_REFRESH_TOKEN", "Bad.")),
    );

    await api.post(ApiPaths.REFRESH).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // This used to assert the raw TypeError escaped, pinning the behaviour that
  // made the pages' `instanceof ApiError` branch unreachable on a dropped
  // connection. Network failures are now normalized; see "network failures".
  it("normalizes a network failure raised while handling a 401 flow", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await api.get(ApiPaths.ME).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(TypeError);
  });
});
