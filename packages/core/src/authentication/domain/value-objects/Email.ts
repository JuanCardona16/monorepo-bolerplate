import { InvalidEmailError } from "../errors/InvalidEmailError.js";

export class Email {
  readonly value: string;

  constructor(value: string) {
    // Normalize BEFORE validating, so `  User@Example.COM  ` is judged on its
    // canonical form. Storing the raw string made `User@x.com` and `user@x.com`
    // distinct identities end to end: the `auth_users.email` column is a plain
    // TEXT with a btree index (no citext), so the database happily held two rows
    // for the same mailbox and a login could fail purely on capitalization.
    const normalized = this.normalize(value);
    if (!this.isValidEmail(normalized)) {
      throw new InvalidEmailError();
    }
    this.value = normalized;
  }

  private normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}