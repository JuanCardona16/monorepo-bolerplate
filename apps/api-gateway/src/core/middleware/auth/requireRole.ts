import { RequestHandler } from "express";
import { HttpError } from "../../errors/HttpError.js";
import { AuthenticatedRequest } from "./authorize.js";

/**
 * Requires the authenticated caller to hold a role.
 *
 * Roles arrive in the verified JWT payload, so this must always run AFTER
 * `createAuthorize`. Mounting it earlier would read `req.user` while it is still
 * undefined, and a missing `user` has to be a 401, never a 403: a 403 would tell
 * an anonymous caller that the route exists.
 */
export function requireRole(role: string): RequestHandler {
  const expected = role.trim().toLowerCase();

  return (req, _res, next) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
    }
    if (!user.roles.some((assigned) => assigned.toLowerCase() === expected)) {
      return next(
        new HttpError(403, "FORBIDDEN", "Insufficient permissions."),
      );
    }
    next();
  };
}
