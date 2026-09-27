export const API_PREFIX = "/api/v1";

export const ApiPaths = {
  LOGIN: `${API_PREFIX}/auth/login`,
  REGISTER: `${API_PREFIX}/auth/register`,
  REFRESH: `${API_PREFIX}/auth/refresh`,
  LOGOUT: `${API_PREFIX}/auth/logout`,
  ME: `${API_PREFIX}/auth/me`,
} as const;

export const AppRoutes = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
} as const;

export type AppRoute = (typeof AppRoutes)[keyof typeof AppRoutes];
