import { createHash, timingSafeEqual } from "node:crypto";
import { RefreshTokenHasher } from "@repo/core/authentication";

export class Sha256RefreshTokenHasher implements RefreshTokenHasher {
  async hash(rawToken: string): Promise<string> {
    return createHash("sha256").update(rawToken, "utf8").digest("hex");
  }

  async verify(rawToken: string, tokenHash: string): Promise<boolean> {
    const actual = Buffer.from(await this.hash(rawToken), "hex");
    const expected = Buffer.from(tokenHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
