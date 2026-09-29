const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  INVALID_REFRESH_TOKEN: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  USER_ALREADY_EXISTS: 409,
  INVALID_EMAIL: 400,
  WEAK_PASSWORD: 400,
  INVALID_ROLE: 400,
  VALIDATION_ERROR: 400,
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
