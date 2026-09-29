import { PasswordResetToken } from "@repo/core/authentication";
import type { PasswordResetTokenSchema } from "../prisma/generated/prisma/client.js";

/**
 * Same two deliberate losses as the other mappers: `createdAt`/`updatedAt` are
 * dropped because the domain entity has nowhere to keep them (Prisma refills
 * them on write), and there is no roles column, so nothing collapses here.
 */
export class PasswordResetTokenMapper {
  static toDomain(row: PasswordResetTokenSchema): PasswordResetToken {
    return new PasswordResetToken({
      id: row.id,
      userUuid: row.userUuid,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    });
  }

  static toPersistence(token: PasswordResetToken): {
    id: string;
    userUuid: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  } {
    return {
      id: token.id,
      userUuid: token.userUuid,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }
}
