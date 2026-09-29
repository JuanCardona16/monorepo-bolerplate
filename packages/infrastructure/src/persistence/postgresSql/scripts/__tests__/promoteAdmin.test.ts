import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidEmailError } from "@repo/core/authentication";

/**
 * The admin bootstrap script.
 *
 * It is a script and not a route on purpose: a route that can grant `admin`
 * without the caller already holding it is a privilege escalation path. What is
 * worth testing is the decision logic — the parsing, the email normalization and
 * the role set arithmetic — not the Prisma round trip, which needs a database.
 *
 * The Prisma assertions read `calls[0].data`, not `calls[1].data`: `update` and
 * `updateMany` take a SINGLE argument object holding `where`, `data` and
 * `select`, not a positional pair.
 */

const prismaMock = vi.hoisted(() => ({
  authUserSchema: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  refreshTokenSchema: {
    updateMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}));

// The specifier must match the one the script under test uses, resolved from
// that module. Writing it from the test's own location makes Vitest look for a
// different file, the mock silently does not apply, and the suite ends up
// connecting to a real database.
vi.mock("../../client.js", () => ({
  createAuthPrismaClient: () => prismaMock,
}));

const { run } = await import("../promoteAdmin.js");

beforeEach(() => {
  // The script refuses to run without a connection string, so the suite has to
  // provide one. The client is mocked, so nothing ever connects.
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:5432/unused";
  // Without this, `not.toHaveBeenCalled()` counts every earlier test too and
  // fails for a reason that has nothing to do with the assertion.
  vi.clearAllMocks();
});

function makeUser(roles: string[]) {
  return { uuid: "user-uuid", email: "user@example.com", roles };
}

describe("promote-admin", () => {
  it("adds the admin role while keeping the existing ones", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["user"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user", "admin"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 0 });

    await run(["user@example.com"]);

    const [call] = prismaMock.authUserSchema.update.mock.calls;
    expect(call?.[0]?.data?.roles).toEqual(["user", "admin"]);
  });

  it("is idempotent: promoting twice never duplicates the role", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["user", "admin"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user", "admin"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 0 });

    await run(["user@example.com"]);

    const [call] = prismaMock.authUserSchema.update.mock.calls;
    expect(call?.[0]?.data?.roles).toEqual(["user", "admin"]);
  });

  it("demotes on --remove", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["user", "admin"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 0 });

    await run(["user@example.com", "--remove"]);

    const [call] = prismaMock.authUserSchema.update.mock.calls;
    expect(call?.[0]?.data?.roles).toEqual(["user"]);
  });

  it("never leaves a user with an empty role set", async () => {
    // Demoting the last role would produce a user that no role check can pass.
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["admin"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 0 });

    await run(["user@example.com", "--remove"]);

    const [call] = prismaMock.authUserSchema.update.mock.calls;
    expect(call?.[0]?.data?.roles).toEqual(["user"]);
  });

  it("revokes the user's active refresh tokens", async () => {
    // Refresh tokens carry a snapshot of the roles, so without revoking, the
    // user would not see their new role until those tokens expired.
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["user"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user", "admin"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 3 });

    await run(["user@example.com"]);

    const [call] = prismaMock.refreshTokenSchema.updateMany.mock.calls;
    expect(call?.[0]?.where).toEqual({ userUuid: "user-uuid", revokedAt: null });
    expect(call?.[0]?.data?.revokedAt).toBeInstanceOf(Date);
  });

  it("normalizes the email before looking the user up", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(makeUser(["user"]));
    prismaMock.authUserSchema.update.mockResolvedValue({
      uuid: "user-uuid",
      email: "user@example.com",
      roles: ["user", "admin"],
    });
    prismaMock.refreshTokenSchema.updateMany.mockResolvedValue({ count: 0 });

    await run(["  USER@Example.COM  "]);

    const [call] = prismaMock.authUserSchema.findUnique.mock.calls;
    expect(call?.[0]?.where).toEqual({ email: "user@example.com" });
  });

  it("rejects a malformed email before touching the database", async () => {
    await expect(run(["not-an-email"])).rejects.toBeInstanceOf(InvalidEmailError);
    expect(prismaMock.authUserSchema.findUnique).not.toHaveBeenCalled();
  });

  it("explains the usage when no email is given", async () => {
    await expect(run([])).rejects.toThrow(/Usage/);
  });

  it("fails clearly when the user does not exist", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(null);

    await expect(run(["user@example.com"])).rejects.toThrow(/No user with email/);
  });

  it("disconnects the client even when the lookup fails", async () => {
    prismaMock.authUserSchema.findUnique.mockResolvedValue(null);

    await expect(run(["user@example.com"])).rejects.toThrow();
    expect(prismaMock.$disconnect).toHaveBeenCalled();
  });
});
