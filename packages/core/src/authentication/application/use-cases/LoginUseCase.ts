import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { Email } from "../../domain/value-objects/Email.js";
import { RefreshToken } from "../../domain/entities/RefreshToken.js";
import { LoginInputDTO } from "../dtos/LoginInputDTO.js";
import { LoginOutputDTO } from "../dtos/LoginOutputDTO.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { InvalidCredentialsError } from "../../domain/errors/InvalidCredentialsError.js";
import { IdGenerator } from "../ports/IdGenerator.js";
import { RefreshTokenHasher } from "../ports/RefreshTokenHasher.js";
import { TokenProvider } from "../ports/TokenProvider.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenProvider: TokenProvider,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(loginDTO: LoginInputDTO): Promise<LoginOutputDTO> {
    const email = new Email(loginDTO.email);
    if (!loginDTO.password) {
      throw new InvalidCredentialsError();
    }

    const user = await this.authRepository.findByEmail(email.value);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await this.passwordHasher.compare(
      loginDTO.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const token = await this.tokenProvider.generate({
      userUuid: user.uuid,
      roles: Array.from(user.roles),
    });

    const rawRefreshToken = this.idGenerator.generate();
    const refreshToken = new RefreshToken({
      id: this.idGenerator.generate(),
      userUuid: user.uuid,
      tokenHash: await this.refreshTokenHasher.hash(rawRefreshToken),
      roles: Array.from(user.roles),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return { accessToken: token, refreshToken: rawRefreshToken };
  }
}
