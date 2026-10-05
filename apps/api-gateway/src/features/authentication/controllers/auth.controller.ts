import {
  ChangeUserRolesUseCase,
  ConfirmPasswordResetUseCase,
  GetProfileUseCase,
  LoginUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
  RegisterUserUseCase,
  RequestPasswordResetUseCase,
} from "@repo/core/authentication";
import { NextFunction, Request, Response } from "express";
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_MS,
  REFRESH_COOKIE_PATH,
  REFRESH_COOKIE_SHORT_MAX_AGE_MS,
} from "../../../constants/index.js";
import { HttpError } from "../../../core/errors/HttpError.js";
import {
  REFRESH_COOKIE_SAME_SITE,
  REFRESH_COOKIE_SECURE,
} from "../../../config/env/index.js";
import { AuthenticatedRequest } from "../../../core/middleware/auth/authorize.js";

const refreshCookieBase = {
  httpOnly: true,
  // `SameSite=strict` never sends the cookie on a cross-site request, which
  // breaks the refresh flow as soon as the API is not same-site with the web
  // app. `lax` still blocks the cross-site POSTs CSRF depends on.
  secure: REFRESH_COOKIE_SECURE,
  sameSite: REFRESH_COOKIE_SAME_SITE,
  path: REFRESH_COOKIE_PATH,
};

// The cookie lifetime follows the session choice the domain resolved, never
// the raw request flag: the use case normalizes absent to false, and rotation
// echoes the stored flag so a short session cannot self-upgrade to 30 days.
function refreshCookieOptions(rememberMe: boolean) {
  return {
    ...refreshCookieBase,
    maxAge: rememberMe ? REFRESH_COOKIE_MAX_AGE_MS : REFRESH_COOKIE_SHORT_MAX_AGE_MS,
  };
}

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly changeUserRolesUseCase: ChangeUserRolesUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly confirmPasswordResetUseCase: ConfirmPasswordResetUseCase,
  ) {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
    this.me = this.me.bind(this);
    this.changeUserRoles = this.changeUserRoles.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
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
      rememberMe: req.body.rememberMe === true,
    });
    res
      .cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.rememberMe))
      .status(200)
      .json({ success: true, data: { accessToken: result.accessToken } });
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      return next(new HttpError(401, "UNAUTHORIZED", "Not authorized."));
    }
    try {
      const result = await this.refreshUseCase.execute({ refreshToken: raw });
      res
        .cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.rememberMe))
        .status(200)
        .json({ success: true, data: { accessToken: result.accessToken } });
    } catch (error) {
      // A rejected refresh means the cookie is dead: expired, revoked, or
      // replayed. Leaving it in the browser means the client retries it on
      // every page load and fails every time. Clear it so the next visit
      // starts clean instead of replaying a token the server already rejected.
      res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      throw error;
    }
  }

  async logout(req: Request, res: Response, _next: NextFunction) {
    const user = (req as AuthenticatedRequest).user;
    if (user) {
      await this.logoutUseCase.execute(user.uuid);
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH }).status(204).send();
  }

  /**
   * Always the same status and the same body, whether or not the account
   * exists.
   *
   * The message is written as "if an account exists" rather than "we sent you
   * an email", because the second one is a lie for every unregistered address
   * and a confirmation for every registered one. A caller that learns whether
   * an address has an account can enumerate the whole user table, so the
   * response cannot vary for any reason. The copy deliberately does not promise
   * an email either: the honest version of "no leaks" is refusing to say.
   */
  async forgotPassword(req: Request, res: Response, _next: NextFunction) {
    await this.requestPasswordResetUseCase.execute({ email: req.body.email });
    res.status(202).json({
      success: true,
      data: {
        message: "If an account exists for that address, a password reset link is on its way.",
      },
    });
  }

  async resetPassword(req: Request, res: Response, _next: NextFunction) {
    const result = await this.confirmPasswordResetUseCase.execute({
      token: req.body.token,
      password: req.body.password,
    });
    res.status(200).json({ success: true, data: result });
  }

  async me(req: Request, res: Response, _next: NextFunction) {
    const user = (req as AuthenticatedRequest).user;
    const profile = await this.getProfileUseCase.execute(user?.uuid ?? "");
    res.status(200).json({ success: true, data: profile });
  }

  async changeUserRoles(req: Request, res: Response, _next: NextFunction) {
    // `req.params` is typed as `string | string[]` because Express cannot know
    // whether a segment repeats. A path parameter here never does, so take the
    // first value rather than casting the whole thing away.
    const rawUuid = req.params.uuid;
    const targetUserUuid = Array.isArray(rawUuid) ? (rawUuid[0] ?? "") : (rawUuid ?? "");

    const updated = await this.changeUserRolesUseCase.execute({
      targetUserUuid,
      roles: (req.body?.roles ?? []) as string[],
    });
    res.status(200).json({
      success: true,
      data: { uuid: updated.uuid, email: updated.email, roles: Array.from(updated.roles) },
    });
  }
}
