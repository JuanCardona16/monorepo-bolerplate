import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { RefreshToken } from "@repo/core/authentication";

import { createAuthPrismaClient } from "../../client.js";
import { PrismaRefreshTokenRepository } from "../PrismaRefreshTokenRepository.js";
import type { PrismaClient } from "../../prisma/generated/prisma/client.js";

// Real-database suite: gated on DATABASE_URL so CI reports it as skipped
// instead of failing when there is no Postgres to talk to.
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const FUTURE = new Date("2099-01-01T00:00:00.000Z");
const OTHER_FUTURE = new Date("2099-06-01T12:30:00.000Z");

// One client for the module, disconnected once at the end.
const prisma: PrismaClient = createAuthPrismaClient(
  process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused"
);
const repository = new PrismaRefreshTokenRepository(prisma);

// Cleanup is keyed on the ids this module generated. No TRUNCATE and no global
// deleteMany, so rows belonging to the running application are never touched.
const createdIds: string[] = [];

function uniqueId(): string {
  const id = randomUUID();
  createdIds.push(id);
  return id;
}

function uniqueTokenHash(): string {
  return `hash-${randomUUID()}`;
}

function makeToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return new RefreshToken({
    id: overrides.id ?? uniqueId(),
    userUuid: overrides.userUuid ?? randomUUID(),
    tokenHash: overrides.tokenHash ?? uniqueTokenHash(),
    roles: Array.from(overrides.roles ?? new Set(["user"])),
    expiresAt: overrides.expiresAt ?? FUTURE,
    revokedAt: overrides.revokedAt ?? null,
  });
}

afterEach(async () => {
  // Scoped to the ids this test created; runs even after a failed assertion.
  await prisma.refreshTokenSchema.deleteMany({ where: { id: { in: createdIds } } });
  createdIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("PrismaRefreshTokenRepository (real Postgres)", () => {
  describe("save / findByTokenHash", () => {
    it("persists a token and reads it back with the same data", async () => {
      const token = makeToken({ roles: new Set(["user", "admin"]) });

      await repository.save(token);

      const found = await repository.findByTokenHash(token.tokenHash);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(token.id);
      expect(found?.userUuid).toBe(token.userUuid);
      expect(found?.tokenHash).toBe(token.tokenHash);
      expect(found?.roles).toEqual(new Set(["user", "admin"]));
      expect(found?.expiresAt).toEqual(FUTURE);
      expect(found?.revokedAt).toBeNull();
      expect(found?.isRevoked).toBe(false);
    });

    it("preserves the exact expiry instant across the round trip", async () => {
      // `expires_at` is TIMESTAMP(3) without timezone, so sub-millisecond and
      // zone offsets are truncated by the column; the assertion pins the
      // millisecond precision the schema actually guarantees.
      const expiresAt = new Date("2099-03-04T05:06:07.891Z");
      const token = makeToken({ expiresAt });

      await repository.save(token);

      const found = await repository.findByTokenHash(token.tokenHash);
      expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it("stores the revoked state when the entity was already revoked", async () => {
      const revokedAt = new Date("2098-01-01T00:00:00.000Z");
      const token = makeToken({ revokedAt });
      token.revoke();
      const revoked = new RefreshToken({
        id: token.id,
        userUuid: token.userUuid,
        tokenHash: token.tokenHash,
        roles: Array.from(token.roles),
        expiresAt: token.expiresAt,
        revokedAt,
      });

      await repository.save(revoked);

      const found = await repository.findByTokenHash(token.tokenHash);
      expect(found?.isRevoked).toBe(true);
      expect(found?.revokedAt).toEqual(revokedAt);
    });

    it("returns null for a token hash that does not exist", async () => {
      await expect(repository.findByTokenHash(`absent-${randomUUID()}`)).resolves.toBeNull();
    });
  });

  describe("save is an upsert", () => {
    it("updates the existing row instead of failing on a repeated id", async () => {
      const id = uniqueId();
      const userUuid = randomUUID();
      const first = makeToken({
        id,
        userUuid,
        tokenHash: uniqueTokenHash(),
        roles: new Set(["user"]),
        expiresAt: FUTURE,
      });
      await repository.save(first);

      const second = makeToken({
        id,
        userUuid,
        tokenHash: uniqueTokenHash(),
        roles: new Set(["user", "admin"]),
        expiresAt: OTHER_FUTURE,
      });

      // The same primary key must not raise a P2002: `save` delegates to
      // Prisma's `upsert`, keyed on the token id.
      await expect(repository.save(second)).resolves.toBeUndefined();

      const found = await repository.findByTokenHash(second.tokenHash);
      expect(found?.id).toBe(id);
      expect(found?.roles).toEqual(new Set(["user", "admin"]));
      expect(found?.expiresAt).toEqual(OTHER_FUTURE);
    });

    it("keeps exactly one row for a repeated id", async () => {
      const id = uniqueId();
      const first = makeToken({ id, tokenHash: uniqueTokenHash() });
      const second = makeToken({ id, tokenHash: uniqueTokenHash() });

      await repository.save(first);
      await repository.save(second);

      const rows = await prisma.refreshTokenSchema.findMany({ where: { id } });
      expect(rows).toHaveLength(1);
    });

    it("still enforces the unique token hash index", async () => {
      // The upsert is keyed on `id`, so a different id reusing an existing
      // `token_hash` violates the unique index instead of overwriting.
      const tokenHash = uniqueTokenHash();
      await repository.save(makeToken({ tokenHash }));

      const clashing = makeToken({ tokenHash });

      await expect(repository.save(clashing)).rejects.toMatchObject({ code: "P2002" });
    });
  });

  describe("revokeAllForUser", () => {
    it("marks every active token of that user as revoked", async () => {
      const userUuid = randomUUID();
      const first = makeToken({ userUuid });
      const second = makeToken({ userUuid });
      await repository.save(first);
      await repository.save(second);

      await repository.revokeAllForUser(userUuid);

      const a = await repository.findByTokenHash(first.tokenHash);
      const b = await repository.findByTokenHash(second.tokenHash);
      expect(a?.isRevoked).toBe(true);
      expect(b?.isRevoked).toBe(true);
      expect(a?.revokedAt).toBeInstanceOf(Date);
    });

    it("leaves the tokens of other users untouched", async () => {
      const target = randomUUID();
      const other = randomUUID();
      const targetToken = makeToken({ userUuid: target });
      const otherToken = makeToken({ userUuid: other });
      await repository.save(targetToken);
      await repository.save(otherToken);

      await repository.revokeAllForUser(target);

      const untouched = await repository.findByTokenHash(otherToken.tokenHash);
      expect(untouched?.isRevoked).toBe(false);
      expect(untouched?.revokedAt).toBeNull();
    });

    it("does not overwrite the timestamp of a token that was already revoked", async () => {
      // The query filters on `revokedAt: null`, so a second call is a no-op for
      // rows that already carry a revocation date.
      const userUuid = randomUUID();
      const alreadyRevokedAt = new Date("2098-01-01T00:00:00.000Z");
      const revoked = new RefreshToken({
        id: uniqueId(),
        userUuid,
        tokenHash: uniqueTokenHash(),
        roles: ["user"],
        expiresAt: FUTURE,
        revokedAt: alreadyRevokedAt,
      });
      const active = makeToken({ userUuid });
      await repository.save(revoked);
      await repository.save(active);

      await repository.revokeAllForUser(userUuid);

      const found = await repository.findByTokenHash(revoked.tokenHash);
      expect(found?.revokedAt).toEqual(alreadyRevokedAt);
    });

    it("is a no-op for a user that owns no tokens", async () => {
      // A brand new uuid plus one known-good token proves the call neither
      // errors nor revokes rows outside the target user.
      const bystander = makeToken({ userUuid: randomUUID() });
      await repository.save(bystander);

      await expect(repository.revokeAllForUser(randomUUID())).resolves.toBeUndefined();

      const found = await repository.findByTokenHash(bystander.tokenHash);
      expect(found?.isRevoked).toBe(false);
    });
  });
});
