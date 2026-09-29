import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local or .env.`,
    );
  }
  return value;
}

export const PORT = process.env.PORT || 3000;
export const TOKEN_SECRET_KEY = required("TOKEN_SECRET_KEY");
export const REFRESH_TOKEN_SECRET_KEY = required("REFRESH_TOKEN_SECRET_KEY");
export const DATABASE_URL = required("DATABASE_URL");
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
export const BCRYPT_ROUNDS = parsePositiveInt("BCRYPT_ROUNDS", "10");

/**
 * How many reverse proxies sit in front of the app.
 *
 * `express-rate-limit` keys on the client IP. Without `trust proxy`, every
 * request arrives with the proxy's address, so the 200/15min global limit is
 * shared by all users and the first busy minute locks everyone out.
 *
 * Defaults to `0` (no proxy) because trusting a proxy you do not control lets a
 * client forge `X-Forwarded-For` and bypass the rate limit entirely. Set it to
 * the real hop count at deploy time: `1` behind a single nginx/Cloudflare/
 * load balancer, `2` behind one of those in front of another.
 */
export const TRUST_PROXY_HOPS = parseNonNegativeInt("TRUST_PROXY_HOPS", "0");

/**
 * Whether the access log records the client IP.
 *
 * Off by default. An IP address is personal data under GDPR, and an access log
 * is exactly the kind of store that quietly accumulates it forever. Turn it on
 * only where you need it for abuse analysis, and own the retention story that
 * comes with it.
 */
export const ACCESS_LOG_IPS = process.env.ACCESS_LOG_IPS === "true";

/**
 * Whether the OpenAPI spec and the Swagger UI are served.
 *
 * Defaults to ON in development and OFF in production. Swagger UI is a complete,
 * browsable inventory of every endpoint, every schema and every error code: on a
 * public deployment that is reconnaissance handed over for free. The raw spec
 * follows the same flag, because a JSON document describing the whole surface is
 * just as useful to an attacker as the rendered one.
 */
export const DOCS_ENABLED =
  process.env.DOCS_ENABLED === "true" ||
  (process.env.DOCS_ENABLED === undefined && process.env.NODE_ENV !== "production");

/**
 * The `servers` entry Swagger UI's "Try it out" will call.
 *
 * Defaults to "/", correct when the web app and the API share an origin or the
 * browser is pointed at the gateway directly. Set it to the public API URL when
 * the client is served from somewhere else, otherwise "Try it out" resolves
 * relative to the docs page and every call fails with a CORS error.
 */
export const OPENAPI_SERVER_URL = process.env.OPENAPI_SERVER_URL || "/";

/**
 * `SameSite` for the refresh cookie.
 *
 * `strict` never sends the cookie on any cross-site request, which breaks the
 * refresh flow when the API is genuinely cross-site from the web app. `lax` is
 * the browser default: still blocks the cross-site POSTs that CSRF relies on,
 * while letting a top-level navigation carry the cookie. Set to `none` only
 * when the API is on a different registrable domain, and then `REFRESH_COOKIE_SECURE`
 * has to be true or the browser rejects the cookie outright.
 */
export const REFRESH_COOKIE_SAME_SITE = parseSameSite(
  process.env.REFRESH_COOKIE_SAME_SITE,
  "lax",
);

/**
 * `Secure` on the refresh cookie. Defaults to true in production, where the app
 * is expected to be served over HTTPS. Force it to false only for local HTTP.
 */
export const REFRESH_COOKIE_SECURE =
  process.env.REFRESH_COOKIE_SECURE === "true" ||
  (process.env.REFRESH_COOKIE_SECURE === undefined &&
    process.env.NODE_ENV === "production");

function parsePositiveInt(name: string, fallback: string): number {
  const raw = process.env[name] ?? fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid environment variable: ${name} must be a positive integer. Add it to .env.local or .env.`,
    );
  }
  return value;
}

function parseNonNegativeInt(name: string, fallback: string): number {
  const raw = process.env[name] ?? fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid environment variable: ${name} must be a non-negative integer. Add it to .env.local or .env.`,
    );
  }
  return value;
}

function parseSameSite(
  raw: string | undefined,
  fallback: "lax" | "strict" | "none",
): "lax" | "strict" | "none" {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  if (raw !== "lax" && raw !== "strict" && raw !== "none") {
    throw new Error(
      `Invalid environment variable: REFRESH_COOKIE_SAME_SITE must be one of lax, strict, none.`,
    );
  }
  return raw;
}
