import { AuthenticationError } from "./AuthenticationError.js";

export class UserAlreadyExistsError extends AuthenticationError {
  constructor() {
    super("USER_ALREADY_EXISTS", "User is already registered.");
  }
}
