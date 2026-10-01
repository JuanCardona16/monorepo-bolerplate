export const API_PREFIX = "/api/v1";

export const ApiPaths = {
  LOGIN: `${API_PREFIX}/auth/login`,
  REGISTER: `${API_PREFIX}/auth/register`,
  REFRESH: `${API_PREFIX}/auth/refresh`,
  LOGOUT: `${API_PREFIX}/auth/logout`,
  ME: `${API_PREFIX}/auth/me`,
  FORGOT_PASSWORD: `${API_PREFIX}/auth/forgot-password`,
  RESET_PASSWORD: `${API_PREFIX}/auth/reset-password`,
} as const;

export const AppRoutes = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
} as const;

export type AppRoute = (typeof AppRoutes)[keyof typeof AppRoutes];
