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

async function tryRefresh(): Promise<boolean> {
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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
};
