import { describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { InvalidCredentialsError } from "../../../domain/errors/InvalidCredentialsError.js";
import { LoginUseCase } from "../LoginUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";
import type { IdGenerator } from "../../ports/IdGenerator.js";
import type { PasswordHasher } from "../../ports/PasswordHasher.js";
import type { RefreshTokenHasher } from "../../ports/RefreshTokenHasher.js";
import type { TokenProvider } from "../../ports/TokenProvider.js";

const USER_UUID = "user-uuid-1";
const HASH = "hashed-password";
/** sha256 of the raw token, standing in for what the real hasher returns. */
const RAW_TOKEN_HASH = "raw-token-hash";

function makeUser(): AuthUser {
  return new AuthUser({
    uuid: USER_UUID,
    email: "user@example.com",
    passwordHash: HASH,
    roles: new Set(["user"]),
  });
}

/**
 * A sequential IdGenerator. Sequential ids make the double-generate in
 * LoginUseCase observable: if the use case ever reuses one value for both the
 * row id and the raw token, these tests fail instead of hiding it.
 */
function sequentialIds(...values: string[]): IdGenerator & { calls: number } {
  let index = 0;
  return {
    calls: 0,
    generate() {
      this.calls += 1;
      const value = values[index];
      if (value === undefined) {
        throw new Error(`IdGenerator called more than ${values.length} times`);
      }
      index += 1;
      return value;
    },
  };
}

function makeAuthRepository(user: AuthUser | null = makeUser()): AuthRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findByUuid: vi.fn().mockResolvedValue(user),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRefreshTokenRepository(): RefreshTokenRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByTokenHash: vi.fn().mockResolvedValue(null),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
}

function makePasswordHasher(isValid = true): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue(HASH),
    compare: vi.fn().mockResolvedValue(isValid),
  };
}

function makeRefreshTokenHasher(): RefreshTokenHasher {
  return {
    hash: vi.fn().mockResolvedValue(RAW_TOKEN_HASH),
    verify: vi.fn().mockResolvedValue(true),
  };
}

function makeTokenProvider(): TokenProvider {
  return {
    generate: vi.fn().mockResolvedValue("access-token"),
    verify: vi.fn().mockResolvedValue({ userUuid: USER_UUID, roles: ["user"] }),
  };
}

type Deps = {
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  tokenProvider: TokenProvider;
  refreshTokenRepository: RefreshTokenRepository;
  refreshTokenHasher: RefreshTokenHasher;
  idGenerator: ReturnType<typeof sequentialIds>;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    authRepository: makeAuthRepository(),
    passwordHasher: makePasswordHasher(),
    tokenProvider: makeTokenProvider(),
    refreshTokenRepository: makeRefreshTokenRepository(),
    refreshTokenHasher: makeRefreshTokenHasher(),
    idGenerator: sequentialIds("id-1", "id-2"),
    ...overrides,
  };
}

function useCase(deps: Deps): LoginUseCase {
  return new LoginUseCase(
    deps.authRepository,
    deps.passwordHasher,
    deps.tokenProvider,
    deps.refreshTokenRepository,
    deps.refreshTokenHasher,
    deps.idGenerator,
  );
}

const validInput = { email: "user@example.com", password: "correct-horse" };

describe("LoginUseCase", () => {
  describe("on success", () => {
    it("returns the access token and the raw refresh token", async () => {
      const deps = makeDeps({ idGenerator: sequentialIds("raw-token", "row-id") });

      const result = await useCase(deps).execute(validInput);

      expect(result).toEqual({
        accessToken: "access-token",
        refreshToken: "raw-token",
      });
    });

    it("looks the user up by the validated email value", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      expect(deps.authRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
    });

    // Login must look the user up with the same canonical spelling that
    // registration stored, otherwise a user could register in one casing and
    // then be unable to log in with it. `Email` normalizes, so the lookup key
    // is the lowercase form regardless of what the caller typed.
    it("looks the user up with the normalized email", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ email: "  User@Example.COM  ", password: "correct-horse" });

      expect(deps.authRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
    });

    it("compares the password against the stored hash", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      expect(deps.passwordHasher.compare).toHaveBeenCalledWith("correct-horse", HASH);
    });

    it("persists the hashed refresh token, never the raw one", async () => {
      const deps = makeDeps({ idGenerator: sequentialIds("raw-token", "row-id") });

      await useCase(deps).execute(validInput);

      expect(deps.refreshTokenHasher.hash).toHaveBeenCalledWith("raw-token");
      const saved = vi.mocked(deps.refreshTokenRepository.save).mock.calls[0]?.[0];
      expect(saved?.tokenHash).toBe(RAW_TOKEN_HASH);
      expect(saved?.tokenHash).not.toBe("raw-token");
    });

    it("stores the row id separately from the raw token", async () => {
      const deps = makeDeps({ idGenerator: sequentialIds("raw-token", "row-id") });

      await useCase(deps).execute(validInput);

      const saved = vi.mocked(deps.refreshTokenRepository.save).mock.calls[0]?.[0];
      expect(saved?.id).toBe("row-id");
      expect(saved?.id).not.toBe("raw-token");
    });

    it("carries the user roles into the access token", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      expect(deps.tokenProvider.generate).toHaveBeenCalledWith({
        userUuid: USER_UUID,
        roles: ["user"],
      });
    });

    it("issues a refresh token that starts unrevoked and unexpired", async () => {
      const deps = makeDeps({ idGenerator: sequentialIds("raw-token", "row-id") });

      await useCase(deps).execute(validInput);

      const saved = vi.mocked(deps.refreshTokenRepository.save).mock.calls[0]?.[0];
      expect(saved?.isRevoked).toBe(false);
      expect(saved?.isActive()).toBe(true);
      expect(saved?.userUuid).toBe(USER_UUID);
    });
  });

  describe("rejections", () => {
    it("throws InvalidCredentialsError when the password is empty", async () => {
      const deps = makeDeps();

      await expect(
        useCase(deps).execute({ email: "user@example.com", password: "" }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it("does not touch the repository when the password is empty", async () => {
      const deps = makeDeps();

      await useCase(deps)
        .execute({ email: "user@example.com", password: "" })
        .catch(() => undefined);

      expect(deps.authRepository.findByEmail).not.toHaveBeenCalled();
    });

    it("throws InvalidCredentialsError when the user does not exist", async () => {
      const deps = makeDeps({ authRepository: makeAuthRepository(null) });

      await expect(useCase(deps).execute(validInput)).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it("throws InvalidCredentialsError when the password does not match", async () => {
      const deps = makeDeps({ passwordHasher: makePasswordHasher(false) });

      await expect(useCase(deps).execute(validInput)).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it("does not persist a refresh token when the password does not match", async () => {
      const deps = makeDeps({ passwordHasher: makePasswordHasher(false) });

      await useCase(deps)
        .execute(validInput)
        .catch(() => undefined);

      expect(deps.refreshTokenRepository.save).not.toHaveBeenCalled();
    });

    it("does not issue an access token when the user does not exist", async () => {
      const deps = makeDeps({ authRepository: makeAuthRepository(null) });

      await useCase(deps)
        .execute(validInput)
        .catch(() => undefined);

      expect(deps.tokenProvider.generate).not.toHaveBeenCalled();
    });
  });
});
