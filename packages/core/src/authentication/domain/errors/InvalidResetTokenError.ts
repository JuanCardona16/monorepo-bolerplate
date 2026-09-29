import { AuthenticationError } from "./AuthenticationError.js";

/**
 * One error for every way a reset token can be refused: unknown, already used,
 * expired or blank.
 *
 * A single code is deliberate. Splitting it into `EXPIRED_RESET_TOKEN` and
 * `UNKNOWN_RESET_TOKEN` would tell an attacker holding a stolen link exactly
 * which of the two conditions killed it, and neither fact helps them: either
 * way the token is gone and cannot be used again.
 */
export class InvalidResetTokenError extends AuthenticationError {
  constructor(message: string = "Invalid or expired reset token.") {
    super("INVALID_RESET_TOKEN", message);
  }
}
