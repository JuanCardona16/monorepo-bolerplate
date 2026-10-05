import { describe, expect, it } from "vitest";

import { AuthUser } from "@repo/core/authentication";

import { MongoAuthUserMapper } from "../AuthUserMapper.js";

function makeUser(): AuthUser {
  return new AuthUser({
    uuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
    email: "juan@example.com",
    passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
    roles: new Set(["user", "admin"]),
  });
}

describe("MongoAuthUserMapper", () => {
  it("maps a mongo doc to the domain entity", () => {
    const user = MongoAuthUserMapper.toDomain({
      uuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
      email: "juan@example.com",
      passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
      roles: ["user", "admin"],
    });

    expect(user.uuid).toBe("0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f");
    expect(user.email).toBe("juan@example.com");
    expect(user.roles).toEqual(new Set(["user", "admin"]));
  });

  it("collapses duplicated roles into the entity Set", () => {
    const user = MongoAuthUserMapper.toDomain({
      uuid: "u",
      email: "a@b.com",
      passwordHash: "h",
      roles: ["user", "user", "admin"],
    });

    expect(Array.from(user.roles)).toEqual(["user", "admin"]);
  });

  it("round-trips every mapped field", () => {
    const user = makeUser();

    expect(MongoAuthUserMapper.toPersistence(user)).toEqual({
      uuid: "0f5d1c8e-7b2a-4c3d-9e8f-1a2b3c4d5e6f",
      email: "juan@example.com",
      passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
      roles: ["user", "admin"],
    });
  });
});
