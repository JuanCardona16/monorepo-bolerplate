import { describe, expect, it } from "vitest";

import { AuthUserMapper } from "../AuthUserMapper.js";
import type { AuthUserSchema } from "../../prisma/generated/prisma/client.js";

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-02-02T00:00:00.000Z");

// `AuthUserSchema` is the Prisma model type: it also carries `createdAt` and
// `updatedAt`, which the mapper ignores. They are included here so the row fed
// to the mapper is a complete, realistic database row; every assertion below
// then states explicitly which fields the mapper keeps and which it drops.
function makeRow(overrides: Partial<AuthUserSchema> = {}): AuthUserSchema {
  return {
    uuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
    email: "juan@example.com",
    passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
    roles: ["user", "admin"],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("AuthUserMapper", () => {
  describe("toDomain", () => {
    it("maps the scalar columns of the row", () => {
      const user = AuthUserMapper.toDomain(makeRow());

      expect(user.uuid).toBe("0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f");
      expect(user.email).toBe("juan@example.com");
    });

    it("converts the roles array into a Set, keeping insertion order", () => {
      const user = AuthUserMapper.toDomain(makeRow({ roles: ["user", "admin"] }));

      expect(user.roles).toBeInstanceOf(Set);
      expect(user.roles).toEqual(new Set(["user", "admin"]));
      expect(Array.from(user.roles)).toEqual(["user", "admin"]);
    });

    it("produces an empty Set when the row has no roles", () => {
      const user = AuthUserMapper.toDomain(makeRow({ roles: [] }));

      expect(user.roles).toBeInstanceOf(Set);
      expect(user.roles.size).toBe(0);
    });

    it("collapses duplicated roles because the entity stores them in a Set", () => {
      // Documented behaviour: the row can hold duplicates but the domain entity
      // deduplicates them, so a round trip is lossy for repeated roles.
      const user = AuthUserMapper.toDomain(makeRow({ roles: ["user", "user", "admin"] }));

      expect(Array.from(user.roles)).toEqual(["user", "admin"]);
    });

    it("passes the password hash through untouched", () => {
      const passwordHash = "$2b$12$abcdefghijklmnopqrstuv";

      const user = AuthUserMapper.toDomain(makeRow({ passwordHash }));

      expect(user.passwordHash).toBe(passwordHash);
    });
  });

  describe("toPersistence", () => {
    it("maps the entity back to a flat Prisma payload", () => {
      const user = AuthUserMapper.toDomain(makeRow());

      expect(AuthUserMapper.toPersistence(user)).toEqual({
        uuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
        email: "juan@example.com",
        passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
        roles: ["user", "admin"],
      });
    });

    it("converts the roles Set into a string array", () => {
      const user = AuthUserMapper.toDomain(makeRow({ roles: ["user", "admin"] }));

      const payload = AuthUserMapper.toPersistence(user);

      expect(Array.isArray(payload.roles)).toBe(true);
      expect(payload.roles).not.toBeInstanceOf(Set);
      expect(payload.roles).toEqual(["user", "admin"]);
    });

    it("returns an empty array when the entity has no roles", () => {
      const user = AuthUserMapper.toDomain(makeRow({ roles: [] }));

      expect(AuthUserMapper.toPersistence(user).roles).toEqual([]);
    });

    it("passes the password hash through untouched", () => {
      const passwordHash = "$2b$12$abcdefghijklmnopqrstuv";

      const user = AuthUserMapper.toDomain(makeRow({ passwordHash }));
      const payload = AuthUserMapper.toPersistence(user);

      expect(payload.passwordHash).toBe(passwordHash);
    });

    it("does not share the roles array with the entity Set", () => {
      const user = AuthUserMapper.toDomain(makeRow());

      const payload = AuthUserMapper.toPersistence(user);

      // The payload owns a new array, so mutating it cannot corrupt the entity.
      expect(payload.roles).not.toBe(user.roles);
    });
  });

  describe("round trip", () => {
    it("restores every mapped field of the original row", () => {
      const row = makeRow();

      expect(AuthUserMapper.toPersistence(AuthUserMapper.toDomain(row))).toEqual({
        uuid: row.uuid,
        email: row.email,
        passwordHash: row.passwordHash,
        roles: row.roles,
      });
    });

    it("drops createdAt and updatedAt: the domain entity has no place for them", () => {
      // Documented data loss: the model row carries `createdAt` / `updatedAt`
      // but the persistence payload does not include them, so a read followed by
      // a write loses both timestamps. Prisma fills them in on write.
      const row = makeRow();

      const payload = AuthUserMapper.toPersistence(AuthUserMapper.toDomain(row));

      expect(payload).not.toHaveProperty("createdAt");
      expect(payload).not.toHaveProperty("updatedAt");
      expect(Object.keys(payload).sort()).toEqual([
        "email",
        "passwordHash",
        "roles",
        "uuid",
      ]);
    });
  });
});
