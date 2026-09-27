import { Router } from "express";
import { PublicRoutes } from "../../../constants/index.js";
import { asyncHandler } from "../../../core/errors/index.js";
import { createAuthorize } from "../../../core/middleware/auth/authorize.js";
import { loginLimiter } from "../../../core/middleware/rateLimit/limiter.js";
import { validateWithZod } from "../../../core/middleware/validate/validateWithZod.js";
import { authController, tokenProvider } from "../../../core/di/container.js";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.js";

const authenticationPaths: Router = Router();
const authorize = createAuthorize(tokenProvider);

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

export default authenticationPaths;
