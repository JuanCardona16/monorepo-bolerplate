import { Router } from "express";
import { AdminRoutes, PrivateRoutes, PublicRoutes } from "../../../constants/index.js";
import { asyncHandler } from "../../../core/errors/index.js";
import { createAuthorize } from "../../../core/middleware/auth/authorize.js";
import { requireRole } from "../../../core/middleware/auth/requireRole.js";
import {
  forgotPasswordLimiter,
  loginLimiter,
  resetPasswordLimiter,
} from "../../../core/middleware/rateLimit/limiter.js";
import { validateWithZod } from "../../../core/middleware/validate/validateWithZod.js";
import { getContainer } from "../../../core/di/container.js";
import {
  changeRolesSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../schemas/auth.schemas.js";

const authenticationPaths: Router = Router();
const { authController, tokenProvider } = getContainer();
const authorize = createAuthorize(tokenProvider);
const ADMIN_ROLE = "admin";

authenticationPaths.post(
  PublicRoutes.REGISTER,
  validateWithZod(registerSchema, "body"),
  asyncHandler(authController.register),
);

authenticationPaths.post(
  PublicRoutes.LOGIN,
  loginLimiter,
  validateWithZod(loginSchema, "body"),
  asyncHandler(authController.login),
);

authenticationPaths.post(PublicRoutes.REFRESH, asyncHandler(authController.refresh));

// Both reset routes are public, obviously: the whole point is to reach them
// without a session, the one thing the person using them has lost.
//
// The limiter runs BEFORE the schema, on purpose. A validation failure still
// costs the caller nothing, and validating first would let an attacker probe
// the endpoint for free while only real payloads get counted.
authenticationPaths.post(
  PublicRoutes.FORGOT_PASSWORD,
  forgotPasswordLimiter,
  validateWithZod(forgotPasswordSchema, "body"),
  asyncHandler(authController.forgotPassword),
);

authenticationPaths.post(
  PublicRoutes.RESET_PASSWORD,
  resetPasswordLimiter,
  validateWithZod(resetPasswordSchema, "body"),
  asyncHandler(authController.resetPassword),
);

authenticationPaths.post(
  PublicRoutes.LOGOUT,
  authorize,
  asyncHandler(authController.logout),
);

authenticationPaths.get(
  PrivateRoutes.ME,
  authorize,
  asyncHandler(authController.me),
);

// Role changes are admin-only. `requireRole` must run AFTER `authorize`, since
// it reads the roles that `authorize` puts on the request.
authenticationPaths.put(
  `${PrivateRoutes.USERS}${AdminRoutes.CHANGE_USER_ROLES}`,
  authorize,
  requireRole(ADMIN_ROLE),
  validateWithZod(changeRolesSchema, "body"),
  asyncHandler(authController.changeUserRoles),
);

export default authenticationPaths;
