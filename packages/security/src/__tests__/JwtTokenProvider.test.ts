import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { JwtTokenProvider } from "../JwtTokenProvider.js";

// Hardcoded throwaway secret: these credentials exist only inside the test
// process and are never wired to any real environment.
const SECRET = "test-only-secret-not-used-anywhere-else";
const OTHER_SECRET = "a-completely-different-test-secret";
const LONG_EXPIRY = "1h";

const PAYLOAD = { userUuid: "5f1c1a2e-7b3d-4a51-9c8e-0d2b4f6a8c10", roles: ["admin", "user"] };

describe("JwtTokenProvider", () => {
  it("generates a token with three dot separated segments", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    const token = await provider.generate(PAYLOAD);

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("does not embed the payload in clear text", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    const token = await provider.generate(PAYLOAD);

    expect(token).not.toContain(PAYLOAD.userUuid);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded["userUuid"]).toBe(PAYLOAD.userUuid);
  });

  it("round trips the payload through generate and verify", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    const token = await provider.generate(PAYLOAD);
    const payload = await provider.verify(token);

    expect(payload).not.toBeNull();
    expect(payload?.userUuid).toBe(PAYLOAD.userUuid);
    expect(payload?.roles).toEqual(PAYLOAD.roles);
  });

  it("sets exp and iat claims on the generated token", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    const token = await provider.generate(PAYLOAD);
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(typeof decoded["exp"]).toBe("number");
    expect(typeof decoded["iat"]).toBe("number");
    expect(decoded["exp"] as number).toBeGreaterThan(decoded["iat"] as number);
  });

  it("preserves an empty roles array", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    const token = await provider.generate({ userUuid: "no-roles", roles: [] });
    const payload = await provider.verify(token);

    expect(payload?.roles).toEqual([]);
  });

  it("returns null for a token signed with a different secret", async () => {
    const issuer = new JwtTokenProvider(SECRET, LONG_EXPIRY);
    const other = new JwtTokenProvider(OTHER_SECRET, LONG_EXPIRY);
    const token = await issuer.generate(PAYLOAD);

    await expect(other.verify(token)).resolves.toBeNull();
  });

  it("returns null for a tampered payload", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);
    const token = await provider.generate(PAYLOAD);
    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ userUuid: "attacker", roles: ["admin"], exp: 9999999999 }),
      "utf8",
    ).toString("base64url");

    await expect(
      provider.verify(`${header}.${forgedPayload}.${signature}`),
    ).resolves.toBeNull();
    // Sanity: the untouched original still verifies.
    await expect(
      provider.verify(`${header}.${payload}.${signature}`),
    ).resolves.not.toBeNull();
  });

  it("returns null for structurally invalid token strings", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);

    await expect(provider.verify("")).resolves.toBeNull();
    await expect(provider.verify("not.a.jwt")).resolves.toBeNull();
    await expect(provider.verify("only-one-segment")).resolves.toBeNull();
  });

  it("returns null for a token whose signature was stripped", async () => {
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);
    const token = await provider.generate(PAYLOAD);
    const segments = token.split(".");
    const header = segments[0] ?? "";
    const payload = segments[1] ?? "";

    await expect(provider.verify(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it("returns null for an already expired token", async () => {
    // Deterministic: sign with a backdated iat so exp is in the past without
    // relying on wall-clock waiting or fake timers.
    const provider = new JwtTokenProvider(SECRET, LONG_EXPIRY);
    const token = jwt.sign(PAYLOAD, SECRET, {
      expiresIn: "-1s",
      header: { alg: "HS256" },
    });

    const expired = jwt.decode(token) as { exp?: number };
    expect(expired.exp).toBeTypeOf("number");
    await expect(provider.verify(token)).resolves.toBeNull();
  });
});
