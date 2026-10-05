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
import type { RequestHandler } from "express";

import { AuthController } from "../../features/authentication/controllers/auth.controller.js";
import { createAuthorize } from "../middleware/auth/authorize.js";
import { PASSWORD_RESET_URL } from "../../config/env/index.js";
import type { AuthInfrastructure } from "./infrastructure.js";

/**
 * Feature Container de Authentication: ensambla únicamente las dependencias
 * internas del módulo a partir de infraestructura ya construida.
 *
 * Expone API mínima —controller, middleware `authorize` y casos de uso—;
 * los adapters concretos (repos, hashers, providers) no salen de acá.
 * Módulo de referencia para futuros features (`createXContainer()` igual).
 */
export interface AuthenticationContainer {
  controller: AuthController;
  authorize: RequestHandler;
  useCases: {
    login: LoginUseCase;
    register: RegisterUserUseCase;
    refresh: RefreshTokenUseCase;
    logout: LogoutUseCase;
    getProfile: GetProfileUseCase;
    changeUserRoles: ChangeUserRolesUseCase;
    requestPasswordReset: RequestPasswordResetUseCase;
    confirmPasswordReset: ConfirmPasswordResetUseCase;
  };
}

export function createAuthenticationContainer(
  infra: AuthInfrastructure,
): AuthenticationContainer {
  const login = new LoginUseCase(
    infra.authRepository,
    infra.passwordHasher,
    infra.tokenProvider,
    infra.refreshTokenRepository,
    infra.refreshTokenHasher,
    infra.idGenerator,
  );
  const register = new RegisterUserUseCase(
    infra.authRepository,
    infra.passwordHasher,
    infra.idGenerator,
  );
  const refresh = new RefreshTokenUseCase(
    infra.refreshTokenRepository,
    infra.refreshTokenHasher,
    infra.tokenProvider,
    infra.idGenerator,
  );
  const logout = new LogoutUseCase(infra.refreshTokenRepository);
  const getProfile = new GetProfileUseCase(infra.authRepository);
  const changeUserRoles = new ChangeUserRolesUseCase(
    infra.authRepository,
    infra.refreshTokenRepository,
  );
  const requestPasswordReset = new RequestPasswordResetUseCase(
    infra.authRepository,
    infra.passwordResetTokenRepository,
    infra.refreshTokenHasher,
    infra.idGenerator,
    infra.emailSender,
    PASSWORD_RESET_URL,
  );
  const confirmPasswordReset = new ConfirmPasswordResetUseCase(
    infra.authRepository,
    infra.refreshTokenRepository,
    infra.passwordResetTokenRepository,
    infra.passwordHasher,
    infra.refreshTokenHasher,
  );
  const controller = new AuthController(
    login,
    register,
    refresh,
    logout,
    getProfile,
    changeUserRoles,
    requestPasswordReset,
    confirmPasswordReset,
  );

  return {
    controller,
    authorize: createAuthorize(infra.tokenProvider),
    useCases: {
      login,
      register,
      refresh,
      logout,
      getProfile,
      changeUserRoles,
      requestPasswordReset,
      confirmPasswordReset,
    },
  };
}
