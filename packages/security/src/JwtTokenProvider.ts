import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { TokenPayload, TokenProvider } from "@repo/core/authentication";

export type TokenExpiry = SignOptions["expiresIn"];

export class JwtTokenProvider implements TokenProvider {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: SignOptions["expiresIn"],
  ) {}

  async generate(payload: TokenPayload): Promise<string> {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }
}
