import { AuthenticationError } from "./AuthenticationError.js";

export class InvalidRefreshTokenError extends AuthenticationError {
  constructor(message: string = "Invalid refresh token.") {
    super("INVALID_REFRESH_TOKEN", message);
  }
}
