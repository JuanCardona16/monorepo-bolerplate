import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { Sha256RefreshTokenHasher } from "../Sha256RefreshTokenHasher.js";

const RAW_TOKEN = "rt_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c";

describe("Sha256RefreshTokenHasher", () => {
  it("returns a 64 character lowercase hex digest", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const hash = await hasher.hash(RAW_TOKEN);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never leaks the raw token", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const hash = await hasher.hash(RAW_TOKEN);

    expect(hash).not.toBe(RAW_TOKEN);
    expect(hash).not.toContain(RAW_TOKEN);
  });

  it("is deterministic: the same input yields the same output", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const first = await hasher.hash(RAW_TOKEN);
    const second = await hasher.hash(RAW_TOKEN);

    expect(first).toBe(second);
  });

  it("is stable across independent instances (no random salt)", async () => {
    const first = new Sha256RefreshTokenHasher();
    const second = new Sha256RefreshTokenHasher();

    expect(await first.hash(RAW_TOKEN)).toBe(await second.hash(RAW_TOKEN));
  });

  it("yields different digests for different inputs", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const first = await hasher.hash(RAW_TOKEN);
    const second = await hasher.hash(`${RAW_TOKEN}x`);

    expect(first).not.toBe(second);
  });

  it("matches the reference sha256 digest of the raw token", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const expected = createHash("sha256").update(RAW_TOKEN, "utf8").digest("hex");

    await expect(hasher.hash(RAW_TOKEN)).resolves.toBe(expected);
  });

  it("hashes the empty string without throwing", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    const hash = await hasher.hash("");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(hasher.verify("", hash)).resolves.toBe(true);
  });

  it("verifies a token against its own hash", async () => {
    const hasher = new Sha256RefreshTokenHasher();
    const hash = await hasher.hash(RAW_TOKEN);

    await expect(hasher.verify(RAW_TOKEN, hash)).resolves.toBe(true);
  });

  it("rejects a different token against an existing hash", async () => {
    const hasher = new Sha256RefreshTokenHasher();
    const hash = await hasher.hash(RAW_TOKEN);

    await expect(hasher.verify("rt_other_token", hash)).resolves.toBe(false);
  });

  it("rejects an empty stored hash", async () => {
    const hasher = new Sha256RefreshTokenHasher();

    await expect(hasher.verify(RAW_TOKEN, "")).resolves.toBe(false);
  });

  it("rejects a stored hash of a different length without throwing", async () => {
    const hasher = new Sha256RefreshTokenHasher();
    // A truncated digest: the length guard must short-circuit before
    // timingSafeEqual, which requires equal-length buffers.
    const truncated = (await hasher.hash(RAW_TOKEN)).slice(0, 32);

    await expect(hasher.verify(RAW_TOKEN, truncated)).resolves.toBe(false);
  });

  it("rejects a non-hex stored hash of the right length", async () => {
    const hasher = new Sha256RefreshTokenHasher();
    const notHex = "z".repeat(64);

    await expect(hasher.verify(RAW_TOKEN, notHex)).resolves.toBe(false);
  });
});
