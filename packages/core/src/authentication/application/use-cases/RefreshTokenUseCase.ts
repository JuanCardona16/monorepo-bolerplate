import { RefreshToken } from "../../domain/entities/RefreshToken.js";
import { InvalidRefreshTokenError } from "../../domain/errors/InvalidRefreshTokenError.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { RefreshTokenHasher } from "../ports/RefreshTokenHasher.js";
import { TokenProvider } from "../ports/TokenProvider.js";
import { RefreshInputDTO } from "../dtos/RefreshInputDTO.js";
import { RefreshOutputDTO } from "../dtos/RefreshOutputDTO.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class RefreshTokenUseCase {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly tokenProvider: TokenProvider,
  ) {}

  async execute(refreshDTO: RefreshInputDTO): Promise<RefreshOutputDTO> {
    if (!refreshDTO.refreshToken) {
      throw new InvalidRefreshTokenError();
    }

    const tokenHash = await this.refreshTokenHasher.hash(refreshDTO.refreshToken);
    const stored = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!stored) {
      throw new InvalidRefreshTokenError();
    }
    if (stored.isRevoked) {
      await this.refreshTokenRepository.revokeAllForUser(stored.userUuid);
      throw new InvalidRefreshTokenError();
    }
    if (stored.isExpired()) {
      throw new InvalidRefreshTokenError();
    }

    stored.revoke();
    await this.refreshTokenRepository.save(stored);

    const rawToken = crypto.randomUUID();
    const rotated = new RefreshToken({
      id: crypto.randomUUID(),
      userUuid: stored.userUuid,
      tokenHash: await this.refreshTokenHasher.hash(rawToken),
      roles: Array.from(stored.roles),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });
    await this.refreshTokenRepository.save(rotated);

    const accessToken = await this.tokenProvider.generate({
      userUuid: stored.userUuid,
      roles: Array.from(stored.roles),
    });

    return { accessToken, refreshToken: rawToken };
  }
}
