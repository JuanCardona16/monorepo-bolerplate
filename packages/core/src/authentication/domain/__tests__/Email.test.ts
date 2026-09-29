import { describe, expect, it } from "vitest";

import { InvalidEmailError } from "../errors/InvalidEmailError.js";
import { Email } from "../value-objects/Email.js";

describe("Email", () => {
  describe("constructor", () => {
    it.each([
      ["user@example.com", "user@example.com"],
      ["first.last@example.co.uk", "first.last@example.co.uk"],
      ["user+tag@example.io", "user+tag@example.io"],
      ["123456@123.123", "123456@123.123"],
    ])("accepts %s and exposes it normalized", (value, expected) => {
      const email = new Email(value);

      expect(email.value).toBe(expected);
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

    it("lowercases the address", () => {
      const email = new Email("User.Name+Tag@Example.COM");

      expect(email.value).toBe("user.name+tag@example.com");
    });

    it("trims surrounding whitespace instead of rejecting it", () => {
      // The regex used to be anchored, so padding was an error. Normalizing
      // first means a padded address is accepted and stored canonically.
      expect(new Email("  user@example.com").value).toBe("user@example.com");
      expect(new Email("user@example.com  ").value).toBe("user@example.com");
      expect(new Email("\tuser@example.com\n").value).toBe("user@example.com");
    });

    it("collapses differently cased spellings of the same address to one identity", () => {
      // The reason normalization exists: `auth_users.email` is a plain TEXT
      // column with a btree index, so without this the database would hold
      // `User@x.com` and `user@x.com` as two separate accounts for one mailbox.
      expect(new Email("User@Example.com").value).toBe(new Email("user@example.com").value);
      expect(new Email("  USER@EXAMPLE.COM ").value).toBe(new Email("user@example.com").value);
    });

    it("rejects an address that is only whitespace", () => {
      expect(() => new Email("   ")).toThrow(InvalidEmailError);
    });
  });
});
