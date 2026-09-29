/**
 * Promotes an existing user to admin, or demotes them back.
 *
 * Why this exists: the RBAC route `PUT /auth/users/:uuid/roles` requires the
 * caller to already hold the `admin` role, so nobody can grant it through the
 * API. Without a path that does not go through the API, the first admin can
 * never exist and the whole permission system is unusable.
 *
 * This is deliberately a script and not a route. A route that can grant admin
 * without already being admin is a privilege escalation path, not a feature.
 *
 * Usage (from `packages/infrastructure`):
 *   pnpm prisma:promote-admin -- juan@gmail.com
 *   pnpm prisma:promote-admin -- juan@gmail.com --remove
 */
import { Email } from "@repo/core/authentication";
import { createAuthPrismaClient } from "../client.js";

const ADMIN_ROLE = "admin";
const BASE_ROLE = "user";

function parseArgs(argv: string[]): { email: string; remove: boolean } {
  const remove = argv.includes("--remove");
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const email = positional[0];

  if (!email) {
    throw new Error(
      "Usage: pnpm prisma:promote-admin -- <email> [--remove]",
    );
  }
  return { email, remove };
}

/**
 * The decision logic, exported so it can be tested without a database.
 * `main` is the thin CLI wrapper around it.
 */
export async function run(argv: string[]): Promise<void> {
  const { email: rawEmail, remove } = parseArgs(argv);

  // `Email` normalizes, so the lookup uses the same spelling the app stores.
  const email = new Email(rawEmail).value;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Export it, or run this through the package script that loads the env file.",
    );
  }

  const prisma = createAuthPrismaClient(connectionString);
  try {
    const user = await prisma.authUserSchema.findUnique({ where: { email } });
    if (!user) {
      throw new Error(
        `No user with email ${email}. Register the account through the API first.`,
      );
    }

    // `roles` is a String[] column. Set semantics are not expressible in plain
    // SQL here, so the read/modify/write is the honest option: re-running the
    // script never duplicates the role.
    const current = new Set(user.roles);
    if (remove) {
      current.delete(ADMIN_ROLE);
    } else {
      current.add(ADMIN_ROLE);
    }
    if (current.size === 0) {
      current.add(BASE_ROLE);
    }

    const updated = await prisma.authUserSchema.update({
      where: { uuid: user.uuid },
      data: { roles: Array.from(current) },
      select: { uuid: true, email: true, roles: true },
    });

    // The user's refresh tokens carry a snapshot of the roles, so leaving them
    // in place would leave them without admin until those tokens expire.
    const { count } = await prisma.refreshTokenSchema.updateMany({
      where: { userUuid: updated.uuid, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    process.stdout.write(
      `${remove ? "Demoted" : "Promoted"} ${updated.email} -> [${updated.roles.join(", ")}]\n` +
        `Revoked ${count} active refresh token(s); the user has to sign in again.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function main(): Promise<void> {
  return run(process.argv.slice(2));
}

// Only self-execute when invoked as a program, so importing the module from a
// test does not try to promote someone.
const invokedDirectly = process.argv[1]?.includes("promoteAdmin");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
