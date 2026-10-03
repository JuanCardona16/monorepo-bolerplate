import { LONG_SESSION_TTL_MS, SHORT_SESSION_TTL_MS } from "@repo/core/authentication";

export const REFRESH_COOKIE = "refresh_token";
// Cookie lifetimes mirror the domain session lifetimes in
// `@repo/core/authentication` (sessionLifetimes.ts). A single source: if the
// domain changes what "short" means, the cookie follows without a second edit.
export const REFRESH_COOKIE_MAX_AGE_MS = LONG_SESSION_TTL_MS;
export const REFRESH_COOKIE_SHORT_MAX_AGE_MS = SHORT_SESSION_TTL_MS;
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
