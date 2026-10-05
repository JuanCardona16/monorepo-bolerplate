import { describe, expect, it } from "vitest";

import { resolveMongoUri } from "../connection.js";

describe("resolveMongoUri", () => {
  it("returns the trimmed uri when MONGODB_URI is set", () => {
    expect(resolveMongoUri({ MONGODB_URI: "mongodb://localhost:27017/auth " })).toBe(
      "mongodb://localhost:27017/auth",
    );
  });

  it("throws when MONGODB_URI is missing", () => {
    expect(() => resolveMongoUri({})).toThrowError(/MONGODB_URI/);
  });

  it("throws when MONGODB_URI is blank", () => {
    expect(() => resolveMongoUri({ MONGODB_URI: "   " })).toThrowError(/MONGODB_URI/);
  });
});
