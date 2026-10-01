import {
  PasswordResetToken,
  PasswordResetTokenRepository,
} from "@repo/core/authentication";
import { PrismaClient } from "../prisma/generated/prisma/client.js";
import { PasswordResetTokenMapper } from "../mappers/PasswordResetTokenMapper.js";

export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(token: PasswordResetToken): Promise<void> {
    const data = PasswordResetTokenMapper.toPersistence(token);
    await this.prisma.passwordResetTokenSchema.upsert({
      where: { id: data.id },
      update: data,
      create: data,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.prisma.passwordResetTokenSchema.findUnique({
      where: { tokenHash },
    });
    return row ? PasswordResetTokenMapper.toDomain(row) : null;
  }

  async revokeAllForUser(userUuid: string): Promise<void> {
    // Filters on `usedAt: null`, so a token that was already spent keeps the
    // instant it was actually used. Overwriting it would erase the only trace
    // of when a credential was redeemed.
    await this.prisma.passwordResetTokenSchema.updateMany({
      where: { userUuid, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
