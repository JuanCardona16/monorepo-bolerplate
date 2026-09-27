import { AuthenticationError } from "./AuthenticationError.js";

export class InvalidRoleError extends AuthenticationError {
  constructor() {
    super("INVALID_ROLE", "Role must be a non-empty string.");
  }
}
