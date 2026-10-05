import { AuthUser } from "@repo/core/authentication";

import type { AuthUserDoc } from "../models/authUser.model.js";

export class MongoAuthUserMapper {
  static toDomain(doc: AuthUserDoc): AuthUser {
    return new AuthUser({
      uuid: doc.uuid,
      email: doc.email,
      passwordHash: doc.passwordHash,
      roles: new Set(doc.roles),
    });
  }

  static toPersistence(user: AuthUser): AuthUserDoc {
    return {
      uuid: user.uuid,
      email: user.email,
      passwordHash: user.passwordHash,
      roles: Array.from(user.roles),
    };
  }
}
