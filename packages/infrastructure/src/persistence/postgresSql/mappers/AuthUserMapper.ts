import { AuthUser } from "@repo/core/authentication";
import type { AuthUserSchema } from "../prisma/generated/prisma/client.js";

export class AuthUserMapper {
  static toDomain(row: AuthUserSchema): AuthUser {
    return new AuthUser({
      uuid: row.uuid,
      email: row.email,
      passwordHash: row.passwordHash,
      roles: new Set(row.roles),
    });
  }

  static toPersistence(user: AuthUser): {
    uuid: string;
    email: string;
    passwordHash: string;
    roles: string[];
  } {
    return {
      uuid: user.uuid,
      email: user.email,
      passwordHash: user.passwordHash,
      roles: Array.from(user.roles),
    };
  }
}
