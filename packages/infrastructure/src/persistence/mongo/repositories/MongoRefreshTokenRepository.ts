import {
  RefreshToken,
  RefreshTokenRepository,
} from "@repo/core/authentication";
import type { Model } from "mongoose";

import type { RefreshTokenDoc } from "../models/refreshToken.model.js";
import { MongoRefreshTokenMapper } from "../mappers/RefreshTokenMapper.js";

export class MongoRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly model: Model<RefreshTokenDoc>) {}

  async save(token: RefreshToken): Promise<void> {
    const data = MongoRefreshTokenMapper.toPersistence(token);
    await this.model.updateOne({ id: data.id }, { $set: data }, { upsert: true }).exec();
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const doc = await this.model.findOne({ tokenHash }).lean<RefreshTokenDoc>().exec();
    return doc ? MongoRefreshTokenMapper.toDomain(doc) : null;
  }

  async revokeAllForUser(userUuid: string): Promise<void> {
    await this.model
      .updateMany({ userUuid, revokedAt: null }, { $set: { revokedAt: new Date() } })
      .exec();
  }
}
