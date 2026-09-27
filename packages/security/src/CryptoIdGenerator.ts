import { randomUUID } from "node:crypto";
import { IdGenerator } from "@repo/core/authentication";

export class CryptoIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
