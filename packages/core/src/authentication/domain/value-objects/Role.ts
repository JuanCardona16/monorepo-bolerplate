import { InvalidRoleError } from "../errors/InvalidRoleError.js";

export class Role {
  readonly value: string;

  constructor(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      throw new InvalidRoleError();
    }
    this.value = normalized;
  }

  equals(other: Role): boolean {
    return this.value === other.value;
  }
}
