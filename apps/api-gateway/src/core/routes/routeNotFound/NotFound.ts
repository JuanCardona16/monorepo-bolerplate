import { Request, Response } from "express";

export const handleNotFound = (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: "Route not found.",
      code: "NOT_FOUND",
      status: 404,
      timestamp: new Date().toISOString(),
    },
  });
};
