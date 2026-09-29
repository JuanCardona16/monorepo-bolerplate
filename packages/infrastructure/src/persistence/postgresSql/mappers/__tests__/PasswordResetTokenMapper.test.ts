import { describe, expect, it } from "vitest";

import { PasswordResetToken } from "@repo/core/authentication";

import { PasswordResetTokenMapper } from "../PasswordResetTokenMapper.js";

const EXPIRES_AT = new Date("2099-01-01T00:00:00.000Z");
const USED_AT = new Date("2098-06-01T10:00:00.000Z");

function makeToken(usedAt: Date | null = null): PasswordResetToken {
  return new PasswordResetToken({
    id: "row-1",
    userUuid: "user-1",
    tokenHash: "sha256:abc",
    expiresAt: EXPIRES_AT,
    usedAt,
  });
}

describe("PasswordResetTokenMapper", () => {
  describe("toDomain", () => {
    it("maps every persisted field onto the entity", () => {
      const token = PasswordResetTokenMapper.toDomain({
        id: "row-1",
        userUuid: "user-1",
        tokenHash: "sha256:abc",
        expiresAt: EXPIRES_AT,
        usedAt: USED_AT,
        createdAt: new Date("2098-01-01T00:00:00.000Z"),
        updatedAt: new Date("2098-01-02T00:00:00.000Z"),
      } as never);

      expect(token.id).toBe("row-1");
      expect(token.userUuid).toBe("user-1");
      expect(token.tokenHash).toBe("sha256:abc");
      expect(token.expiresAt).toEqual(EXPIRES_AT);
      expect(token.usedAt).toEqual(USED_AT);
    });

    it("round-trips an unused token without inventing a usedAt", () => {
      const original = makeToken();

      const restored = PasswordResetTokenMapper.toDomain(
        PasswordResetTokenMapper.toPersistence(original) as never,
      );

      expect(restored.usedAt).toBeNull();
      expect(restored.isUsed).toBe(false);
    });

    it("preserves the used state so a spent token is still spent after a reload", () => {
      const spent = PasswordResetTokenMapper.toDomain(
        PasswordResetTokenMapper.toPersistence(makeToken(USED_AT)) as never,
      );

      expect(spent.isUsed).toBe(true);
    });
  });

  describe("toPersistence", () => {
    it("emits exactly the columns the table has", () => {
      // A drift here would make Prisma write a field the schema does not
      // declare, or silently skip one it does.
      expect(Object.keys(PasswordResetTokenMapper.toPersistence(makeToken())).sort()).toEqual([
        "expiresAt",
        "id",
        "tokenHash",
        "usedAt",
        "userUuid",
      ]);
    });

    it("drops the timestamps, because the entity has nowhere to keep them", () => {
      // Same deliberate loss as the other two mappers: Prisma refills
      // `created_at`/`updated_at` on write.
      const data = PasswordResetTokenMapper.toPersistence(makeToken());

      expect(data).not.toHaveProperty("createdAt");
      expect(data).not.toHaveProperty("updatedAt");
    });

    it("carries the hash, never a raw token", () => {
      const data = PasswordResetTokenMapper.toPersistence(makeToken());

      expect(data.tokenHash).toBe("sha256:abc");
    });

    it("survives a full round trip unchanged", () => {
      const data = PasswordResetTokenMapper.toPersistence(makeToken(USED_AT));

      expect(data).toEqual({
        id: "row-1",
        userUuid: "user-1",
        tokenHash: "sha256:abc",
        expiresAt: EXPIRES_AT,
        usedAt: USED_AT,
      });
    });
  });
});
