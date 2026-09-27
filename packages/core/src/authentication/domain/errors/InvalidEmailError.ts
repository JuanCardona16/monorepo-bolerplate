import { AuthenticationError } from "./AuthenticationError.js";

export class InvalidEmailError extends AuthenticationError {
  constructor() {
    super("INVALID_EMAIL", "Invalid email format.");
  }
}
