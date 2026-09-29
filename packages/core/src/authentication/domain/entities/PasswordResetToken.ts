import { InvalidResetTokenError } from "../errors/InvalidResetTokenError.js";

export interface PasswordResetTokenProps {
  id: string;
  userUuid: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * A one-time, expiring credential that authorizes a single password change.
 *
 * The entity only ever holds the **hash** of the token. The raw value lives in
 * the email body and is never persisted anywhere, so a leak of this table does
 * not let anybody reset an account: sha256 of a high-entropy random string is
 * not reversible by dictionary attack the way a password hash is not either.
 *
 * Single use and expiry are properties of the entity rather than of the
 * repository, so both are enforced by the same code that creates the record and
 * cannot drift apart.
 */
export class PasswordResetToken {
  readonly _id: string;
  readonly _userUuid: string;
  readonly _tokenHash: string;
  readonly _expiresAt: Date;
  private _usedAt: Date | null;

  constructor(props: PasswordResetTokenProps) {
    if (!props.id) {
      throw new InvalidResetTokenError("Password reset token id is required.");
    }
    if (!props.userUuid) {
      throw new InvalidResetTokenError("Password reset token owner is required.");
    }
    if (!props.tokenHash) {
      throw new InvalidResetTokenError("Password reset token hash is required.");
    }
    if (!(props.expiresAt instanceof Date) || Number.isNaN(props.expiresAt.getTime())) {
      throw new InvalidResetTokenError("Password reset token expiry must be a valid date.");
    }
    this._id = props.id;
    this._userUuid = props.userUuid;
    this._tokenHash = props.tokenHash;
    this._expiresAt = new Date(props.expiresAt);
    this._usedAt = props.usedAt ? new Date(props.usedAt) : null;
  }

  get id(): string {
    return this._id;
  }

  get userUuid(): string {
    return this._userUuid;
  }

  get tokenHash(): string {
    return this._tokenHash;
  }

  get expiresAt(): Date {
    return new Date(this._expiresAt);
  }

  get usedAt(): Date | null {
    return this._usedAt ? new Date(this._usedAt) : null;
  }

  get isUsed(): boolean {
    return this._usedAt !== null;
  }

  isExpired(now: Date = new Date()): boolean {
    return now >= this._expiresAt;
  }

  isActive(now: Date = new Date()): boolean {
    return !this.isUsed && !this.isExpired(now);
  }

  /**
   * Burns the token. A token that was already used stays used: re-marking it
   * would move `used_at` forward and hide when the credential was actually
   * spent, which is the only forensic trace a replay attempt leaves.
   */
  markUsed(now: Date = new Date()): void {
    if (this._usedAt === null) {
      this._usedAt = new Date(now);
    }
  }
}
