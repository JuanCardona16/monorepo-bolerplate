import { NextFunction, Request, Response } from "express";
import { ZodError, ZodSchema } from "zod";
import { HttpError } from "../../errors/HttpError.js";

export const validateWithZod =
  (schema: ZodSchema, type: "body" | "params" | "query" = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req[type]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new HttpError(
            400,
            "VALIDATION_ERROR",
            error.errors.map((e) => e.message).join(", "),
          ),
        );
      }
      next(error);
    }
  };
