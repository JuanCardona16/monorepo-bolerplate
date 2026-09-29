import { AuthUser } from "../../domain/entities/AuthUser.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { InvalidCredentialsError } from "../../domain/errors/InvalidCredentialsError.js";
import { Role } from "../../domain/value-objects/Role.js";

export interface ChangeUserRolesInput {
  targetUserUuid: string;
  roles: string[];
}

/**
 * Replaces the role set of an existing user.
 *
 * This is a full replace, not a merge: the caller sends the complete intended
 * set and the entity ends up holding exactly that. Anything else would leave the
 * system unable to remove a role, and a role you can grant but never revoke is
 * not a permission system.
 *
 * Every session for the target is revoked afterwards. Their refresh tokens
 * carry a snapshot of the roles, so without this a demoted user keeps their
 * privileges until the refresh token expires on its own.
 */
export class ChangeUserRolesUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(input: ChangeUserRolesInput): Promise<AuthUser> {
    if (!input.targetUserUuid) {
      throw new InvalidCredentialsError();
    }

    const user = await this.authRepository.findByUuid(input.targetUserUuid);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    // `Role` both validates and normalizes. Validating with it and then storing
    // the raw string persisted `"  ADMIN  "` verbatim, so `hasRole("admin")`
    // missed it and `requireRole("admin")` on the gateway rejected the holder.
    const normalizedRoles = input.roles.map((role) => new Role(role).value);

    const replacement = new AuthUser({
      uuid: user.uuid,
      email: user.email,
      passwordHash: user.passwordHash,
      roles: new Set(normalizedRoles),
    });

    await this.authRepository.update(replacement);
    await this.refreshTokenRepository.revokeAllForUser(user.uuid);

    return replacement;
  }
}
