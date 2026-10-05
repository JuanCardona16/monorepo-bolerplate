import { describe, expect, it } from "vitest";

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

import { AuthController } from "../../../features/authentication/controllers/auth.controller.js";
import {
  closeContainer,
  createContainer,
  getContainer,
} from "../container.js";

/**
 * Wiring del App Composition Root, sin base de datos: construir el grafo no
 * abre conexiones (mongoose conecta aparte en `core/index.ts`), así que este
 * suite prueba ensamblaje puro. El comportamiento vive en los tests de core
 * (fakes) y en las suites HTTP (container mockeado).
 */
describe("createContainer", () => {
  it("assembles authentication with every use case behind the controller", () => {
    const { authentication } = createContainer();

    expect(authentication.useCases.login).toBeInstanceOf(LoginUseCase);
    expect(authentication.useCases.register).toBeInstanceOf(RegisterUserUseCase);
    expect(authentication.useCases.refresh).toBeInstanceOf(RefreshTokenUseCase);
    expect(authentication.useCases.logout).toBeInstanceOf(LogoutUseCase);
    expect(authentication.useCases.getProfile).toBeInstanceOf(GetProfileUseCase);
    expect(authentication.useCases.changeUserRoles).toBeInstanceOf(
      ChangeUserRolesUseCase,
    );
    expect(authentication.useCases.requestPasswordReset).toBeInstanceOf(
      RequestPasswordResetUseCase,
    );
    expect(authentication.useCases.confirmPasswordReset).toBeInstanceOf(
      ConfirmPasswordResetUseCase,
    );
    expect(authentication.controller).toBeInstanceOf(AuthController);
  });

  it("exposes a ready authorize middleware instead of the raw token provider", () => {
    const { authentication } = createContainer();

    expect(typeof authentication.authorize).toBe("function");
    expect("tokenProvider" in authentication).toBe(false);
  });

  it("keeps concrete adapters out of the public shape", () => {
    const container = createContainer();

    for (const key of [
      "authRepository",
      "refreshTokenRepository",
      "passwordHasher",
      "tokenProvider",
      "emailSender",
    ]) {
      expect(container).not.toHaveProperty(key);
      expect(container.authentication).not.toHaveProperty(key);
    }
  });
});

describe("getContainer / closeContainer", () => {
  it("returns the same instance while cached", () => {
    expect(getContainer()).toBe(getContainer());
  });

  it("close is idempotent and the next get rebuilds", async () => {
    const first = getContainer();

    await closeContainer();
    await closeContainer();

    const second = getContainer();
    expect(second).not.toBe(first);
    expect(second.authentication.controller).toBeInstanceOf(AuthController);

    await closeContainer();
  });
});
