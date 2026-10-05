import {
  PasswordResetToken,
  PasswordResetTokenRepository,
} from "@repo/core/authentication";
import type { Model } from "mongoose";

import type { PasswordResetTokenDoc } from "../models/passwordResetToken.model.js";
import { MongoPasswordResetTokenMapper } from "../mappers/PasswordResetTokenMapper.js";

export class MongoPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly model: Model<PasswordResetTokenDoc>) {}

  async save(token: PasswordResetToken): Promise<void> {
    const data = MongoPasswordResetTokenMapper.toPersistence(token);
    await this.model.updateOne({ id: data.id }, { $set: data }, { upsert: true }).exec();
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const doc = await this.model.findOne({ tokenHash }).lean<PasswordResetTokenDoc>().exec();
    return doc ? MongoPasswordResetTokenMapper.toDomain(doc) : null;
  }

  async revokeAllForUser(userUuid: string): Promise<void> {
    // Only burn unused tokens: a spent token keeps the instant it was redeemed.
    await this.model
      .updateMany({ userUuid, usedAt: null }, { $set: { usedAt: new Date() } })
      .exec();
  }
}
