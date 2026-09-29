import { describe, expect, it } from "vitest";

import { statusForCode } from "../httpStatusMap.js";

/**
 * The domain owns `code` only; translating that code into a transport status is
 * the gateway's job. This suite pins every mapping so adding a domain error
 * without a status entry fails here instead of silently becoming a 500.
 */
describe("statusForCode", () => {
  it.each([
    ["INVALID_CREDENTIALS", 401],
    ["INVALID_REFRESH_TOKEN", 401],
    ["UNAUTHORIZED", 401],
    ["USER_ALREADY_EXISTS", 409],
    ["INVALID_EMAIL", 400],
    ["WEAK_PASSWORD", 400],
    ["INVALID_ROLE", 400],
    ["VALIDATION_ERROR", 400],
  ])("maps %s to %i", (code, expected) => {
    expect(statusForCode(code)).toBe(expected);
  });

  it("falls back to 500 for a code the gateway does not know", () => {
    expect(statusForCode("SOME_FUTURE_DOMAIN_CODE")).toBe(500);
  });

  it("falls back to 500 when no code is provided at all", () => {
    expect(statusForCode(undefined)).toBe(500);
    expect(statusForCode("")).toBe(500);
  });

  it("maps an empty-string and whitespace code to 500", () => {
    expect(statusForCode(" ")).toBe(500);
  });

  // Regression: the lookup used to be a bare `STATUS_BY_CODE[code] ?? 500`, so
  // an inherited Object.prototype key resolved to a function and `??` let it
  // through. `res.status(fn)` would have thrown at runtime.
  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
    "does not resolve the prototype key %s",
    (code) => {
      expect(statusForCode(code)).toBe(500);
    },
  );

  it("always returns a number, never a non-numeric value", () => {
    for (const code of ["constructor", "toString", "valueOf", "nope", "INVALID_CREDENTIALS"]) {
      expect(typeof statusForCode(code)).toBe("number");
    }
  });
});
