import { describe, expect, it } from "vitest";

import { AuthenticationError } from "../errors/AuthenticationError.js";
import { InvalidCredentialsError } from "../errors/InvalidCredentialsError.js";
import { InvalidEmailError } from "../errors/InvalidEmailError.js";
import { InvalidRefreshTokenError } from "../errors/InvalidRefreshTokenError.js";
import { InvalidRoleError } from "../errors/InvalidRoleError.js";
import { UserAlreadyExistsError } from "../errors/UserAlreadyExistsError.js";
import { WeakPasswordError } from "../errors/WeakPasswordError.js";

/**
 * The gateway maps `code` to an HTTP status; the domain must never own a
 * transport concern. This suite pins that contract.
 */
describe("AuthenticationError `code` contract", () => {
  it.each([
    [InvalidCredentialsError, "INVALID_CREDENTIALS", "Invalid credentials."],
    [InvalidEmailError, "INVALID_EMAIL", "Invalid email format."],
    [InvalidRefreshTokenError, "INVALID_REFRESH_TOKEN", "Invalid refresh token."],
    [InvalidRoleError, "INVALID_ROLE", "Role must be a non-empty string."],
    [UserAlreadyExistsError, "USER_ALREADY_EXISTS", "User is already registered."],
    [
      WeakPasswordError,
      "WEAK_PASSWORD",
      "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter and a number.",
    ],
  ])("%o exposes the %s code and is an AuthenticationError", (ErrorClass, code, message) => {
    const error = new ErrorClass();

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe(ErrorClass.name);
  });

  it("gives every domain error a unique code", () => {
    const codes = [
      new InvalidCredentialsError().code,
      new InvalidEmailError().code,
      new InvalidRefreshTokenError().code,
      new InvalidRoleError().code,
      new UserAlreadyExistsError().code,
      new WeakPasswordError().code,
    ];

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("carries no HTTP status: `code` and `name` are the only own properties", () => {
    const error = new AuthenticationError("SOME_CODE", "some message.");

    expect(Object.keys(error).sort()).toEqual(["code", "name"]);
    expect(error).not.toHaveProperty("status");
    expect(error).not.toHaveProperty("statusCode");
    expect(error).not.toHaveProperty("httpStatus");
  });

  it("uses the concrete class name, not the base class name", () => {
    expect(new AuthenticationError("X", "y").name).toBe("AuthenticationError");
    expect(new InvalidEmailError().name).toBe("InvalidEmailError");
  });

  it("defaults the InvalidRefreshTokenError message but accepts an override", () => {
    expect(new InvalidRefreshTokenError().message).toBe("Invalid refresh token.");
    expect(new InvalidRefreshTokenError("Refresh token hash is required.").message).toBe(
      "Refresh token hash is required.",
    );
    expect(new InvalidRefreshTokenError("custom").code).toBe("INVALID_REFRESH_TOKEN");
  });
});
