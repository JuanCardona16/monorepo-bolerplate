/**
 * These API paths mirror the gateway's own enums, and there is no build-time
 * link that would catch a drift: `web` has no dependency on `api-gateway`, so
 * the values below are transcribed from
 * `apps/api-gateway/src/constants/routes.ts` —
 *
 *   `${ApiPrefix}${ApiPrefixAuthRoutes}${route}`
 *     = "/api/v1" + "/auth" + <enum member>
 *
 * `LOGIN`, `REGISTER`, `REFRESH`, `LOGOUT`, `FORGOT_PASSWORD` and
 * `RESET_PASSWORD` come from `PublicRoutes`; `ME` from `PrivateRoutes`. Renaming
 * an enum member there without changing this file is a runtime 404, which is
 * why `__tests__/routes.test.ts` pins the literal strings instead of deriving
 * them from `API_PREFIX`.
 */
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
