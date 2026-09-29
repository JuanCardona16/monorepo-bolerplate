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

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = accessors.getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
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
