import { describe, expect, it, vi } from "vitest";

import { RefreshToken } from "../../../domain/entities/RefreshToken.js";
import { InvalidRefreshTokenError } from "../../../domain/errors/InvalidRefreshTokenError.js";
import { RefreshTokenUseCase } from "../RefreshTokenUseCase.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";
import type { IdGenerator } from "../../ports/IdGenerator.js";
import type { RefreshTokenHasher } from "../../ports/RefreshTokenHasher.js";
import type { TokenProvider } from "../../ports/TokenProvider.js";
import {
  LONG_SESSION_TTL_MS,
  SHORT_SESSION_TTL_MS,
} from "../../sessionLifetimes.js";

const USER_UUID = "user-uuid-1";
const STORED_HASH = "stored-token-hash";
const NEW_TOKEN_HASH = "new-token-hash";

function makeStoredToken(overrides: Partial<{ revokedAt: Date | null; expiresAt: Date; rememberMe: boolean }> = {}): RefreshToken {
  return new RefreshToken({
    id: "stored-id",
    userUuid: USER_UUID,
    tokenHash: STORED_HASH,
    roles: ["user"],
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    revokedAt: overrides.revokedAt ?? null,
    rememberMe: overrides.rememberMe ?? true,
  });
}

function sequentialIds(...values: string[]): IdGenerator {
  let index = 0;
  return {
    generate() {
      const value = values[index];
      if (value === undefined) {
        throw new Error(`IdGenerator called more than ${values.length} times`);
      }
      index += 1;
      return value;
    },
  };
}

function makeRefreshTokenRepository(
  stored: RefreshToken | null = makeStoredToken(),
): RefreshTokenRepository & { saved: RefreshToken[] } {
  const saved: RefreshToken[] = [];
  return {
    saved,
    save: vi.fn().mockImplementation(async (token: RefreshToken) => {
      saved.push(token);
    }),
    findByTokenHash: vi.fn().mockResolvedValue(stored),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRefreshTokenHasher(): RefreshTokenHasher {
  return {
    hash: vi.fn().mockResolvedValue(NEW_TOKEN_HASH),
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
  refreshTokenRepository: ReturnType<typeof makeRefreshTokenRepository>;
  refreshTokenHasher: RefreshTokenHasher;
  tokenProvider: TokenProvider;
  idGenerator: IdGenerator;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    refreshTokenRepository: makeRefreshTokenRepository(),
    refreshTokenHasher: makeRefreshTokenHasher(),
    tokenProvider: makeTokenProvider(),
    idGenerator: sequentialIds("raw-token", "row-id"),
    ...overrides,
  };
}

function useCase(deps: Deps): RefreshTokenUseCase {
  return new RefreshTokenUseCase(
    deps.refreshTokenRepository,
    deps.refreshTokenHasher,
    deps.tokenProvider,
    deps.idGenerator,
  );
}

describe("RefreshTokenUseCase", () => {
  describe("on success", () => {
    it("returns a new access token and a new raw refresh token", async () => {
      const result = await useCase(makeDeps()).execute({ refreshToken: "raw-token" });

      expect(result).toEqual({ accessToken: "access-token", refreshToken: "raw-token", rememberMe: true });
    });

    it("hashes the presented token before looking it up", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ refreshToken: "presented-token" });

      expect(deps.refreshTokenHasher.hash).toHaveBeenCalledWith("presented-token");
      expect(deps.refreshTokenRepository.findByTokenHash).toHaveBeenCalledWith(NEW_TOKEN_HASH);
    });

    it("rotates: revokes the presented token and saves it", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ refreshToken: "raw-token" });

      const firstSave = deps.refreshTokenRepository.saved[0];
      expect(firstSave?.id).toBe("stored-id");
      expect(firstSave?.isRevoked).toBe(true);
    });

    it("persists the rotated token with its own id and a fresh hash", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ refreshToken: "raw-token" });

      expect(deps.refreshTokenRepository.saved).toHaveLength(2);
      const rotated = deps.refreshTokenRepository.saved[1];
      expect(rotated?.id).toBe("row-id");
      expect(rotated?.tokenHash).toBe(NEW_TOKEN_HASH);
      expect(rotated?.isRevoked).toBe(false);
      expect(rotated?.isActive()).toBe(true);
    });

    it("carries the roles of the stored token into the new access token", async () => {
      const deps = makeDeps();

      await useCase(deps).execute({ refreshToken: "raw-token" });

      expect(deps.tokenProvider.generate).toHaveBeenCalledWith({
        userUuid: USER_UUID,
        roles: ["user"],
      });
    });

    it("does not revoke every session during a normal rotation", async () => {
      // Deliberate design: a normal rotation retires only the token that was
      // presented. Wiping all sessions is reserved for the replay path below.
      // Pinned so that "just revoke everything" cannot land unnoticed.
      const deps = makeDeps();

      await useCase(deps).execute({ refreshToken: "raw-token" });

      expect(deps.refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe("rejections", () => {
    it("throws InvalidRefreshTokenError when no token is presented", async () => {
      const deps = makeDeps();

      await expect(useCase(deps).execute({ refreshToken: "" })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it("does not query the repository when no token is presented", async () => {
      const deps = makeDeps();

      await useCase(deps)
        .execute({ refreshToken: "" })
        .catch(() => undefined);

      expect(deps.refreshTokenRepository.findByTokenHash).not.toHaveBeenCalled();
    });

    it("throws InvalidRefreshTokenError when the token is unknown", async () => {
      const deps = makeDeps({ refreshTokenRepository: makeRefreshTokenRepository(null) });

      await expect(useCase(deps).execute({ refreshToken: "raw-token" })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it("throws InvalidRefreshTokenError when the token is expired", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
        ),
      });

      await expect(useCase(deps).execute({ refreshToken: "raw-token" })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it("saves nothing when the token is expired", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
        ),
      });

      await useCase(deps)
        .execute({ refreshToken: "raw-token" })
        .catch(() => undefined);

      expect(deps.refreshTokenRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("remember-me propagation", () => {
    it("rotates a short session into a short session", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ rememberMe: false }),
        ),
      });
      const before = Date.now();

      const result = await useCase(deps).execute({ refreshToken: "raw-token" });

      const rotated = deps.refreshTokenRepository.saved[1];
      expect(result.rememberMe).toBe(false);
      expect(rotated?.rememberMe).toBe(false);
      expect(rotated?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SHORT_SESSION_TTL_MS);
      expect(rotated?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SHORT_SESSION_TTL_MS);
    });

    it("rotates a long session into a long session", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ rememberMe: true }),
        ),
      });
      const before = Date.now();

      const result = await useCase(deps).execute({ refreshToken: "raw-token" });

      const rotated = deps.refreshTokenRepository.saved[1];
      expect(result.rememberMe).toBe(true);
      expect(rotated?.rememberMe).toBe(true);
      expect(rotated?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + LONG_SESSION_TTL_MS);
      expect(rotated?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + LONG_SESSION_TTL_MS);
    });
  });

  describe("replay detection", () => {
    it("throws InvalidRefreshTokenError when the token was already used", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ revokedAt: new Date() }),
        ),
      });

      await expect(useCase(deps).execute({ refreshToken: "raw-token" })).rejects.toThrow(
        InvalidRefreshTokenError,
      );
    });

    it("wipes every session for the user when a revoked token is replayed", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ revokedAt: new Date() }),
        ),
      });

      await useCase(deps)
        .execute({ refreshToken: "raw-token" })
        .catch(() => undefined);

      expect(deps.refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(USER_UUID);
    });

    it("issues no new token on replay", async () => {
      const deps = makeDeps({
        refreshTokenRepository: makeRefreshTokenRepository(
          makeStoredToken({ revokedAt: new Date() }),
        ),
      });

      await useCase(deps)
        .execute({ refreshToken: "raw-token" })
        .catch(() => undefined);

      expect(deps.tokenProvider.generate).not.toHaveBeenCalled();
      expect(deps.refreshTokenRepository.save).not.toHaveBeenCalled();
    });
  });
});
