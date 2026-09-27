import { AuthenticationError } from "./AuthenticationError.js";

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super("INVALID_CREDENTIALS", "Invalid credentials.");
  }
}
