const STATUS_BY_CODE: Record<string, number> = {
  INVALID_CREDENTIALS: 401,
  INVALID_REFRESH_TOKEN: 401,
  UNAUTHORIZED: 401,
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
  return STATUS_BY_CODE[code] ?? 500;
}
