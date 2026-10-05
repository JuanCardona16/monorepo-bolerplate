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
 *   pnpm mongo:promote-admin -- juan@gmail.com
 *   pnpm mongo:promote-admin -- juan@gmail.com --remove
 */
import mongoose from "mongoose";

import { Email } from "@repo/core/authentication";

import { resolveMongoUri } from "../connection.js";
import { AuthUserModel } from "../models/authUser.model.js";
import { RefreshTokenModel } from "../models/refreshToken.model.js";

const ADMIN_ROLE = "admin";
const BASE_ROLE = "user";

function parseArgs(argv: string[]): { email: string; remove: boolean } {
  const remove = argv.includes("--remove");
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const email = positional[0];

  if (!email) {
    throw new Error("Usage: pnpm mongo:promote-admin -- <email> [--remove]");
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

  await mongoose.connect(resolveMongoUri());
  try {
    const user = await AuthUserModel.findOne({ email }).lean().exec();
    if (!user) {
      throw new Error(
        `No user with email ${email}. Register the account through the API first.`,
      );
    }

    const current = new Set(user.roles);
    if (remove) {
      current.delete(ADMIN_ROLE);
    } else {
      current.add(ADMIN_ROLE);
    }
    if (current.size === 0) {
      current.add(BASE_ROLE);
    }

    await AuthUserModel.updateOne(
      { uuid: user.uuid },
      { $set: { roles: Array.from(current) } },
    ).exec();

    // Refresh tokens carry a snapshot of the roles, so active sessions are
    // revoked and the user signs in again with the new set.
    const { modifiedCount } = await RefreshTokenModel.updateMany(
      { userUuid: user.uuid, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();

    process.stdout.write(
      `${remove ? "Demoted" : "Promoted"} ${email} -> [${Array.from(current).join(", ")}]\n` +
        `Revoked ${modifiedCount} active refresh token(s); the user has to sign in again.\n`,
    );
  } finally {
    await mongoose.disconnect();
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
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
