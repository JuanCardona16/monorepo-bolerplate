import { describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { InvalidEmailError } from "../../../domain/errors/InvalidEmailError.js";
import { UserAlreadyExistsError } from "../../../domain/errors/UserAlreadyExistsError.js";
import { WeakPasswordError } from "../../../domain/errors/WeakPasswordError.js";
import { RegisterUserUseCase } from "../RegisterUserUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { IdGenerator } from "../../ports/IdGenerator.js";
import type { PasswordHasher } from "../../ports/PasswordHasher.js";

const GENERATED_UUID = "generated-uuid";
const HASH = "hashed-password";
/** Satisfies the Password policy: 8+ chars, upper, lower, and a digit. */
const VALID_PASSWORD = "CorrectHorse1";

function makeExistingUser(): AuthUser {
  return new AuthUser({
    uuid: "existing-uuid",
    email: "user@example.com",
    passwordHash: HASH,
    roles: new Set(["user"]),
  });
}

function makeAuthRepository(existing: AuthUser | null): AuthRepository & {
  saved: AuthUser[];
} {
  const saved: AuthUser[] = [];
  return {
    saved,
    findByEmail: vi.fn().mockResolvedValue(existing),
    findByUuid: vi.fn().mockResolvedValue(existing),
    save: vi.fn().mockImplementation(async (user: AuthUser) => {
      saved.push(user);
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makePasswordHasher(): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue(HASH),
    compare: vi.fn().mockResolvedValue(true),
  };
}

function makeIdGenerator(): IdGenerator {
  return { generate: vi.fn().mockReturnValue(GENERATED_UUID) };
}

type Deps = {
  authRepository: ReturnType<typeof makeAuthRepository>;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    authRepository: makeAuthRepository(null),
    passwordHasher: makePasswordHasher(),
    idGenerator: makeIdGenerator(),
    ...overrides,
  };
}

function useCase(deps: Deps): RegisterUserUseCase {
  return new RegisterUserUseCase(deps.authRepository, deps.passwordHasher, deps.idGenerator);
}

const validInput = { email: "user@example.com", password: VALID_PASSWORD };

describe("RegisterUserUseCase", () => {
  describe("on success", () => {
    it("returns the generated uuid", async () => {
      const result = await useCase(makeDeps()).execute(validInput);

      expect(result).toEqual({ uuid: GENERATED_UUID });
    });

    it("checks for an existing user before hashing anything", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      expect(deps.authRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
      expect(deps.passwordHasher.hash).toHaveBeenCalledWith(VALID_PASSWORD);
    });

    it("persists the user with the hash, never the raw password", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      const saved = deps.authRepository.saved[0];
      expect(saved?.passwordHash).toBe(HASH);
      expect(saved?.passwordHash).not.toBe(VALID_PASSWORD);
    });

    it("gives every new user the base user role and nothing else", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      const saved = deps.authRepository.saved[0];
      expect(saved?.roles).toEqual(new Set(["user"]));
      expect(saved?.hasRole("admin")).toBe(false);
    });

    it("stores the validated email and the generated uuid", async () => {
      const deps = makeDeps();

      await useCase(deps).execute(validInput);

      const saved = deps.authRepository.saved[0];
      expect(saved?.email).toBe("user@example.com");
      expect(saved?.uuid).toBe(GENERATED_UUID);
    });

    it("stores the email in its normalized form", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ ...validInput, email: "  User@Example.COM  " });

      const saved = deps.authRepository.saved[0];
      expect(saved?.email).toBe("user@example.com");
    });

    it("checks for an existing user with the normalized email", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ ...validInput, email: "USER@EXAMPLE.COM" });

      // Both the lookup and the insert have to use the same canonical spelling,
      // otherwise the uniqueness check runs against a value that was never stored.
      expect(deps.authRepository.findByEmail).toHaveBeenCalledWith("user@example.com");
    });

    it("never returns the password or the hash in the output", async () => {
      const result = await useCase(makeDeps()).execute(validInput);

      expect(Object.keys(result)).toEqual(["uuid"]);
    });
  });

  describe("rejections", () => {
    it("throws UserAlreadyExistsError when the email is taken", async () => {
      const deps = makeDeps({ authRepository: makeAuthRepository(makeExistingUser()) });

      await expect(useCase(deps).execute(validInput)).rejects.toThrow(
        UserAlreadyExistsError,
      );
    });

    it("does not hash or persist when the email is taken", async () => {
      const deps = makeDeps({ authRepository: makeAuthRepository(makeExistingUser()) });

      await useCase(deps)
        .execute(validInput)
        .catch(() => undefined);

      expect(deps.passwordHasher.hash).not.toHaveBeenCalled();
      expect(deps.authRepository.save).not.toHaveBeenCalled();
      expect(deps.authRepository.saved).toHaveLength(0);
    });

    it("generates no uuid when the email is taken", async () => {
      const deps = makeDeps({ authRepository: makeAuthRepository(makeExistingUser()) });

      await useCase(deps)
        .execute(validInput)
        .catch(() => undefined);

      expect(deps.idGenerator.generate).not.toHaveBeenCalled();
    });

    it("propagates WeakPasswordError for a password below the policy", async () => {
      const deps = makeDeps();

      await expect(
        useCase(deps).execute({ email: "user@example.com", password: "short" }),
      ).rejects.toThrow(WeakPasswordError);
    });

    it("does not query the repository for a weak password", async () => {
      const deps = makeDeps();

      await useCase(deps)
        .execute({ email: "user@example.com", password: "short" })
        .catch(() => undefined);

      expect(deps.authRepository.findByEmail).not.toHaveBeenCalled();
    });

    it("propagates InvalidEmailError for a malformed email", async () => {
      const deps = makeDeps();

      await expect(
        useCase(deps).execute({ email: "not-an-email", password: VALID_PASSWORD }),
      ).rejects.toThrow(InvalidEmailError);
    });
  });
});
