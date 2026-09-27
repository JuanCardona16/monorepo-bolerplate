import { describe, expect, it } from "vitest";

import { WeakPasswordError } from "../errors/WeakPasswordError.js";
import { Password } from "../value-objects/Password.js";

describe("Password", () => {
  describe("constructor", () => {
    it.each([
      "Abcdefg1",
      "P4ssword",
      "aB3fghij",
      "Str0ng!Passw0rd",
    ])("accepts %s and exposes it unchanged on `value`", (value) => {
      const password = new Password(value);

      expect(password.value).toBe(value);
    });

    it.each([
      ["empty string", ""],
      ["too short", "Abc1"],
      ["no uppercase letter", "abcdefg1"],
      ["no lowercase letter", "ABCDEFG1"],
      ["no digit", "Abcdefgh"],
      ["only a space as filler", "        "],
    ])("throws WeakPasswordError for %s", (_label, value) => {
      expect(() => new Password(value)).toThrow(WeakPasswordError);
    });

    it("throws with the WEAK_PASSWORD code and the policy message", () => {
      expect(() => new Password("weak")).toThrow(
        expect.objectContaining({
          name: "WeakPasswordError",
          code: "WEAK_PASSWORD",
          message:
            "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter and a number.",
        }),
      );
    });

    it("accepts exactly 8 characters when all three classes are present", () => {
      expect(new Password("Abcdefg1").value).toBe("Abcdefg1");
    });

    it("does not normalize the value", () => {
      // No trimming is performed: a leading space is a valid non-whitespace character.
      expect(new Password(" Abcdefg1").value).toBe(" Abcdefg1");
    });
  });
});
