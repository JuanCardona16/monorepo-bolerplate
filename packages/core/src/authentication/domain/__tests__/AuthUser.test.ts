import { describe, expect, it } from "vitest";

import { InvalidRoleError } from "../errors/InvalidRoleError.js";
import { AuthUser } from "../entities/AuthUser.js";

function makeUser(roles: string[] = []): AuthUser {
  return new AuthUser({
    uuid: "e3b0c442-98fc-1c14-9afb-f4c8996fb924",
    email: "user@example.com",
    passwordHash: "$2b$10$hashedvalue",
    roles: new Set(roles),
  });
}

describe("AuthUser", () => {
  describe("constructor", () => {
    it("exposes the immutable props through getters", () => {
      const user = makeUser();

      expect(user.uuid).toBe("e3b0c442-98fc-1c14-9afb-f4c8996fb924");
      expect(user.email).toBe("user@example.com");
      expect(user.passwordHash).toBe("$2b$10$hashedvalue");
      expect(user.roles).toEqual(new Set());
    });

    it("copies the incoming roles set so later external mutation is ignored", () => {
      const roles = new Set(["user"]);
      const user = new AuthUser({
        uuid: "uuid-1",
        email: "user@example.com",
        passwordHash: "hash",
        roles,
      });

      roles.add("admin");

      expect(user.roles).toEqual(new Set(["user"]));
    });

    it("de-duplicates roles coming from props", () => {
      const user = new AuthUser({
        uuid: "uuid-1",
        email: "user@example.com",
        passwordHash: "hash",
        roles: new Set(["user", "user", "user"]),
      });

      expect(user.roles.size).toBe(1);
    });
  });

  describe("roles", () => {
    it("returns a defensive copy on every access", () => {
      const user = makeUser(["user"]);

      const first = user.roles;
      first.add("admin");

      expect(user.roles).toEqual(new Set(["user"]));
      expect(user.roles).not.toBe(first);
    });
  });

  describe("hasRole", () => {
    it("returns true for an assigned role", () => {
      const user = makeUser(["user"]);

      expect(user.hasRole("user")).toBe(true);
    });

    it("normalizes the argument through Role, so casing and padding do not matter", () => {
      const user = makeUser(["admin"]);

      expect(user.hasRole("  ADMIN  ")).toBe(true);
    });

    it("returns false for a role that was never assigned", () => {
      const user = makeUser(["user"]);

      expect(user.hasRole("admin")).toBe(false);
    });

    it("propagates InvalidRoleError for an empty role", () => {
      const user = makeUser(["user"]);

      expect(() => user.hasRole("  ")).toThrow(InvalidRoleError);
    });
  });

  describe("assignRole", () => {
    it("adds the normalized role", () => {
      const user = makeUser();

      user.assignRole("  ADMIN ");

      expect(user.hasRole("admin")).toBe(true);
      expect(user.roles).toEqual(new Set(["admin"]));
    });

    it("is idempotent for the same normalized role", () => {
      const user = makeUser();

      user.assignRole("admin");
      user.assignRole("ADMIN");

      expect(user.roles.size).toBe(1);
    });

    it("propagates InvalidRoleError and leaves the roles untouched", () => {
      const user = makeUser(["user"]);

      expect(() => user.assignRole("")).toThrow(InvalidRoleError);
      expect(user.roles).toEqual(new Set(["user"]));
    });
  });

  describe("revokeRole", () => {
    it("removes the normalized role", () => {
      const user = makeUser(["admin", "user"]);

      user.revokeRole("  ADMIN  ");

      expect(user.hasRole("admin")).toBe(false);
      expect(user.roles).toEqual(new Set(["user"]));
    });

    it("is a no-op when the role is not assigned", () => {
      const user = makeUser(["user"]);

      user.revokeRole("admin");

      expect(user.roles).toEqual(new Set(["user"]));
    });

    it("propagates InvalidRoleError and leaves the roles untouched", () => {
      const user = makeUser(["user"]);

      expect(() => user.revokeRole("   ")).toThrow(InvalidRoleError);
      expect(user.roles).toEqual(new Set(["user"]));
    });
  });
});
