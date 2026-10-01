import { describe, expect, it } from "vitest";

import { PasswordResetToken } from "../entities/PasswordResetToken.js";
import { InvalidResetTokenError } from "../errors/InvalidResetTokenError.js";

const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");
const MIDDLE = new Date("2050-01-01T00:00:00.000Z");

function makeToken(overrides: Partial<ConstructorParameters<typeof PasswordResetToken>[0]> = {}) {
  return new PasswordResetToken({
    id: "token-1",
    userUuid: "user-1",
    tokenHash: "hash-1",
    expiresAt: FUTURE,
    usedAt: null,
    ...overrides,
  });
}

describe("PasswordResetToken", () => {
  it("carries the values it was built with", () => {
    const token = makeToken();

    expect(token.id).toBe("token-1");
    expect(token.userUuid).toBe("user-1");
    expect(token.tokenHash).toBe("hash-1");
    expect(token.expiresAt).toEqual(FUTURE);
    expect(token.usedAt).toBeNull();
  });

  it("only ever holds a hash, never a raw token", () => {
    // There is no field for a raw token on purpose. If one is ever added, this
    // test is the reminder that it would end up in the database.
    expect(Object.keys(makeToken()).sort()).toEqual(
      ["_expiresAt", "_id", "_tokenHash", "_usedAt", "_userUuid"].sort(),
    );
  });

  it("rejects a missing id", () => {
    expect(() => makeToken({ id: "" })).toThrow(InvalidResetTokenError);
  });

  it("rejects a missing owner", () => {
    expect(() => makeToken({ userUuid: "" })).toThrow(InvalidResetTokenError);
  });

  it("rejects a missing hash, because an unhashed token must never be stored", () => {
    expect(() => makeToken({ tokenHash: "" })).toThrow(InvalidResetTokenError);
  });

  it("rejects a non-date expiry", () => {
    expect(() => makeToken({ expiresAt: "2099-01-01" as unknown as Date })).toThrow(
      InvalidResetTokenError,
    );
  });

  it("rejects an invalid date", () => {
    expect(() => makeToken({ expiresAt: new Date("nope") })).toThrow(InvalidResetTokenError);
  });

  describe("isExpired", () => {
    it("is false before the expiry instant", () => {
      expect(makeToken().isExpired(MIDDLE)).toBe(false);
    });

    it("is true at the expiry instant itself", () => {
      // `>=` and not `>`: at the exact millisecond the token is dead, otherwise
      // a one-millisecond window of validity would be an off-by-one waiting to
      // be argued about.
      expect(makeToken().isExpired(FUTURE)).toBe(true);
    });

    it("is true after the expiry instant", () => {
      expect(makeToken().isExpired(new Date("2100-01-01T00:00:00.000Z"))).toBe(true);
    });

    it("defaults to the current time", () => {
      expect(makeToken({ expiresAt: new Date(Date.now() - 1000) }).isExpired()).toBe(true);
    });
  });

  describe("isUsed", () => {
    it("is false for a fresh token", () => {
      expect(makeToken().isUsed).toBe(false);
    });

    it("is true once the token carries a usedAt", () => {
      expect(makeToken({ usedAt: PAST }).isUsed).toBe(true);
    });

    it("becomes true after markUsed", () => {
      const token = makeToken();

      token.markUsed(MIDDLE);

      expect(token.isUsed).toBe(true);
      expect(token.usedAt).toEqual(MIDDLE);
    });

    it("keeps the original timestamp when a spent token is marked again", () => {
      // Moving `used_at` forward on a replay would erase the only forensic
      // trace of when the credential was actually used.
      const token = makeToken({ usedAt: PAST });

      token.markUsed(MIDDLE);

      expect(token.usedAt).toEqual(PAST);
    });
  });

  describe("isActive", () => {
    it("is true for a fresh token inside its window", () => {
      expect(makeToken().isActive(MIDDLE)).toBe(true);
    });

    it("is false for an expired token even when unused", () => {
      expect(makeToken({ expiresAt: PAST }).isActive(MIDDLE)).toBe(false);
    });

    it("is false for a used token even inside its window", () => {
      expect(makeToken({ usedAt: PAST }).isActive(MIDDLE)).toBe(false);
    });
  });

  it("copies the dates it is handed instead of aliasing them", () => {
    const expiresAt = new Date(FUTURE);
    const usedAt = new Date(PAST);

    const token = makeToken({ expiresAt, usedAt });

    expiresAt.setUTCFullYear(3000);
    usedAt.setUTCFullYear(3000);

    expect(token.expiresAt).toEqual(FUTURE);
    expect(token.usedAt).toEqual(PAST);
  });
});
