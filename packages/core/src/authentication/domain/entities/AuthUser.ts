export interface AuthUserProps {
  uuid: string;
  email: string;
  passwordHash: string;
  roles: Set<string>;
}

export class AuthUser {
  readonly _uuid: string;
  readonly _email: string;
  private _passwordHash: string;
  private _roles: Set<string>;

  constructor(props: AuthUserProps) {
    this._uuid = props.uuid;
    this._email = props.email;
    this._passwordHash = props.passwordHash;
    this._roles = new Set(props.roles);
  }

  get uuid(): string {
    return this._uuid;
  }

  get email(): string {
    return this._email;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get roles(): Set<string> {
    return new Set(this._roles);
  }

}
