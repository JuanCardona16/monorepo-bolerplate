import { TokenProvider } from "@repo/core/authentication";
import { Request, RequestHandler } from "express";
import { HttpError } from "../../errors/HttpError.js";

export interface AuthenticatedUser {
  uuid: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const createAuthorize =
  (tokenProvider: TokenProvider): RequestHandler =>
  async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header) {
        return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
      }
      const token = header.split(" ")[1];
      if (!token) {
        return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
      }
      const payload = await tokenProvider.verify(token);
      if (!payload) {
        return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
      }
      (req as AuthenticatedRequest).user = {
        uuid: payload.userUuid,
        roles: payload.roles,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
