import { PasswordResetToken } from "../entities/PasswordResetToken.js";

export interface PasswordResetTokenRepository {
  save(token: PasswordResetToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  /**
   * Burns every outstanding token of a user.
   *
   * Called after a successful reset so an older, still-unused link cannot be
   * replayed against the account afterwards. Leaving two live reset links per
   * account means a password change does not actually end the attacker's
   * window.
   */
  revokeAllForUser(userUuid: string): Promise<void>;
}
