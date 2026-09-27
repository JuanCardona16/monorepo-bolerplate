import bcrypt from 'bcrypt';
import { PasswordHasher } from "@repo/core/authentication";

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly saltRounds: number = 10) {}

  async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, this.saltRounds);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}