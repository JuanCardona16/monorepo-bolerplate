import { WeakPasswordError } from "../errors/WeakPasswordError.js";

export class Password {
  readonly value: string;

  constructor(value: string) {
    if (!this.isValidPassword(value)) {
      throw new WeakPasswordError();
    }
    this.value = value;
  }

  private isValidPassword(password: string): boolean {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
  }
}