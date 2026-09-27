import { AuthenticationError } from "./AuthenticationError.js";

export class WeakPasswordError extends AuthenticationError {
  constructor() {
    super(
      "WEAK_PASSWORD",
      "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter and a number.",
    );
  }
}
