interface ErrorBody {
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

  static async fromResponse(response: Response): Promise<ApiError> {
    const body = (await response.json().catch(() => null)) as Partial<ErrorBody> | null;
    // `body?.error` rather than `body?.error.code`: the old optional chain only
    // guarded `body`, so any body without an `error` object (a success envelope,
    // a bare array, a differently shaped payload) dereferenced `undefined` and
    // threw a TypeError. Because this is async, the TypeError surfaced as a
    // rejection instead of an ApiError, and callers that branch on
    // `instanceof ApiError` silently rendered nothing to the user.
    return new ApiError(
      body?.error?.code ?? "UNKNOWN",
      response.status,
      body?.error?.message ?? "Request failed.",
    );
  }
}
