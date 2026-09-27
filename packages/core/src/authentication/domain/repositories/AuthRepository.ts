import { AuthUser } from "../entities/AuthUser.js";

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findByUuid(uuid: string): Promise<AuthUser | null>;
  save(user: AuthUser): Promise<void>;
  update(user: AuthUser): Promise<void>;
}
