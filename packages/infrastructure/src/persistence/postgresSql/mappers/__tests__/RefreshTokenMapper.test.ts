import { describe, expect, it } from "vitest";

import { RefreshTokenMapper } from "../RefreshTokenMapper.js";
import type { RefreshTokenSchema } from "../../prisma/generated/prisma/client.js";

const EXPIRES_AT = new Date("2030-01-01T00:00:00.000Z");
const REVOKED_AT = new Date("2029-12-31T23:00:00.000Z");
const CREATED_AT = new Date("2029-12-01T00:00:00.000Z");
const UPDATED_AT = new Date("2029-12-02T00:00:00.000Z");

// `RefreshTokenSchema` is the Prisma model type: besides the mapped columns it
// carries `createdAt` and `updatedAt`, which the mapper ignores. They are set
// here so the row is a complete database row, and the tests state explicitly
// which fields survive the round trip.
function makeRow(overrides: Partial<RefreshTokenSchema> = {}): RefreshTokenSchema {
  return {
    id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
    userUuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
    tokenHash: "9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
    roles: ["user"],
    expiresAt: EXPIRES_AT,
    revokedAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("RefreshTokenMapper", () => {
  describe("toDomain", () => {
    it("maps the scalar columns of the row", () => {
      const token = RefreshTokenMapper.toDomain(makeRow());

      expect(token.id).toBe("3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f");
      expect(token.userUuid).toBe("0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f");
      expect(token.tokenHash).toBe("9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c");
    });

    it("maps expiresAt to a Date instance with the same instant", () => {
      const token = RefreshTokenMapper.toDomain(makeRow());

      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.expiresAt.getTime()).toBe(EXPIRES_AT.getTime());
    });

    it("keeps revokedAt null and the token active when the column is null", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ revokedAt: null }));

      expect(token.revokedAt).toBeNull();
      expect(token.isRevoked).toBe(false);
    });

    it("marks the token as revoked when the column holds a date", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ revokedAt: REVOKED_AT }));

      expect(token.revokedAt).toBeInstanceOf(Date);
      expect(token.revokedAt?.getTime()).toBe(REVOKED_AT.getTime());
      expect(token.isRevoked).toBe(true);
    });

    it("exposes the roles as a Set, keeping insertion order", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ roles: ["user", "admin"] }));

      expect(token.roles).toBeInstanceOf(Set);
      expect(Array.from(token.roles)).toEqual(["user", "admin"]);
    });

    it("produces an empty Set when the row has no roles", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ roles: [] }));

      expect(token.roles).toBeInstanceOf(Set);
      expect(token.roles.size).toBe(0);
    });
  });

  describe("toPersistence", () => {
    it("maps the entity back to a flat Prisma payload", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ roles: ["user", "admin"] }));

      expect(RefreshTokenMapper.toPersistence(token)).toEqual({
        id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
        userUuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
        tokenHash: "9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
        roles: ["user", "admin"],
        expiresAt: EXPIRES_AT,
        revokedAt: null,
      });
    });

    it("converts the roles Set into a string array", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ roles: ["user", "admin"] }));

      const payload = RefreshTokenMapper.toPersistence(token);

      expect(Array.isArray(payload.roles)).toBe(true);
      expect(payload.roles).not.toBeInstanceOf(Set);
      expect(payload.roles).toEqual(["user", "admin"]);
      expect(payload.roles).not.toBe(token.roles);
    });

    it("returns expiresAt as a Date, not a string", () => {
      const token = RefreshTokenMapper.toDomain(makeRow());

      const payload = RefreshTokenMapper.toPersistence(token);

      expect(payload.expiresAt).toBeInstanceOf(Date);
      expect(typeof payload.expiresAt).not.toBe("string");
      expect(payload.expiresAt.getTime()).toBe(EXPIRES_AT.getTime());
    });

    it("returns revokedAt as null when the token is not revoked", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ revokedAt: null }));

      const payload = RefreshTokenMapper.toPersistence(token);

      expect(payload.revokedAt).toBeNull();
    });

    it("returns revokedAt as a Date when the token is revoked", () => {
      const token = RefreshTokenMapper.toDomain(makeRow({ revokedAt: REVOKED_AT }));

      const payload = RefreshTokenMapper.toPersistence(token);

      expect(payload.revokedAt).toBeInstanceOf(Date);
      expect(payload.revokedAt?.getTime()).toBe(REVOKED_AT.getTime());
    });
  });

  describe("round trip", () => {
    it("restores every mapped field of a non revoked row", () => {
      const row = makeRow({ roles: ["user", "admin"] });

      const payload = RefreshTokenMapper.toPersistence(RefreshTokenMapper.toDomain(row));

      expect(payload).toEqual({
        id: row.id,
        userUuid: row.userUuid,
        tokenHash: row.tokenHash,
        roles: row.roles,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      });
      expect(payload.expiresAt.getTime()).toBe(row.expiresAt.getTime());
    });

    it("restores every mapped field of a revoked row", () => {
      const row = makeRow({ revokedAt: REVOKED_AT });

      const payload = RefreshTokenMapper.toPersistence(RefreshTokenMapper.toDomain(row));

      expect(payload.revokedAt).toBeInstanceOf(Date);
      expect(payload.revokedAt?.getTime()).toBe(REVOKED_AT.getTime());
      expect(payload.expiresAt.getTime()).toBe(EXPIRES_AT.getTime());
    });

    it("collapses duplicated roles because the entity stores them in a Set", () => {
      // Documented data loss: the row column is a plain string[] and may hold
      // duplicates, but the entity deduplicates them, so a round trip of such a
      // row does not reproduce the original array.
      const row = makeRow({ roles: ["user", "user"] });

      const payload = RefreshTokenMapper.toPersistence(RefreshTokenMapper.toDomain(row));

      expect(payload.roles).toEqual(["user"]);
    });

    it("drops createdAt and updatedAt: the domain entity has no place for them", () => {
      // Documented data loss: the model row carries `createdAt` / `updatedAt`
      // but the persistence payload does not include them. Prisma fills them in.
      const payload = RefreshTokenMapper.toPersistence(
        RefreshTokenMapper.toDomain(makeRow()),
      );

      expect(payload).not.toHaveProperty("createdAt");
      expect(payload).not.toHaveProperty("updatedAt");
      expect(Object.keys(payload).sort()).toEqual([
        "expiresAt",
        "id",
        "revokedAt",
        "roles",
        "tokenHash",
        "userUuid",
      ]);
    });
  });
});
