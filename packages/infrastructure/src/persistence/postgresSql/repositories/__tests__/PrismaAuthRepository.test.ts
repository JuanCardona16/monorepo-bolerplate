import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { AuthUser, UserAlreadyExistsError } from "@repo/core/authentication";

import { createAuthPrismaClient } from "../../client.js";
import { PrismaAuthRepository } from "../PrismaAuthRepository.js";
import type { PrismaClient } from "../../prisma/generated/prisma/client.js";

// These tests run against a real Postgres database that the application also
// uses, so every suite is gated on DATABASE_URL. In CI (no database) the whole
// suite reports as skipped instead of failing, which keeps the real-database
// contract visible without turning a missing service into a red build.
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// A bcrypt-shaped but deliberately fake hash. The repository must persist the
// value verbatim; hashing for real is the security package's job, not this one's.
const FAKE_PASSWORD_HASH =
  "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV";

// One client for the whole module: creating a pool per test would be slow and
// would hide connection handling problems.
const prisma: PrismaClient = createAuthPrismaClient(
  process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused"
);
const repository = new PrismaAuthRepository(prisma);

// Every value a test writes is registered here and removed in `afterEach`.
// Isolation is by unique key only: no TRUNCATE, no global deleteMany, so a
// concurrent run of the application never loses rows it did not create.
const createdUuids: string[] = [];
const createdEmails: string[] = [];

function uniqueEmail(): string {
  const email = `it-${randomUUID()}@prisma-repo.test`;
  createdEmails.push(email);
  return email;
}

function uniqueUuid(): string {
  const uuid = randomUUID();
  createdUuids.push(uuid);
  return uuid;
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return new AuthUser({
    uuid: overrides.uuid ?? uniqueUuid(),
    email: overrides.email ?? uniqueEmail(),
    passwordHash: overrides.passwordHash ?? FAKE_PASSWORD_HASH,
    roles: overrides.roles ?? new Set(["user"]),
  });
}

afterEach(async () => {
  // Scoped to the keys this module generated. Runs even when a test failed
  // halfway, so a failure never leaves rows behind.
  await prisma.authUserSchema.deleteMany({
    where: { OR: [{ uuid: { in: createdUuids } }, { email: { in: createdEmails } }] },
  });
  createdUuids.length = 0;
  createdEmails.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describeDb("PrismaAuthRepository (real Postgres)", () => {
  describe("save / findByEmail", () => {
    it("persists a user and reads it back with the same data", async () => {
      const user = makeUser({ roles: new Set(["user", "admin"]) });

      await repository.save(user);

      const found = await repository.findByEmail(user.email);

      expect(found).not.toBeNull();
      expect(found?.uuid).toBe(user.uuid);
      expect(found?.email).toBe(user.email);
      expect(found?.passwordHash).toBe(FAKE_PASSWORD_HASH);
      expect(found?.roles).toEqual(new Set(["user", "admin"]));
    });

    it("persists the password hash verbatim, never the plaintext", async () => {
      // Read the column directly so the assertion is about the database and not
      // about the mapper the repository also uses to read it back.
      const user = makeUser();

      await repository.save(user);

      const row = await prisma.authUserSchema.findUnique({ where: { uuid: user.uuid } });
      expect(row?.passwordHash).toBe(FAKE_PASSWORD_HASH);
      expect(row?.passwordHash).not.toBe(user.email);
      expect(row?.passwordHash.startsWith("$2b$")).toBe(true);
    });

    it("returns null for an email that does not exist", async () => {
      // Unique and never inserted, so the assertion does not depend on the
      // table being empty.
      const missing = `absent-${randomUUID()}@prisma-repo.test`;

      await expect(repository.findByEmail(missing)).resolves.toBeNull();
    });

    it("stores the email column as case-sensitive text", async () => {
      // The DATABASE is still case-sensitive: `email` is a plain TEXT column
      // with a plain unique btree index, compared byte by byte.
      //
      // Correctness no longer depends on that, because `Email` in @repo/core
      // normalizes to lowercase and every write goes through it. This test
      // exists to document that the column itself is NOT a second line of
      // defence: any code path that bypasses the value object would still be
      // able to create `User@x.com` alongside `user@x.com`.
      const email = uniqueEmail();
      await repository.save(makeUser({ email }));

      const upperCased = email.toUpperCase();

      expect(upperCased).not.toBe(email);
      await expect(repository.findByEmail(upperCased)).resolves.toBeNull();
    });

    it("finds the row when queried with the normalized spelling", async () => {
      // The counterpart of the test above: once the domain has normalized,
      // the normalized spelling is the only one that ever gets stored, so it
      // is the one that resolves.
      const email = uniqueEmail();
      await repository.save(makeUser({ email }));

      await expect(repository.findByEmail(email.toLowerCase())).resolves.not.toBeNull();
    });
  });

  describe("save duplicate detection", () => {
    it("throws UserAlreadyExistsError when the email is already taken", async () => {
      // This is the infrastructure-to-domain translation: Postgres reports a
      // P2002 unique violation and the repository must surface a domain error.
      const email = uniqueEmail();
      await repository.save(makeUser({ email }));

      const duplicate = new AuthUser({
        uuid: uniqueUuid(),
        email,
        passwordHash: FAKE_PASSWORD_HASH,
        roles: new Set(["user"]),
      });

      await expect(repository.save(duplicate)).rejects.toBeInstanceOf(UserAlreadyExistsError);
    });

    it("exposes the USER_ALREADY_EXISTS code the gateway maps to a status", async () => {
      const email = uniqueEmail();
      await repository.save(makeUser({ email }));

      const error = await repository
        .save(
          new AuthUser({
            uuid: uniqueUuid(),
            email,
            passwordHash: FAKE_PASSWORD_HASH,
            roles: new Set(["user"]),
          })
        )
        .then(
          () => null,
          (rejected: unknown) => rejected
        );

      expect(error).toBeInstanceOf(UserAlreadyExistsError);
      expect((error as UserAlreadyExistsError).code).toBe("USER_ALREADY_EXISTS");
    });

    it("leaves no partial row behind when the duplicate is rejected", async () => {
      const email = uniqueEmail();
      await repository.save(makeUser({ email }));
      const duplicateUuid = uniqueUuid();

      await repository
        .save(
          new AuthUser({
            uuid: duplicateUuid,
            email,
            passwordHash: FAKE_PASSWORD_HASH,
            roles: new Set(["user"]),
          })
        )
        .catch(() => undefined);

      const orphan = await prisma.authUserSchema.findUnique({ where: { uuid: duplicateUuid } });
      expect(orphan).toBeNull();
    });
  });

  describe("findByUuid", () => {
    it("finds a user saved through the repository", async () => {
      const user = makeUser({ roles: new Set(["user", "support"]) });

      await repository.save(user);

      const found = await repository.findByUuid(user.uuid);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(user.email);
      expect(found?.passwordHash).toBe(FAKE_PASSWORD_HASH);
      expect(found?.roles).toEqual(new Set(["user", "support"]));
    });

    it("returns null for a uuid that does not exist", async () => {
      await expect(repository.findByUuid(randomUUID())).resolves.toBeNull();
    });
  });

  describe("update", () => {
    it("persists changed roles and passwordHash", async () => {
      const user = makeUser({ roles: new Set(["user"]) });
      await repository.save(user);

      // `AuthUser` exposes no setter for the hash, so the realistic way to
      // rotate a password is to build a new entity with the same identity and
      // hand it to `update`.
      const rotatedHash = "$2b$10$ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
      const rotated = new AuthUser({
        uuid: user.uuid,
        email: user.email,
        passwordHash: rotatedHash,
        roles: new Set(["user", "admin"]),
      });

      await repository.update(rotated);

      const found = await repository.findByUuid(user.uuid);
      expect(found?.roles).toEqual(new Set(["user", "admin"]));
      expect(found?.passwordHash).toBe(rotatedHash);
    });

    it("removes roles the new entity no longer holds", async () => {
      // `update` sends the full payload, so roles the entity dropped disappear
      // from the column instead of accumulating.
      const user = makeUser({ roles: new Set(["user", "admin"]) });
      await repository.save(user);
      const demoted = new AuthUser({
        uuid: user.uuid,
        email: user.email,
        passwordHash: user.passwordHash,
        roles: new Set(["user"]),
      });

      await repository.update(demoted);

      const found = await repository.findByUuid(user.uuid);
      expect(found?.roles).toEqual(new Set(["user"]));
    });

    it("keeps the email and uuid of the updated user", async () => {
      const user = makeUser();
      await repository.save(user);
      const promoted = new AuthUser({
        uuid: user.uuid,
        email: user.email,
        passwordHash: user.passwordHash,
        roles: new Set(["user", "admin"]),
      });

      await repository.update(promoted);

      const found = await repository.findByEmail(user.email);
      expect(found?.uuid).toBe(user.uuid);
      expect(found?.email).toBe(user.email);
    });

    it("normalises roles through the entity before writing them", async () => {
      // `assignRole` runs the value through `Role`, which lowercases it, so the
      // column ends up with the normalised form.
      const user = makeUser({ roles: new Set(["user"]) });
      await repository.save(user);
      user.assignRole("SUPER_ADMIN");

      await repository.update(user);

      const found = await repository.findByUuid(user.uuid);
      expect(found?.roles).toEqual(new Set(["user", "super_admin"]));
    });
  });
});
