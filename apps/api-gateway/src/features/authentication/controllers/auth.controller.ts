import {
  GetProfileUseCase,
  LoginUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
  RegisterUserUseCase,
} from "@repo/core/authentication";
import { NextFunction, Request, Response } from "express";
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_PATH,
} from "../../../constants/index.js";
import { HttpError } from "../../../core/errors/HttpError.js";
import { AuthenticatedRequest } from "../../../core/middleware/auth/authorize.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: REFRESH_COOKIE_PATH,
};

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getProfileUseCase: GetProfileUseCase,
  ) {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
    this.me = this.me.bind(this);
  }

  async register(req: Request, res: Response, _next: NextFunction) {
    const result = await this.registerUseCase.execute({
      email: req.body.email,
      password: req.body.password,
    });
    res.status(201).json({ success: true, data: result });
  }

  async login(req: Request, res: Response, _next: NextFunction) {
    const result = await this.loginUseCase.execute({
      email: req.body.email,
      password: req.body.password,
    });
    res
      .cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions)
      .status(200)
      .json({ success: true, data: { accessToken: result.accessToken } });
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
    }
    const result = await this.refreshUseCase.execute({ refreshToken: raw });
    res
      .cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions)
      .status(200)
      .json({ success: true, data: { accessToken: result.accessToken } });
  }

  async logout(req: Request, res: Response, _next: NextFunction) {
    const user = (req as AuthenticatedRequest).user;
    if (user) {
      await this.logoutUseCase.execute(user.uuid);
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH }).status(204).send();
  }

  async me(req: Request, res: Response, _next: NextFunction) {
    const user = (req as AuthenticatedRequest).user;
    const profile = await this.getProfileUseCase.execute(user?.uuid ?? "");
    res.status(200).json({ success: true, data: profile });
  }
}
