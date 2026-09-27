import { InvalidRefreshTokenError } from "../errors/InvalidRefreshTokenError.js";

export interface RefreshTokenProps {
  id: string;
  userUuid: string;
  tokenHash: string;
  roles: string[];
  expiresAt: Date;
  revokedAt: Date | null;
}

export class RefreshToken {
  readonly _id: string;
  readonly _userUuid: string;
  readonly _tokenHash: string;
  private _roles: Set<string>;
  readonly _expiresAt: Date;
  private _revokedAt: Date | null;

  constructor(props: RefreshTokenProps) {
    if (!props.id) {
      throw new InvalidRefreshTokenError("Refresh token id is required.");
    }
    if (!props.userUuid) {
      throw new InvalidRefreshTokenError("Refresh token owner is required.");
    }
    if (!props.tokenHash) {
      throw new InvalidRefreshTokenError("Refresh token hash is required.");
    }
    if (!(props.expiresAt instanceof Date) || Number.isNaN(props.expiresAt.getTime())) {
      throw new InvalidRefreshTokenError("Refresh token expiry must be a valid date.");
    }
    this._id = props.id;
    this._userUuid = props.userUuid;
    this._tokenHash = props.tokenHash;
    this._roles = new Set(props.roles);
    this._expiresAt = new Date(props.expiresAt);
    this._revokedAt = props.revokedAt ? new Date(props.revokedAt) : null;
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

  get roles(): Set<string> {
    return new Set(this._roles);
  }

  get expiresAt(): Date {
    return new Date(this._expiresAt);
  }

  get revokedAt(): Date | null {
    return this._revokedAt ? new Date(this._revokedAt) : null;
  }

  get isRevoked(): boolean {
    return this._revokedAt !== null;
  }

  isExpired(now: Date = new Date()): boolean {
    return now >= this._expiresAt;
  }

  isActive(now: Date = new Date()): boolean {
    return !this.isRevoked && !this.isExpired(now);
  }

  revoke(): void {
    this._revokedAt = new Date();
  }
}
