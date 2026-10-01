import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PasswordResetToken } from "@repo/core/authentication";

import { createAuthPrismaClient } from "../../client.js";
import { PrismaPasswordResetTokenRepository } from "../PrismaPasswordResetTokenRepository.js";
import type { PrismaClient } from "../../prisma/generated/prisma/client.js";

// Real-database suite, gated on DATABASE_URL so CI reports it as skipped
// instead of failing when there is no Postgres to talk to.
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const SPENT_AT = new Date("2098-01-01T00:00:00.000Z");

const prisma: PrismaClient = createAuthPrismaClient(
  process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused",
);
const repository = new PrismaPasswordResetTokenRepository(prisma);

// Scoped to the ids this module generated. No TRUNCATE, no global deleteMany,
// so rows belonging to the running application are never touched.
const createdIds: string[] = [];

function uniqueId(): string {
  const id = randomUUID();
  createdIds.push(id);
  return id;
}

function makeToken(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return new PasswordResetToken({
    id: overrides.id ?? uniqueId(),
    userUuid: overrides.userUuid ?? randomUUID(),
    tokenHash: overrides.tokenHash ?? `hash-${randomUUID()}`,
    expiresAt: overrides.expiresAt ?? FUTURE,
    usedAt: overrides.usedAt ?? null,
  });
}

afterEach(async () => {
  await prisma.passwordResetTokenSchema.deleteMany({ where: { id: { in: createdIds } } });
  createdIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("PrismaPasswordResetTokenRepository (real Postgres)", () => {
  describe("save / findByTokenHash", () => {
    it("persists a token and reads it back with the same data", async () => {
      const token = makeToken();

      await repository.save(token);

      const found = await repository.findByTokenHash(token.tokenHash);
      expect(found?.id).toBe(token.id);
      expect(found?.userUuid).toBe(token.userUuid);
      expect(found?.tokenHash).toBe(token.tokenHash);
      expect(found?.expiresAt).toEqual(FUTURE);
      expect(found?.isUsed).toBe(false);
    });

    it("returns null for a hash that does not exist", async () => {
      await expect(repository.findByTokenHash(`absent-${randomUUID()}`)).resolves.toBeNull();
    });

    it("stores the used state so a spent token is still spent after a reload", async () => {
      // Single use is a property of the row, not of the process that minted it:
      // a second request must be refused by a freshly loaded entity.
      const token = makeToken();
      token.markUsed(SPENT_AT);
      const spent = new PasswordResetToken({
        id: token.id,
        userUuid: token.userUuid,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: SPENT_AT,
      });
      await repository.save(spent);

      const found = await repository.findByTokenHash(token.tokenHash);

      expect(found?.isUsed).toBe(true);
      expect(found?.usedAt).toEqual(SPENT_AT);
    });
  });

  describe("save is an upsert", () => {
    it("updates the existing row instead of failing on a repeated id", async () => {
      const id = uniqueId();
      const first = makeToken({ id, expiresAt: FUTURE });
      await repository.save(first);
      const second = makeToken({ id, expiresAt: new Date("2097-01-01T00:00:00.000Z") });

      await expect(repository.save(second)).resolves.toBeUndefined();

      const found = await repository.findByTokenHash(second.tokenHash);
      expect(found?.id).toBe(id);
      expect(found?.expiresAt).toEqual(new Date("2097-01-01T00:00:00.000Z"));
    });

    it("keeps exactly one row for a repeated id", async () => {
      const id = uniqueId();
      await repository.save(makeToken({ id }));
      await repository.save(makeToken({ id }));

      const rows = await prisma.passwordResetTokenSchema.findMany({ where: { id } });
      expect(rows).toHaveLength(1);
    });

    it("still enforces the unique token hash index", async () => {
      const tokenHash = `hash-${randomUUID()}`;
      await repository.save(makeToken({ tokenHash }));

      await expect(repository.save(makeToken({ tokenHash }))).rejects.toMatchObject({
        code: "P2002",
      });
    });
  });

  describe("revokeAllForUser", () => {
    it("burns every outstanding token of that user", async () => {
      const userUuid = randomUUID();
      const first = makeToken({ userUuid });
      const second = makeToken({ userUuid });
      await repository.save(first);
      await repository.save(second);

      await repository.revokeAllForUser(userUuid);

      expect((await repository.findByTokenHash(first.tokenHash))?.isUsed).toBe(true);
      expect((await repository.findByTokenHash(second.tokenHash))?.isUsed).toBe(true);
    });

    it("leaves the tokens of other users untouched", async () => {
      const target = randomUUID();
      const other = randomUUID();
      const targetToken = makeToken({ userUuid: target });
      const otherToken = makeToken({ userUuid: other });
      await repository.save(targetToken);
      await repository.save(otherToken);

      await repository.revokeAllForUser(target);

      expect((await repository.findByTokenHash(otherToken.tokenHash))?.isUsed).toBe(false);
    });

    it("does not overwrite the instant an already spent token was used", async () => {
      // The query filters on `usedAt: null`. Overwriting would erase the only
      // forensic trace of when a credential was actually redeemed.
      const userUuid = randomUUID();
      const spent = new PasswordResetToken({
        id: uniqueId(),
        userUuid,
        tokenHash: `hash-${randomUUID()}`,
        expiresAt: FUTURE,
        usedAt: SPENT_AT,
      });
      const active = makeToken({ userUuid });
      await repository.save(spent);
      await repository.save(active);

      await repository.revokeAllForUser(userUuid);

      expect((await repository.findByTokenHash(spent.tokenHash))?.usedAt).toEqual(SPENT_AT);
    });

    it("is a no-op for a user that owns no tokens", async () => {
      const bystander = makeToken({ userUuid: randomUUID() });
      await repository.save(bystander);

      await expect(repository.revokeAllForUser(randomUUID())).resolves.toBeUndefined();

      expect((await repository.findByTokenHash(bystander.tokenHash))?.isUsed).toBe(false);
    });
  });
});
