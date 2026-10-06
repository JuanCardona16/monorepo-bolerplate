import { describe, expect, it } from "vitest";

import { BcryptPasswordHasher } from "../BcryptPasswordHasher.js";

// Real bcrypt hashing is exercised on purpose: no mocks, no injected rounds.
// Every instance uses the adapter default cost so the suite verifies the
// production configuration, not a weakened one.
const PASSWORD = "correct horse battery staple";

describe("BcryptPasswordHasher", () => {
  it("never returns the plaintext as the hash", async () => {
    const hasher = new BcryptPasswordHasher();

    const hash = await hasher.hash(PASSWORD);

    expect(hash).not.toBe(PASSWORD);
    expect(PASSWORD).not.toContain(hash);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("produces a bcrypt digest recognizable by its algorithm prefix", async () => {
    const hasher = new BcryptPasswordHasher();

    const hash = await hasher.hash(PASSWORD);

    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("salts the digest, so hashing the same password twice differs", async () => {
    const hasher = new BcryptPasswordHasher();

    const first = await hasher.hash(PASSWORD);
    const second = await hasher.hash(PASSWORD);

    expect(first).not.toBe(second);
    // Both digests still validate the original password.
    await expect(hasher.compare(PASSWORD, first)).resolves.toBe(true);
    await expect(hasher.compare(PASSWORD, second)).resolves.toBe(true);
  });

  it("returns true when the password matches its own hash", async () => {
    const hasher = new BcryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.compare(PASSWORD, hash)).resolves.toBe(true);
  });

  it("returns false when the password does not match the hash", async () => {
    const hasher = new BcryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.compare("wrong password", hash)).resolves.toBe(false);
  });

  it("is case and whitespace sensitive", async () => {
    const hasher = new BcryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.compare(PASSWORD.toUpperCase(), hash)).resolves.toBe(
      false,
    );
    await expect(hasher.compare(` ${PASSWORD}`, hash)).resolves.toBe(false);
  });

  it("returns false against a malformed hash instead of throwing", async () => {
    const hasher = new BcryptPasswordHasher();

    await expect(hasher.compare(PASSWORD, "not-a-bcrypt-hash")).resolves.toBe(
      false,
    );
    await expect(hasher.compare(PASSWORD, "")).resolves.toBe(false);
  });

  it("cross-checks hashes produced by independent instances", async () => {
    const first = new BcryptPasswordHasher();
    const second = new BcryptPasswordHasher();
    const hash = await first.hash(PASSWORD);

    await expect(second.compare(PASSWORD, hash)).resolves.toBe(true);
  });

  it("supports non-ascii passwords without mangling them", async () => {
    const hasher = new BcryptPasswordHasher();
    const unicodePassword = "pá$$w0rd-ñ-🔐";

    const hash = await hasher.hash(unicodePassword);

    await expect(hasher.compare(unicodePassword, hash)).resolves.toBe(true);
    await expect(hasher.compare("password", hash)).resolves.toBe(false);
  });

  it(
    "respects a higher explicit cost when provided",
    // Cost 12 = 2^12 rounds de bcrypt, CPU-bound: bajo turbo en paralelo
    // supera los 5s default de vitest (TK-17). Timeout por test, no global.
    { timeout: 30_000 },
    async () => {
      const hasher = new BcryptPasswordHasher(12);

      const hash = await hasher.hash(PASSWORD);

      // Cost is encoded in the digest header, not supplied separately.
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
      await expect(hasher.compare(PASSWORD, hash)).resolves.toBe(true);
    },
  );
});
