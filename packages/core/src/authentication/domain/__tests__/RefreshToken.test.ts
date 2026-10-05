import { describe, expect, it } from "vitest";

import { InvalidRefreshTokenError } from "../errors/InvalidRefreshTokenError.js";
import { RefreshToken } from "../entities/RefreshToken.js";

const EXPIRY = new Date("2030-01-01T00:00:00.000Z");

function makeToken(overrides: Partial<ConstructorParameters<typeof RefreshToken>[0]> = {}): RefreshToken {
  return new RefreshToken({
    id: "token-id-1",
    userUuid: "user-uuid-1",
    tokenHash: "sha256-hash",
    roles: ["user"],
    expiresAt: EXPIRY,
    revokedAt: null,
    rememberMe: true,
    ...overrides,
  });
}

describe("RefreshToken", () => {
  describe("constructor", () => {
    it("exposes the props through getters", () => {
      const token = makeToken();

      expect(token.id).toBe("token-id-1");
      expect(token.userUuid).toBe("user-uuid-1");
      expect(token.tokenHash).toBe("sha256-hash");
      expect(token.roles).toEqual(new Set(["user"]));
      expect(token.expiresAt).toEqual(EXPIRY);
      expect(token.revokedAt).toBeNull();
      expect(token.isRevoked).toBe(false);
      expect(token.rememberMe).toBe(true);
    });

    it("stores a short session choice when asked", () => {
      expect(makeToken({ rememberMe: false }).rememberMe).toBe(false);
    });

    it("rejects a non-boolean session choice", () => {
      expect(() => makeToken({ rememberMe: "yes" as unknown as boolean })).toThrow(
        InvalidRefreshTokenError,
      );
    });

    it("clones dates so the caller cannot mutate internal state", () => {
      const expiresAt = new Date("2030-01-01T00:00:00.000Z");
      const token = makeToken({ expiresAt });

      expiresAt.setFullYear(1999);

      expect(token.expiresAt.toISOString()).toBe("2030-01-01T00:00:00.000Z");
      expect(token.expiresAt).not.toBe(expiresAt);
    });

    it("clones `revokedAt` when it is provided", () => {
      const revokedAt = new Date("2025-01-01T00:00:00.000Z");
      const token = makeToken({ revokedAt });

      revokedAt.setFullYear(1999);

      expect(token.revokedAt?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(token.isRevoked).toBe(true);
    });

    it("de-duplicates roles", () => {
      const token = makeToken({ roles: ["user", "user", "admin"] });

      expect(token.roles).toEqual(new Set(["user", "admin"]));
    });

    it("returns a defensive copy of the roles set", () => {
      const token = makeToken();

      token.roles.add("admin");

      expect(token.roles).toEqual(new Set(["user"]));
    });

    it("returns a defensive copy of `expiresAt` on every access", () => {
      const token = makeToken();

      token.expiresAt.setFullYear(1999);

      expect(token.expiresAt.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    });

    it.each([
      ["id", { id: "" }],
      ["userUuid", { userUuid: "" }],
      ["tokenHash", { tokenHash: "" }],
    ])("throws InvalidRefreshTokenError when %s is empty", (_field, overrides) => {
      expect(() => makeToken(overrides)).toThrow(InvalidRefreshTokenError);
      expect(() => makeToken(overrides)).toThrow(
        expect.objectContaining({ code: "INVALID_REFRESH_TOKEN" }),
      );
    });

    it("uses distinct messages per missing field", () => {
      expect(() => makeToken({ id: "" })).toThrow("Refresh token id is required.");
      expect(() => makeToken({ userUuid: "" })).toThrow("Refresh token owner is required.");
      expect(() => makeToken({ tokenHash: "" })).toThrow("Refresh token hash is required.");
    });

    it("throws when `expiresAt` is not a Date instance", () => {
      expect(() => makeToken({ expiresAt: "2030-01-01" as unknown as Date })).toThrow(
        "Refresh token expiry must be a valid date.",
      );
    });

    it("throws when `expiresAt` is an Invalid Date", () => {
      expect(() => makeToken({ expiresAt: new Date("not-a-date") })).toThrow(
        "Refresh token expiry must be a valid date.",
      );
    });

    it("throws an InvalidRefreshTokenError instance with the INVALID_REFRESH_TOKEN code", () => {
      expect(() => makeToken({ id: "" })).toThrow(
        expect.objectContaining({
          name: "InvalidRefreshTokenError",
          code: "INVALID_REFRESH_TOKEN",
        }),
      );
    });
  });

  describe("isExpired", () => {
    it("returns false before the expiry instant", () => {
      const token = makeToken();

      expect(token.isExpired(new Date("2029-12-31T23:59:59.999Z"))).toBe(false);
    });

    it("returns true at exactly the expiry instant (inclusive boundary)", () => {
      const token = makeToken();

      expect(token.isExpired(EXPIRY)).toBe(true);
    });

    it("returns true after the expiry instant", () => {
      const token = makeToken();

      expect(token.isExpired(new Date("2030-01-02T00:00:00.000Z"))).toBe(true);
    });

    it("defaults `now` to the current time", () => {
      const token = makeToken({ expiresAt: new Date("2000-01-01T00:00:00.000Z") });

      expect(token.isExpired()).toBe(true);
    });
  });

  describe("isActive", () => {
    it("is true for a non-revoked token that has not expired", () => {
      const token = makeToken();

      expect(token.isActive(new Date("2029-06-01T00:00:00.000Z"))).toBe(true);
    });

    it("is false for an expired token", () => {
      const token = makeToken();

      expect(token.isActive(new Date("2031-01-01T00:00:00.000Z"))).toBe(false);
    });

    it("is false for a revoked token even when it has not expired", () => {
      const token = makeToken();

      token.revoke();

      expect(token.isActive(new Date("2029-06-01T00:00:00.000Z"))).toBe(false);
    });
  });

  describe("revoke", () => {
    it("stamps `revokedAt` and flips `isRevoked`", () => {
      const token = makeToken();
      const before = Date.now();

      token.revoke();

      const revokedAt = token.revokedAt;
      expect(revokedAt).toBeInstanceOf(Date);
      expect(revokedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(revokedAt!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(token.isRevoked).toBe(true);
    });

    it("is not idempotent: a second call re-stamps `revokedAt`", () => {
      const token = makeToken();

      token.revoke();
      const first = token.revokedAt!.getTime();

      token.revoke();

      expect(token.isRevoked).toBe(true);
      expect(token.revokedAt!.getTime()).toBeGreaterThanOrEqual(first);
    });

    it("returns a defensive copy of `revokedAt`", () => {
      const token = makeToken();

      token.revoke();
      token.revokedAt!.setFullYear(1999);

      expect(token.isRevoked).toBe(true);
      expect(token.revokedAt!.getFullYear()).not.toBe(1999);
    });
  });
});
