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
export const MONGODB_URI = required("MONGODB_URI");
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

/**
 * API key for the transactional email provider.
 *
 * Optional on purpose, unlike the six variables above. Making it `required()`
 * would mean a deployment without a Resend account cannot boot at all, even
 * though every other feature works fine without it. The reset flow instead
 * fails at the moment it is used: the adapter throws `EmailSendError`, the
 * use case swallows it, and the user is told, truthfully, that "if an account
 * exists, an email is on its way".
 *
 * That is a real trade-off and it is the correct one here. A missing key must
 * be loud in the logs, and it is: the adapter logs the failed delivery. What
 * it must not be is a boot failure that takes down login and registration
 * because a password was forgotten somewhere in the org.
 */
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

/**
 * Misconfigurations that must not stay silent.
 *
 * The reset flow swallows EVERY error from the sender, on purpose, so that a
 * broken adapter can never turn `forgot` into an account-enumeration oracle. The
 * cost of that silence is that a misconfiguration is invisible: emails "go out",
 * the user is told they are on their way, and the link is dead.
 *
 * `PASSWORD_RESET_URL` is the dangerous one. It defaults to a localhost URL, so
 * a production deployment that forgets to set it sends perfectly valid reset
 * emails containing `http://localhost:5173/reset-password#token=...` to real
 * users. Nothing fails, nothing is logged by the adapter, and nobody notices
 * until someone reports they cannot reset their password.
 *
 * These are warnings, not `required()`: a missing optional feature must not stop
 * login from booting. But "must not stop the boot" and "must not be silent" are
 * different requirements, and only the second one was being met.
 */
function warnMisconfiguredFeature(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "[config] RESEND_API_KEY is not set. Password reset will accept requests " +
        "and answer as if it had sent an email, but nothing is delivered.",
    );
  }
  if (!process.env.PASSWORD_RESET_URL) {
    console.warn(
      "[config] PASSWORD_RESET_URL is not set. Reset emails will be delivered " +
        `with a link pointing at ${PASSWORD_RESET_URL}, which no user can open.`,
    );
  }
  if (!process.env.EMAIL_FROM) {
    console.warn(
      "[config] EMAIL_FROM is not set. Resend rejects an unverified sender, so " +
        "every reset email will bounce.",
    );
  }
}

/**
 * The `From` header for transactional email.
 *
 * Resend rejects a `from` on an unverified domain, so this has to be a real,
 * verified address in production. A default is provided so local development
 * works without configuration, and a wrong value here surfaces immediately as
 * a provider rejection rather than as a silently undelivered message.
 */
export const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@example.com";

/**
 * Where the reset link points.
 *
 * This is the web app's route, not an API route. The token is appended as a
 * URL **fragment**, which browsers never transmit in an HTTP request, so it
 * cannot end up in the access log, in a reverse proxy's log, or in the
 * `Referer` header of whatever the user visits next.
 */
export const PASSWORD_RESET_URL =
  process.env.PASSWORD_RESET_URL || "http://localhost:5173/reset-password";

warnMisconfiguredFeature();

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
