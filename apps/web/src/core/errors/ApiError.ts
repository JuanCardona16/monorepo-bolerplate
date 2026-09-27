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
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    return new ApiError(
      body?.error.code ?? "UNKNOWN",
      response.status,
      body?.error.message ?? "Request failed.",
    );
  }
}
