import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "../auth.schemas.js";

/**
 * The gateway rejects bad input at the edge so a malformed request never reaches
 * the domain. These suites pin what each schema accepts, and — just as
 * important — the message the client is told when it does not.
 */
describe("registerSchema", () => {
  it("accepts a well formed email and a long enough password", () => {
    const payload = { email: "user@example.com", password: "Password1" };

    const result = registerSchema.safeParse(payload);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual(payload);
  });

  it("accepts a password of exactly 8 characters", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "12345678" });

    expect(result.success).toBe(true);
  });

  it.each([
    ["plainstring"],
    ["user@"],
    ["@example.com"],
    ["user example.com"],
  ])("rejects %s as an email with the 'Invalid email' message", (email) => {
    const result = registerSchema.safeParse({ email, password: "Password1" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors[0]?.message).toBe("Invalid email");
    expect(result.success === false && result.error.errors[0]?.path).toEqual(["email"]);
  });

  it("rejects a 7 character password and names the minimum", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "1234567" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors[0]?.message).toBe(
      "String must contain at least 8 character(s)",
    );
  });

  it.each([
    [{ password: "Password1" }, "email"],
    [{ email: "user@example.com" }, "password"],
    [{}, "email"],
  ])("rejects a payload missing %o", (payload, expectedPath) => {
    const result = registerSchema.safeParse(payload);

    expect(result.success).toBe(false);
    expect(
      result.success === false && result.error.errors.some((e) => e.path[0] === expectedPath),
    ).toBe(true);
  });

  it("reports every offending field at once, not just the first", () => {
    const result = registerSchema.safeParse({ email: "nope", password: "short" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors).toHaveLength(2);
  });

  it("strips unknown keys instead of failing on them", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Password1",
      role: "admin",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("role");
  });

  it("rejects non string values for the same fields", () => {
    const result = registerSchema.safeParse({ email: 42, password: 12345678 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors).toHaveLength(2);
  });
});

describe("loginSchema", () => {
  it("accepts a one character password, unlike register", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "a" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty password, unlike register", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors[0]?.path).toEqual(["password"]);
  });

  it("rejects a malformed email with the same message as register", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "a" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors[0]?.message).toBe("Invalid email");
  });

  it("rejects a missing password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.errors[0]?.message).toBe("Required");
  });
});
