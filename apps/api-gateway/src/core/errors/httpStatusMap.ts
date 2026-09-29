const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  INVALID_REFRESH_TOKEN: 401,
  // The token is a bearer credential, and a bad one is a failed authentication
  // rather than a bad request: the body is well formed, the token is not. 401
  // also matches what a client does with it, retrying from the email link.
  INVALID_RESET_TOKEN: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  USER_ALREADY_EXISTS: 409,
  INVALID_EMAIL: 400,
  WEAK_PASSWORD: 400,
  INVALID_ROLE: 400,
  VALIDATION_ERROR: 400,
  // 502, not 500: the request was well formed and the application worked, the
  // upstream provider did not. A 500 would tell the caller to retry against
  // *our* service, and would land this in the "our fault" dashboards where it
  // belongs to nobody.
  //
  // The `forgot` route deliberately swallows this instead of returning it (a
  // differing answer would enumerate accounts), so this entry exists for a
  // delivery failure surfacing anywhere else.
  EMAIL_SEND_FAILED: 502,
};

export function statusForCode(code: string | undefined): number {
  if (!code) {
    return 500;
  }
  // `Object.hasOwn` guards the prototype chain: without it, `code: "constructor"`
  // or `"toString"` resolves to an inherited function instead of a status, and
  // that value would be handed to `res.status()`. A `Map` would avoid this too,
  // but the lookup here is on a short, fixed set of codes.
  return Object.hasOwn(STATUS_BY_CODE, code) ? (STATUS_BY_CODE[code] ?? 500) : 500;
}
