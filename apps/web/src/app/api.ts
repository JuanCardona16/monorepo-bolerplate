import { useAuthStore } from "../stores/auth.js";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ApiErrorBody {
  success: false;
  error: {
    message: string;
    code: string;
    status: number;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 401 && retry && !path.endsWith("/auth/refresh")) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) {
      return request<T>(path, init, false);
    }
    useAuthStore.getState().clear();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body?.error.code ?? "UNKNOWN",
      response.status,
      body?.error.message ?? "Request failed.",
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json()) as { success: boolean; data: T };
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
};
