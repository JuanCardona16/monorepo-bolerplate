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
      const [scheme, token] = header.split(" ");
      // RFC 7235: the auth-scheme has to be checked, not just skipped over.
      // Splitting and taking index 1 meant `Authorization: Basic <jwt>` and
      // `Negotiate <jwt>` authenticated exactly like `Bearer <jwt>`. No
      // privilege escalation (the token still has to verify), but the scheme
      // was never actually enforced. The scheme is case-insensitive.
      if (scheme?.toLowerCase() !== "bearer" || !token) {
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
