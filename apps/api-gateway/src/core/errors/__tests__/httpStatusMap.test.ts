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
    // A reset token is a bearer credential: a bad one is a failed
    // authentication, not a malformed request. 400 would suggest the body is
    // wrong and invite a client to retry the same call unchanged.
    ["INVALID_RESET_TOKEN", 401],
    ["UNAUTHORIZED", 401],
    ["USER_ALREADY_EXISTS", 409],
    ["INVALID_EMAIL", 400],
    ["WEAK_PASSWORD", 400],
    ["INVALID_ROLE", 400],
    ["VALIDATION_ERROR", 400],
    // 502, not 500: our side worked and the upstream provider did not. A 500
    // would send the caller to retry against the wrong service and file the
    // incident against a team that cannot fix it.
    ["EMAIL_SEND_FAILED", 502],
  ])("maps %s to %i", (code, expected) => {
    expect(statusForCode(code)).toBe(expected);
  });

  it("does not leak the reset token status through a 500", () => {
    // Guard against a plausible future edit: the map is a lookup and a missing
    // entry degrades to 500, which would still be a *correct-looking* response.
    expect(statusForCode("RESET_TOKEN_EXPIRED")).toBe(500);
    expect(statusForCode("UNKNOWN_RESET_TOKEN")).toBe(500);
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
