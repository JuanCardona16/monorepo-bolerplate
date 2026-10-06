import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { AuthUser, UserAlreadyExistsError } from "@repo/core/authentication";

import { AuthUserModel } from "../../models/authUser.model.js";
import { MongoAuthRepository } from "../MongoAuthRepository.js";

// Same honest-DB gate as the postgres suites: real Mongo only. Skip locally
// without MONGODB_URI; throw in CI so a missing database can never be a
// silent green.
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

const FAKE_PASSWORD_HASH =
  "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV";

beforeAllSafe();
function beforeAllSafe(): void {
  if (!process.env.MONGODB_URI) {
    return;
  }
}

const repository = new MongoAuthRepository(AuthUserModel);
const createdUuids: string[] = [];

function uniqueEmail(): string {
  return `it-${randomUUID()}@mongo-auth.test`;
}

describeDb("MongoAuthRepository", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI as string);
    // `unique: true` indexes build asynchronously on first use: without
    // waiting, the duplicate-email test can win the race and resolve instead
    // of rejecting (CI flake, TK-18).
    await AuthUserModel.createIndexes();
  });

  it("saves and finds a user by email and uuid", async () => {
    const uuid = randomUUID();
    createdUuids.push(uuid);
    const user = new AuthUser({
      uuid,
      email: uniqueEmail(),
      passwordHash: FAKE_PASSWORD_HASH,
      roles: new Set(["user"]),
    });

    await repository.save(user);

    const byEmail = await repository.findByEmail(user.email);
    const byUuid = await repository.findByUuid(uuid);
    expect(byEmail?.uuid).toBe(uuid);
    expect(byUuid?.email).toBe(user.email);
  });

  it("throws UserAlreadyExistsError on duplicate email", async () => {
    const uuid = randomUUID();
    createdUuids.push(uuid);
    const email = uniqueEmail();
    await repository.save(
      new AuthUser({ uuid, email, passwordHash: FAKE_PASSWORD_HASH, roles: new Set(["user"]) }),
    );

    await expect(
      repository.save(
        new AuthUser({
          uuid: randomUUID(),
          email,
          passwordHash: FAKE_PASSWORD_HASH,
          roles: new Set(["user"]),
        }),
      ),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("updates roles with a full replace", async () => {
    const uuid = randomUUID();
    createdUuids.push(uuid);
    const user = new AuthUser({
      uuid,
      email: uniqueEmail(),
      passwordHash: FAKE_PASSWORD_HASH,
      roles: new Set(["user"]),
    });
    await repository.save(user);

    const replacement = new AuthUser({
      uuid,
      email: user.email,
      passwordHash: user.passwordHash,
      roles: new Set(["admin"]),
    });
    await repository.update(replacement);

    expect((await repository.findByUuid(uuid))?.roles).toEqual(new Set(["admin"]));
  });

  afterEach(async () => {
    if (createdUuids.length > 0) {
      await AuthUserModel.deleteMany({ uuid: { $in: createdUuids.splice(0) } }).exec();
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
});
