import { PasswordResetToken } from "@repo/core/authentication";

import type { PasswordResetTokenDoc } from "../models/passwordResetToken.model.js";

export class MongoPasswordResetTokenMapper {
  static toDomain(doc: PasswordResetTokenDoc): PasswordResetToken {
    return new PasswordResetToken({
      id: doc.id,
      userUuid: doc.userUuid,
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt,
    });
  }

  static toPersistence(token: PasswordResetToken): PasswordResetTokenDoc {
    return {
      id: token.id,
      userUuid: token.userUuid,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }
}
