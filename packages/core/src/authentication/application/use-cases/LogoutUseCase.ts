import { AuthenticationError } from "../../domain/errors/AuthenticationError.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";

export class LogoutUseCase {
  constructor(private readonly refreshTokenRepository: RefreshTokenRepository) {}

  async execute(userUuid: string): Promise<void> {
    if (!userUuid) {
      throw new AuthenticationError("INVALID_USER", "Invalid user.");
    }
    await this.refreshTokenRepository.revokeAllForUser(userUuid);
  }
}
