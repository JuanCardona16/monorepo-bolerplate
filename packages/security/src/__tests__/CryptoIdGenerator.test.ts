import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CryptoIdGenerator } from "../CryptoIdGenerator.js";

// RFC 4122 version 4, variant 10xx.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("CryptoIdGenerator", () => {
  it("returns a canonical UUID string", () => {
    const generator = new CryptoIdGenerator();

    const id = generator.generate();

    expect(typeof id).toBe("string");
    expect(id).toMatch(UUID_V4);
  });

  it("produces the same shape as node crypto randomUUID", () => {
    const generator = new CryptoIdGenerator();

    expect(generator.generate()).toHaveLength(36);
  });

  it("returns a different value on consecutive calls", () => {
    const generator = new CryptoIdGenerator();

    const ids = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      ids.add(generator.generate());
    }

    expect(ids.size).toBe(1000);
  });

  it("does not repeat across instances", () => {
    const first = new CryptoIdGenerator();
    const second = new CryptoIdGenerator();

    expect(first.generate()).not.toBe(second.generate());
  });

  it("sets the version 4 and variant bits required by RFC 4122", () => {
    const generator = new CryptoIdGenerator();

    for (let index = 0; index < 50; index += 1) {
      const id = generator.generate();
      const versionNibble = id.charAt(14);
      const variantNibble = id.charAt(19);

      expect(versionNibble).toBe("4");
      expect(["8", "9", "a", "b"]).toContain(variantNibble);
    }
  });

  it("produces ids indistinguishable in format from node crypto randomUUID", () => {
    const generator = new CryptoIdGenerator();

    // Both the adapter and the platform primitive must satisfy the same shape.
    expect(generator.generate()).toMatch(UUID_V4);
    expect(randomUUID()).toMatch(UUID_V4);
  });

  it("yields ids in generation order that are not monotonically increasing", () => {
    const generator = new CryptoIdGenerator();
    const ids = Array.from({ length: 200 }, () => generator.generate());

    // A time ordered or counter based generator would emit a strictly
    // increasing sequence. Random v4 ids must show at least one descent.
    const hasDescent = ids.some(
      (value, index) => index > 0 && (ids[index - 1] ?? "") > value,
    );

    expect(hasDescent).toBe(true);
  });
});
