import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { PasswordResetToken } from "../../../domain/entities/PasswordResetToken.js";
import { InvalidResetTokenError } from "../../../domain/errors/InvalidResetTokenError.js";
import { WeakPasswordError } from "../../../domain/errors/WeakPasswordError.js";
import { ConfirmPasswordResetUseCase } from "../ConfirmPasswordResetUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { PasswordResetTokenRepository } from "../../../domain/repositories/PasswordResetTokenRepository.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";
import type { PasswordHasher } from "../../ports/PasswordHasher.js";

const RAW = "raw-token-abc";
const HASH = "sha256:raw-token-abc";
const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");

function makeUser(overrides: Partial<ConstructorParameters<typeof AuthUser>[0]> = {}): AuthUser {
  return new AuthUser({
    uuid: "user-1",
    email: "user@example.com",
    passwordHash: "$2b$10$old",
    roles: new Set(["user"]),
    ...overrides,
  });
}

function makeToken(overrides: Partial<ConstructorParameters<typeof PasswordResetToken>[0]> = {}) {
  return new PasswordResetToken({
    id: "row-1",
    userUuid: "user-1",
    tokenHash: HASH,
    expiresAt: FUTURE,
    usedAt: null,
    ...overrides,
  });
}

type Deps = {
  authRepository: AuthRepository;
  refreshTokenRepository: RefreshTokenRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  passwordHasher: PasswordHasher;
  token: PasswordResetToken | null;
  existing: AuthUser | null;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  const state: Deps = {
    authRepository: {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUuid: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    refreshTokenRepository: {
      save: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    passwordResetTokenRepository: {
      save: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    passwordHasher: {
      hash: vi.fn(async (password: string) => `$2b$10$${password}`),
      compare: vi.fn(async () => false),
    },
    token: null,
    existing: makeUser(),
    ...overrides,
  };

  vi.mocked(state.passwordResetTokenRepository.findByTokenHash).mockImplementation(
    async (tokenHash: string) =>
      state.token && state.token.tokenHash === tokenHash ? state.token : null,
  );
  vi.mocked(state.authRepository.findByUuid).mockImplementation(async (uuid: string) =>
    state.existing && state.existing.uuid === uuid ? state.existing : null,
  );
  return state;
}

function useCase(deps: Deps): ConfirmPasswordResetUseCase {
  return new ConfirmPasswordResetUseCase(
    deps.authRepository,
    deps.refreshTokenRepository,
    deps.passwordResetTokenRepository,
    deps.passwordHasher,
    { hash: async (raw: string) => `sha256:${raw}`, verify: async () => true },
  );
}

async function run(deps: Deps, password = "Str0ngPassw0rd", token = RAW) {
  return useCase(deps).execute({ token, password });
}

describe("ConfirmPasswordResetUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("token validation", () => {
    it("looks the token up by hash, not by the raw value", async () => {
      const deps = makeDeps({ token: makeToken() });

      await run(deps);

      expect(deps.passwordResetTokenRepository.findByTokenHash).toHaveBeenCalledWith(HASH);
    });

    it("rejects a blank token without querying anything", async () => {
      const deps = makeDeps({ token: makeToken() });

      await expect(run(deps, "Str0ngPassw0rd", "")).rejects.toThrow(InvalidResetTokenError);
      expect(deps.passwordResetTokenRepository.findByTokenHash).not.toHaveBeenCalled();
    });

    it("rejects an unknown token", async () => {
      const deps = makeDeps({ token: null });

      await expect(run(deps)).rejects.toThrow(InvalidResetTokenError);
      expect(deps.authRepository.update).not.toHaveBeenCalled();
    });

    it("rejects an already used token", async () => {
      const deps = makeDeps({ token: makeToken({ usedAt: PAST }) });

      await expect(run(deps)).rejects.toThrow(InvalidResetTokenError);
      expect(deps.authRepository.update).not.toHaveBeenCalled();
    });

    it("rejects an expired token", async () => {
      const deps = makeDeps({ token: makeToken({ expiresAt: PAST }) });

      await expect(run(deps)).rejects.toThrow(InvalidResetTokenError);
      expect(deps.authRepository.update).not.toHaveBeenCalled();
    });

    it("gives the same code for every way a token can be refused", async () => {
      // One code on purpose: telling a holder of a stolen link whether the
      // token was unknown, spent or expired is free reconnaissance.
      const codes = await Promise.all(
        [makeDeps({ token: null }), makeDeps({ token: makeToken({ usedAt: PAST }) }), makeDeps({ token: makeToken({ expiresAt: PAST }) })].map(
          async (deps) => {
            try {
              await run(deps);
              return null;
            } catch (error) {
              return (error as { code: string }).code;
            }
          },
        ),
      );

      expect(codes).toEqual(["INVALID_RESET_TOKEN", "INVALID_RESET_TOKEN", "INVALID_RESET_TOKEN"]);
    });
  });

  describe("password", () => {
    it("stores the new password hashed", async () => {
      const deps = makeDeps({ token: makeToken() });

      await run(deps);

      expect(deps.passwordHasher.hash).toHaveBeenCalledWith("Str0ngPassw0rd");
      const persisted = vi.mocked(deps.authRepository.update).mock.calls[0]?.[0];
      expect(persisted?.passwordHash).not.toBe("Str0ngPassw0rd");
      expect(persisted?.passwordHash).toContain("Str0ngPassw0rd");
    });

    it("rejects a weak password and writes nothing", async () => {
      const deps = makeDeps({ token: makeToken() });

      await expect(run(deps, "alllowercase")).rejects.toThrow(WeakPasswordError);
      expect(deps.authRepository.update).not.toHaveBeenCalled();
      expect(deps.passwordResetTokenRepository.save).not.toHaveBeenCalled();
      expect(deps.refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("does not burn the token when the password is rejected", async () => {
      // Otherwise the user fixes their typo, clicks the same link, and finds it
      // dead for a reason that has nothing to do with their mistake.
      const token = makeToken();
      const deps = makeDeps({ token });

      await expect(run(deps, "short")).rejects.toThrow(WeakPasswordError);

      expect(token.isUsed).toBe(false);
    });

    it("keeps the uuid, email and roles of the account", async () => {
      const deps = makeDeps({ token: makeToken() });

      const result = await run(deps);

      expect(result.uuid).toBe("user-1");
      const persisted = vi.mocked(deps.authRepository.update).mock.calls[0]?.[0];
      expect(persisted?.email).toBe("user@example.com");
      expect(persisted?.roles).toEqual(new Set(["user"]));
    });
  });

  describe("single use", () => {
    it("marks the token used and persists it", async () => {
      const token = makeToken();
      const deps = makeDeps({ token });

      await run(deps);

      expect(token.isUsed).toBe(true);
      expect(deps.passwordResetTokenRepository.save).toHaveBeenCalledWith(token);
    });

    it("refuses a second redemption of the same token", async () => {
      // The repository hands back the same instance, already spent.
      const token = makeToken();
      const deps = makeDeps({ token });

      await run(deps);

      await expect(run(deps)).rejects.toThrow(InvalidResetTokenError);
      expect(deps.authRepository.update).toHaveBeenCalledTimes(1);
    });

    it("burns every other outstanding token for the same user", async () => {
      // Two live links per account would mean a password change does not end
      // the window of the older, still-unread email.
      const deps = makeDeps({ token: makeToken() });

      await run(deps);

      expect(deps.passwordResetTokenRepository.revokeAllForUser).toHaveBeenCalledWith("user-1");
    });
  });

  describe("session revocation", () => {
    it("revokes every session of the account", async () => {
      // A password reset that leaves stolen sessions standing only locks the
      // door while the attacker keeps the key.
      const deps = makeDeps({ token: makeToken() });

      await run(deps);

      expect(deps.refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith("user-1");
    });

    it("revokes the sessions after writing the new password, not before", async () => {
      const order: string[] = [];
      const deps = makeDeps({ token: makeToken() });
      vi.mocked(deps.authRepository.update).mockImplementation(async () => {
        order.push("update");
      });
      vi.mocked(deps.refreshTokenRepository.revokeAllForUser).mockImplementation(async () => {
        order.push("revoke");
      });

      await run(deps);

      expect(order).toEqual(["update", "revoke"]);
    });
  });

  describe("orphaned token", () => {
    it("burns the token when its account no longer exists", async () => {
      const token = makeToken();
      const deps = makeDeps({ token, existing: null });

      await expect(run(deps)).rejects.toThrow(InvalidResetTokenError);

      expect(token.isUsed).toBe(true);
    });
  });
});
