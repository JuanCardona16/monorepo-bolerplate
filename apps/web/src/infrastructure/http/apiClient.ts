import { API_URL } from "../../config/env";
import { ApiError } from "../../core/errors/ApiError";

interface ApiAccessors {
  getAccessToken: () => string | null;
  onRefreshed: (accessToken: string) => void;
  onUnauthorized: () => void;
}

let accessors: ApiAccessors = {
  getAccessToken: () => null,
  onRefreshed: () => undefined,
  onUnauthorized: () => undefined,
};

export function configureApi(next: Partial<ApiAccessors>): void {
  accessors = { ...accessors, ...next };
}

/**
 * A `fetch` that never got a response: no network, DNS failure, CORS rejection,
 * TLS error, or an aborted tab.
 *
 * Browsers deliberately give no detail here, which is why the message is
 * generic. It is still a message, and that is the point: without one, every page
 * that renders `mutation.error instanceof ApiError` renders *nothing* when the
 * connection drops, and the user is left staring at a button that quietly went
 * back to its idle state.
 *
 * `status: 0` is the conventional "no HTTP response at all" sentinel, distinct
 * from any real status the server could have sent.
 */
const NETWORK_ERROR_MESSAGE = "Could not reach the server. Check your connection and try again.";

function toNetworkError(cause: unknown): unknown {
  // An abort is a deliberate cancellation, not a failure. Turning it into a
  // user-facing "check your connection" would be a lie.
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return cause;
  }
  return new ApiError("NETWORK_ERROR", 0, NETWORK_ERROR_MESSAGE);
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = accessors.getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
  if (response.status === 401 && retry && !path.endsWith("/auth/refresh")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, init, false);
    }
    accessors.onUnauthorized();
  }
  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json()) as { success: boolean; data: T };
  return body.data;
}

// Deduplicate concurrent refreshes.
//
// Without this, N requests that fail with 401 at the same time each fire their
// own POST /auth/refresh with the SAME cookie. Refresh rotation revokes the token
// it just used, so the second request finds the freshly issued token already
// revoked, trips the replay detector, and the server responds by revoking every
// session for that user. The user is logged out and cannot recover.
//
// Sharing one in-flight promise collapses N concurrent refreshes into 1, which
// is what the rotating-cookie design requires.
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const data = await request<{ accessToken: string }>(
      "/api/v1/auth/refresh",
      { method: "POST" },
      false,
    );
    accessors.onRefreshed(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
};
