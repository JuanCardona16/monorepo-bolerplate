import { AuthUser } from "../../domain/entities/AuthUser.js";
import { PasswordResetToken } from "../../domain/entities/PasswordResetToken.js";
import { InvalidResetTokenError } from "../../domain/errors/InvalidResetTokenError.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { Password } from "../../domain/value-objects/Password.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { RefreshTokenHasher } from "../ports/RefreshTokenHasher.js";

export interface ConfirmPasswordResetInput {
  token: string;
  password: string;
}

export interface ConfirmPasswordResetOutput {
  uuid: string;
}

/**
 * Trades a valid reset token for a new password.
 *
 * Every session of the account is revoked afterwards. Refresh tokens carry a
 * live session, so without that step a password reset leaves every stolen
 * session standing: the victim locks the door and the attacker keeps the key.
 * It is the same reasoning as `ChangeUserRolesUseCase` revoking on a demotion.
 */
export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokenHasher: RefreshTokenHasher,
  ) {}

  async execute(input: ConfirmPasswordResetInput): Promise<ConfirmPasswordResetOutput> {
    if (!input.token) {
      throw new InvalidResetTokenError();
    }

    const stored = await this.passwordResetTokenRepository.findByTokenHash(
      await this.refreshTokenHasher.hash(input.token),
    );
    // Unknown, already used and expired all collapse into the same refusal.
    // Splitting them would tell an attacker holding a stolen link which
    // condition killed it, and neither answer helps them.
    if (!stored || stored.isUsed || stored.isExpired()) {
      throw new InvalidResetTokenError();
    }

    // Validated BEFORE anything is written. A weak password must not burn the
    // token: the user would fix the typo, click the same link again, and find
    // it dead for a reason that has nothing to do with their mistake.
    const password = new Password(input.password);

    const user = await this.authRepository.findByUuid(stored.userUuid);
    if (!user) {
      // The account was deleted between the request and the confirmation. The
      // token is burned anyway: a credential whose subject no longer exists
      // must not stay redeemable if the uuid is ever reused.
      await this.burn(stored);
      throw new InvalidResetTokenError();
    }

    const replacement = new AuthUser({
      uuid: user.uuid,
      email: user.email,
      passwordHash: await this.passwordHasher.hash(password.value),
      roles: user.roles,
    });
    await this.authRepository.update(replacement);

    await this.burn(stored);

    await this.refreshTokenRepository.revokeAllForUser(stored.userUuid);

    return { uuid: replacement.uuid };
  }

  /**
   * Spends the token and every other outstanding one for the same user, so the
   * oldest email in the inbox stops working the moment a newer link is used.
   */
  private async burn(stored: PasswordResetToken): Promise<void> {
    stored.markUsed();
    await this.passwordResetTokenRepository.save(stored);
    await this.passwordResetTokenRepository.revokeAllForUser(stored.userUuid);
  }
}
