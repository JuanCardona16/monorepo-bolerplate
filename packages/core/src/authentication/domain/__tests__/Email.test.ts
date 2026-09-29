import { describe, expect, it } from "vitest";

import { InvalidEmailError } from "../errors/InvalidEmailError.js";
import { Email } from "../value-objects/Email.js";

describe("Email", () => {
  describe("constructor", () => {
    it.each([
      "user@example.com",
      "first.last@example.co.uk",
      "user+tag@example.io",
      "USER@EXAMPLE.COM",
      "123456@123.123",
    ])("accepts %s and exposes it unchanged on `value`", (value) => {
      const email = new Email(value);

      expect(email.value).toBe(value);
    });

    it.each([
      ["empty string", ""],
      ["missing at sign", "userexample.com"],
      ["missing domain", "user@"],
      ["missing local part", "@example.com"],
      ["missing top level domain dot", "user@example"],
      ["whitespace inside local part", "us er@example.com"],
      ["whitespace inside domain", "user@exa mple.com"],
      ["two at signs", "user@@example.com"],
    ])("throws InvalidEmailError for %s", (_label, value) => {
      expect(() => new Email(value)).toThrow(InvalidEmailError);
    });

    it("throws with the INVALID_EMAIL code and a descriptive message", () => {
      expect(() => new Email("nope")).toThrow(
        expect.objectContaining({
          name: "InvalidEmailError",
          code: "INVALID_EMAIL",
          message: "Invalid email format.",
        }),
      );
    });

    it("stores the value verbatim without lowercasing or trimming", () => {
      // The regex anchors on both ends, so surrounding whitespace is rejected,
      // but the accepted casing is preserved exactly as given.
      const email = new Email("User.Name+Tag@Example.COM");

      expect(email.value).toBe("User.Name+Tag@Example.COM");
    });

    it("rejects surrounding whitespace because the regex is anchored", () => {
      expect(() => new Email("  user@example.com")).toThrow(InvalidEmailError);
      expect(() => new Email("user@example.com  ")).toThrow(InvalidEmailError);
      expect(() => new Email("user@example.com\n")).toThrow(InvalidEmailError);
    });
  });
});
