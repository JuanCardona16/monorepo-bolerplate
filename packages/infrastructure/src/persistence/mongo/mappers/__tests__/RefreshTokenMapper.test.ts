import { describe, expect, it } from "vitest";

import { RefreshToken } from "@repo/core/authentication";

import { MongoRefreshTokenMapper } from "../RefreshTokenMapper.js";

const EXPIRES_AT = new Date("2026-06-01T00:00:00.000Z");

function makeToken(): RefreshToken {
  return new RefreshToken({
    id: "t-1",
    userUuid: "u-1",
    tokenHash: "hash-1",
    roles: ["user"],
    expiresAt: EXPIRES_AT,
    revokedAt: null,
    rememberMe: false,
  });
}

describe("MongoRefreshTokenMapper", () => {
  it("maps a mongo doc to the domain entity preserving rememberMe", () => {
    const token = MongoRefreshTokenMapper.toDomain({
      id: "t-1",
      userUuid: "u-1",
      tokenHash: "hash-1",
      roles: ["user"],
      expiresAt: EXPIRES_AT,
      revokedAt: null,
      rememberMe: false,
    });

    expect(token.id).toBe("t-1");
    expect(token.userUuid).toBe("u-1");
    expect(token.rememberMe).toBe(false);
    expect(token.isActive(new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("round-trips every field including revocation", () => {
    const token = makeToken();
    token.revoke();

    const payload = MongoRefreshTokenMapper.toPersistence(token);

    expect(payload.id).toBe("t-1");
    expect(payload.roles).toEqual(["user"]);
    expect(payload.rememberMe).toBe(false);
    expect(payload.revokedAt).toBeInstanceOf(Date);
  });
});
