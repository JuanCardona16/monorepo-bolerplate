import { Router } from "express";
import { AdminRoutes, PrivateRoutes, PublicRoutes } from "../../../constants/index.js";
import { asyncHandler } from "../../../core/errors/index.js";
import { createAuthorize } from "../../../core/middleware/auth/authorize.js";
import { requireRole } from "../../../core/middleware/auth/requireRole.js";
import { loginLimiter } from "../../../core/middleware/rateLimit/limiter.js";
import { validateWithZod } from "../../../core/middleware/validate/validateWithZod.js";
import { getContainer } from "../../../core/di/container.js";
import { changeRolesSchema, loginSchema, registerSchema } from "../schemas/auth.schemas.js";

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
