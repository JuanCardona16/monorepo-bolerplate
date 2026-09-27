import { InvalidEmailError } from "../errors/InvalidEmailError.js";

export class Email {
  readonly value: string;

  constructor(value: string) {
    if (!this.isValidEmail(value)) {
      throw new InvalidEmailError();
    }
    this.value = value;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}