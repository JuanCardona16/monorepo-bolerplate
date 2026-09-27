import { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { statusForCode } from "./httpStatusMap.js";

export const GlobalHandleError: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "INTERNAL_ERROR";
  const status =
    typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : statusForCode(code);
  const message =
    error instanceof Error ? error.message : "An error occurred";
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
