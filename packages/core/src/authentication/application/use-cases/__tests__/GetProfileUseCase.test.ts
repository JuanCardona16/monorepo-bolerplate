import { describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { InvalidCredentialsError } from "../../../domain/errors/InvalidCredentialsError.js";
import { GetProfileUseCase } from "../GetProfileUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";

const USER_UUID = "user-uuid-1";

function makeUser(): AuthUser {
  return new AuthUser({
    uuid: USER_UUID,
    email: "user@example.com",
    passwordHash: "hashed-password",
    roles: new Set(["user", "admin"]),
  });
}

function makeAuthRepository(user: AuthUser | null = makeUser()): AuthRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findByUuid: vi.fn().mockResolvedValue(user),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe("GetProfileUseCase", () => {
  describe("on success", () => {
    it("returns the uuid, email and roles", async () => {
      const useCase = new GetProfileUseCase(makeAuthRepository());

      const result = await useCase.execute(USER_UUID);

      expect(result).toEqual({
        uuid: USER_UUID,
        email: "user@example.com",
        roles: ["user", "admin"],
      });
    });

    it("looks the user up by uuid", async () => {
      const repository = makeAuthRepository();

      await new GetProfileUseCase(repository).execute(USER_UUID);

      expect(repository.findByUuid).toHaveBeenCalledWith(USER_UUID);
    });

    it("returns the roles as an array, not a Set", async () => {
      const result = await new GetProfileUseCase(makeAuthRepository()).execute(USER_UUID);

      expect(Array.isArray(result.roles)).toBe(true);
    });

    it("never leaks the password hash to the caller", async () => {
      const result = await new GetProfileUseCase(makeAuthRepository()).execute(USER_UUID);

      expect(Object.keys(result).sort()).toEqual(["email", "roles", "uuid"]);
      expect(JSON.stringify(result)).not.toContain("hashed-password");
    });
  });

  describe("rejections", () => {
    it("throws InvalidCredentialsError when the uuid is missing", async () => {
      const repository = makeAuthRepository();

      await expect(new GetProfileUseCase(repository).execute("")).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it("does not query the repository when the uuid is missing", async () => {
      const repository = makeAuthRepository();

      await new GetProfileUseCase(repository)
        .execute("")
        .catch(() => undefined);

      expect(repository.findByUuid).not.toHaveBeenCalled();
    });

    it("throws InvalidCredentialsError when the user does not exist", async () => {
      const useCase = new GetProfileUseCase(makeAuthRepository(null));

      await expect(useCase.execute(USER_UUID)).rejects.toThrow(InvalidCredentialsError);
    });
  });
});
