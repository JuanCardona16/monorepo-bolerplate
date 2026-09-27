import {
  RefreshToken,
  RefreshTokenRepository,
} from "@repo/core/authentication";
import { PrismaClient } from "../prisma/generated/prisma/client.js";
import { RefreshTokenMapper } from "../mappers/RefreshTokenMapper.js";

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(token: RefreshToken): Promise<void> {
    const data = RefreshTokenMapper.toPersistence(token);
    await this.prisma.refreshTokenSchema.upsert({
      where: { id: data.id },
      update: data,
      create: data,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshTokenSchema.findUnique({
      where: { tokenHash },
    });
    return row ? RefreshTokenMapper.toDomain(row) : null;
  }

  async revokeAllForUser(userUuid: string): Promise<void> {
    await this.prisma.refreshTokenSchema.updateMany({
      where: { userUuid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
