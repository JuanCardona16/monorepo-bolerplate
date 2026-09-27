import { RefreshToken } from "@repo/core/authentication";
import type { RefreshTokenSchema } from "../prisma/generated/prisma/client.js";

export class RefreshTokenMapper {
  static toDomain(row: RefreshTokenSchema): RefreshToken {
    return new RefreshToken({
      id: row.id,
      userUuid: row.userUuid,
      tokenHash: row.tokenHash,
      roles: row.roles,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    });
  }

  static toPersistence(token: RefreshToken): {
    id: string;
    userUuid: string;
    tokenHash: string;
    roles: string[];
    expiresAt: Date;
    revokedAt: Date | null;
  } {
    return {
      id: token.id,
      userUuid: token.userUuid,
      tokenHash: token.tokenHash,
      roles: Array.from(token.roles),
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
    };
  }
}
