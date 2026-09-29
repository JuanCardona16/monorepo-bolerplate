import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { InvalidCredentialsError } from "../../../domain/errors/InvalidCredentialsError.js";
import { InvalidRoleError } from "../../../domain/errors/InvalidRoleError.js";
import { ChangeUserRolesUseCase } from "../ChangeUserRolesUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";

const TARGET_UUID = "target-uuid";

function makeUser(roles: string[] = ["user"]): AuthUser {
  return new AuthUser({
    uuid: TARGET_UUID,
    email: "target@example.com",
    passwordHash: "$2b$10$hash",
    roles: new Set(roles),
  });
}

type Deps = {
  authRepository: AuthRepository;
  refreshTokenRepository: RefreshTokenRepository;
  existing: AuthUser | null;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  const state: Deps = {
    authRepository: {
      findByEmail: vi.fn(),
      findByUuid: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    refreshTokenRepository: {
      save: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    existing: makeUser(),
    ...overrides,
  };
  vi.mocked(state.authRepository.findByUuid).mockResolvedValue(state.existing);
  return state;
}

function useCase(deps: Deps): ChangeUserRolesUseCase {
  return new ChangeUserRolesUseCase(deps.authRepository, deps.refreshTokenRepository);
}

describe("ChangeUserRolesUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the role set with exactly what was requested", async () => {
    const deps = makeDeps({ existing: makeUser(["user"]) });

    const result = await useCase(deps).execute({
      targetUserUuid: TARGET_UUID,
      roles: ["admin"],
    });

    expect(result.roles).toEqual(new Set(["admin"]));
  });

  it("removes roles that are not in the new set", async () => {
    // A merge would make a role impossible to take away, which is not a
    // permission system.
    const deps = makeDeps({ existing: makeUser(["user", "admin", "support"]) });

    await useCase(deps).execute({ targetUserUuid: TARGET_UUID, roles: ["user"] });

    expect(deps.authRepository.update).toHaveBeenCalledTimes(1);
    const persisted = vi.mocked(deps.authRepository.update).mock.calls[0]?.[0];
    expect(persisted?.roles).toEqual(new Set(["user"]));
  });

  it("can leave a user with no roles at all", async () => {
    const deps = makeDeps({ existing: makeUser(["user", "admin"]) });

    const result = await useCase(deps).execute({
      targetUserUuid: TARGET_UUID,
      roles: [],
    });

    expect(result.roles.size).toBe(0);
  });

  it("normalizes role casing and padding", async () => {
    const deps = makeDeps({ existing: makeUser(["user"]) });

    const result = await useCase(deps).execute({
      targetUserUuid: TARGET_UUID,
      roles: ["  ADMIN  "],
    });

    expect(result.roles).toEqual(new Set(["admin"]));
  });

  it("rejects a blank role with InvalidRoleError", async () => {
    const deps = makeDeps({ existing: makeUser(["user"]) });

    await expect(
      useCase(deps).execute({ targetUserUuid: TARGET_UUID, roles: ["admin", "  "] }),
    ).rejects.toThrow(InvalidRoleError);
  });

  it("persists nothing when a role is rejected", async () => {
    const deps = makeDeps({ existing: makeUser(["user"]) });

    await useCase(deps)
      .execute({ targetUserUuid: TARGET_UUID, roles: ["  "] })
      .catch(() => undefined);

    expect(deps.authRepository.update).not.toHaveBeenCalled();
  });

  it("revokes every session for the target user", async () => {
    // Refresh tokens snapshot the roles. Without revoking, a demoted user keeps
    // their old privileges until the token expires on its own.
    const deps = makeDeps({ existing: makeUser(["user", "admin"]) });

    await useCase(deps).execute({ targetUserUuid: TARGET_UUID, roles: ["user"] });

    expect(deps.refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
      TARGET_UUID,
    );
  });

  it("keeps the identity fields untouched", async () => {
    const deps = makeDeps({ existing: makeUser(["user"]) });

    const result = await useCase(deps).execute({
      targetUserUuid: TARGET_UUID,
      roles: ["admin"],
    });

    expect(result.uuid).toBe(TARGET_UUID);
    expect(result.email).toBe("target@example.com");
    expect(result.passwordHash).toBe("$2b$10$hash");
  });

  it("rejects a missing target uuid", async () => {
    const deps = makeDeps();

    await expect(
      useCase(deps).execute({ targetUserUuid: "", roles: ["admin"] }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown user without touching the repository", async () => {
    const deps = makeDeps({ existing: null });

    await expect(
      useCase(deps).execute({ targetUserUuid: TARGET_UUID, roles: ["admin"] }),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(deps.authRepository.update).not.toHaveBeenCalled();
    expect(deps.refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
  });
});
