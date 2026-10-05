import { RefreshToken } from "@repo/core/authentication";

import type { RefreshTokenDoc } from "../models/refreshToken.model.js";

export class MongoRefreshTokenMapper {
  static toDomain(doc: RefreshTokenDoc): RefreshToken {
    return new RefreshToken({
      id: doc.id,
      userUuid: doc.userUuid,
      tokenHash: doc.tokenHash,
      roles: doc.roles,
      expiresAt: doc.expiresAt,
      revokedAt: doc.revokedAt,
      rememberMe: doc.rememberMe,
    });
  }

  static toPersistence(token: RefreshToken): RefreshTokenDoc {
    return {
      id: token.id,
      userUuid: token.userUuid,
      tokenHash: token.tokenHash,
      roles: Array.from(token.roles),
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      rememberMe: token.rememberMe,
    };
  }
}
