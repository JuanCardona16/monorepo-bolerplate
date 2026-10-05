import {
  AuthRepository,
  AuthUser,
  UserAlreadyExistsError,
} from "@repo/core/authentication";
import type { Model } from "mongoose";

import type { AuthUserDoc } from "../models/authUser.model.js";
import { MongoAuthUserMapper } from "../mappers/AuthUserMapper.js";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

export class MongoAuthRepository implements AuthRepository {
  constructor(private readonly model: Model<AuthUserDoc>) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    const doc = await this.model.findOne({ email }).lean<AuthUserDoc>().exec();
    return doc ? MongoAuthUserMapper.toDomain(doc) : null;
  }

  async findByUuid(uuid: string): Promise<AuthUser | null> {
    const doc = await this.model.findOne({ uuid }).lean<AuthUserDoc>().exec();
    return doc ? MongoAuthUserMapper.toDomain(doc) : null;
  }

  async save(user: AuthUser): Promise<void> {
    try {
      await this.model.create(MongoAuthUserMapper.toPersistence(user));
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new UserAlreadyExistsError();
      }
      throw error;
    }
  }

  async update(user: AuthUser): Promise<void> {
    await this.model
      .updateOne({ uuid: user.uuid }, { $set: MongoAuthUserMapper.toPersistence(user) })
      .exec();
  }
}
