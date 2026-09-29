import { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { statusForCode } from "./httpStatusMap.js";

/**
 * `body-parser` reports a malformed JSON body by throwing a `SyntaxError` that
 * carries an `expose: false` flag, a `status`/`statusCode` of 400, and a `body`
 * property. Without recognizing it, the request fell through to
 * `INTERNAL_ERROR` / 500 and the parser's raw message
 * ("Expected property name or '}' in JSON at position 1") was sent to the
 * client, describing the internals of our body parser instead of telling the
 * caller what was wrong with their request.
 */
function isMalformedJson(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 400 &&
    "body" in error
  );
}

export const GlobalHandleError: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const malformedJson = isMalformedJson(error);
  const code = malformedJson
    ? "VALIDATION_ERROR"
    : typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
      ? error.code
      : "INTERNAL_ERROR";
  const status = malformedJson
    ? 400
    : typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
      ? error.status
      : statusForCode(code);
  const message = malformedJson
    ? "Malformed JSON body."
    : error instanceof Error
      ? error.message
      : "An error occurred";
  const exposed = status >= 500 ? "An error occurred" : message;

  if (process.env.NODE_ENV === "development") {
    console.error("Error details:", {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      url: req.url,
      method: req.method,
    });
  }

  res.status(status).json({
    success: false,
    error: {
      message: exposed,
      code,
      status,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" &&
        error instanceof Error && { stack: error.stack }),
    },
  });
};
