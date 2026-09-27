import { RefreshToken } from "../entities/RefreshToken.js";

export interface RefreshTokenRepository {
  save(token: RefreshToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revokeAllForUser(userUuid: string): Promise<void>;
}
