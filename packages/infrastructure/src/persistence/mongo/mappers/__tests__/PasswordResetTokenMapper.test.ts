import { describe, expect, it } from "vitest";

import { PasswordResetToken } from "@repo/core/authentication";

import { MongoPasswordResetTokenMapper } from "../PasswordResetTokenMapper.js";

const EXPIRES_AT = new Date("2026-06-01T00:00:00.000Z");

describe("MongoPasswordResetTokenMapper", () => {
  it("maps a mongo doc to the domain entity", () => {
    const token = MongoPasswordResetTokenMapper.toDomain({
      id: "r-1",
      userUuid: "u-1",
      tokenHash: "hash-1",
      expiresAt: EXPIRES_AT,
      usedAt: null,
    });

    expect(token.id).toBe("r-1");
    expect(token.isActive(new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("round-trips the spent instant without moving it", () => {
    const token = new PasswordResetToken({
      id: "r-1",
      userUuid: "u-1",
      tokenHash: "hash-1",
      expiresAt: EXPIRES_AT,
      usedAt: null,
    });
    token.markUsed(new Date("2026-03-01T00:00:00.000Z"));

    const payload = MongoPasswordResetTokenMapper.toPersistence(token);

    expect(payload.usedAt).toEqual(new Date("2026-03-01T00:00:00.000Z"));
  });
});
