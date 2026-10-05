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
 * Wiring del composition root, sin base de datos: construir el grafo no abre
 * conexiones (mongoose conecta aparte en `core/index.ts`), así que este suite
 * prueba ensamblaje puro. El comportamiento vive en los tests de core (fakes)
 * y en las suites HTTP (container mockeado).
 */
describe("createContainer", () => {
  it("wires every auth use case behind the controller", () => {
    const container = createContainer();

    expect(container.loginUseCase).toBeInstanceOf(LoginUseCase);
    expect(container.registerUseCase).toBeInstanceOf(RegisterUserUseCase);
    expect(container.refreshUseCase).toBeInstanceOf(RefreshTokenUseCase);
    expect(container.logoutUseCase).toBeInstanceOf(LogoutUseCase);
    expect(container.getProfileUseCase).toBeInstanceOf(GetProfileUseCase);
    expect(container.changeUserRolesUseCase).toBeInstanceOf(ChangeUserRolesUseCase);
    expect(container.requestPasswordResetUseCase).toBeInstanceOf(
      RequestPasswordResetUseCase,
    );
    expect(container.confirmPasswordResetUseCase).toBeInstanceOf(
      ConfirmPasswordResetUseCase,
    );
    expect(container.authController).toBeInstanceOf(AuthController);
  });

  it("exposes a ready authorize middleware instead of the raw token provider", () => {
    const container = createContainer();

    expect(typeof container.authorize).toBe("function");
    expect("tokenProvider" in container).toBe(false);
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
    expect(second.authController).toBeInstanceOf(AuthController);

    await closeContainer();
  });
});
