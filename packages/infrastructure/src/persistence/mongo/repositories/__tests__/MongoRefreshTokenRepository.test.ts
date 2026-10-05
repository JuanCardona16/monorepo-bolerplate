import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { RefreshToken } from "@repo/core/authentication";

import { RefreshTokenModel } from "../../models/refreshToken.model.js";
import { MongoRefreshTokenRepository } from "../MongoRefreshTokenRepository.js";

const describeDb = (() => {
  if (process.env.MONGODB_URI) {
    return describe;
  }
  if (process.env.CI) {
    throw new Error(
      "MONGODB_URI is not set, but CI=true. Refusing to report these tests as skipped.",
    );
  }
  return describe.skip;
})();

const repository = new MongoRefreshTokenRepository(RefreshTokenModel);
const createdIds: string[] = [];

function makeToken(userUuid: string): RefreshToken {
  const id = randomUUID();
  createdIds.push(id);
  return new RefreshToken({
    id,
    userUuid,
    tokenHash: `hash-${id}`,
    roles: ["user"],
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    rememberMe: false,
  });
}

describeDb("MongoRefreshTokenRepository", () => {
  it("saves and finds a token by hash, then revokes it via rotation save", async () => {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const userUuid = randomUUID();
    const token = makeToken(userUuid);
    await repository.save(token);

    const found = await repository.findByTokenHash(token.tokenHash);
    expect(found?.id).toBe(token.id);

    token.revoke();
    await repository.save(token);
    expect((await repository.findByTokenHash(token.tokenHash))?.isRevoked).toBe(true);
  });

  it("revokeAllForUser revokes every active session of the user", async () => {
    const userUuid = randomUUID();
    await repository.save(makeToken(userUuid));
    await repository.save(makeToken(userUuid));

    await repository.revokeAllForUser(userUuid);

    const remaining = await RefreshTokenModel.find({ userUuid, revokedAt: null })
      .lean()
      .exec();
    expect(remaining).toHaveLength(0);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await RefreshTokenModel.deleteMany({ id: { $in: createdIds.splice(0) } }).exec();
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
});
