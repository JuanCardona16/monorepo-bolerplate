import { describe, expect, it } from "vitest";

import { InvalidRoleError } from "../errors/InvalidRoleError.js";
import { Role } from "../value-objects/Role.js";

describe("Role", () => {
  describe("constructor", () => {
    it("trims and lowercases the value", () => {
      const role = new Role("  ADMIN  ");

      expect(role.value).toBe("admin");
    });

    it.each([
      ["  Admin ", "admin"],
      ["USER", "user"],
      ["MoDeRaToR", "moderator"],
      ["a", "a"],
    ])("normalizes %j to %j", (input, expected) => {
      expect(new Role(input).value).toBe(expected);
    });

    it.each([
      ["empty string", ""],
      ["only spaces", "     "],
      ["only tabs and newlines", "\t\n"],
    ])("throws InvalidRoleError for %s", (_label, value) => {
      expect(() => new Role(value)).toThrow(InvalidRoleError);
    });

    it("throws with the INVALID_ROLE code and a descriptive message", () => {
      expect(() => new Role(" ")).toThrow(
        expect.objectContaining({
          name: "InvalidRoleError",
          code: "INVALID_ROLE",
          message: "Role must be a non-empty string.",
        }),
      );
    });
  });

  describe("equals", () => {
    it("returns true when the normalized values match", () => {
      expect(new Role("ADMIN").equals(new Role("admin"))).toBe(true);
    });

    it("returns false for different roles", () => {
      expect(new Role("admin").equals(new Role("user"))).toBe(false);
    });
  });
});
