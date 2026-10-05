import {
  AuthRepository,
  EmailSender,
  IdGenerator,
  PasswordHasher,
  PasswordResetTokenRepository,
  RefreshTokenHasher,
  RefreshTokenRepository,
  TokenProvider,
} from "@repo/core/authentication";
import {
  AuthUserModel,
  MongoAuthRepository,
  MongoPasswordResetTokenRepository,
  MongoRefreshTokenRepository,
  PasswordResetTokenModel,
  RefreshTokenModel,
} from "@repo/infrastructure/persistence/mongo";
import { ResendEmailSender } from "@repo/infrastructure/email";
import {
  BcryptPasswordHasher,
  CryptoIdGenerator,
  JwtTokenProvider,
  Sha256RefreshTokenHasher,
  TokenExpiry,
} from "@repo/security";
import {
  ACCESS_TOKEN_TTL,
  BCRYPT_ROUNDS,
  EMAIL_FROM,
  RESEND_API_KEY,
  TOKEN_SECRET_KEY,
} from "../../config/env/index.js";

/**
 * Infraestructura compartida del módulo Authentication.
 *
 * Los modelos Mongoose son singletons del package de infrastructure por
 * diseño (registro global de `mongoose`); todo lo demás se construye acá,
 * una vez, desde la configuración centralizada y validada de `config/env`.
 */
export interface AuthInfrastructure {
  authRepository: AuthRepository;
  refreshTokenRepository: RefreshTokenRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  passwordHasher: PasswordHasher;
  refreshTokenHasher: RefreshTokenHasher;
  idGenerator: IdGenerator;
  tokenProvider: TokenProvider;
  emailSender: EmailSender;
}

export function createAuthInfrastructure(): AuthInfrastructure {
  return {
    authRepository: new MongoAuthRepository(AuthUserModel),
    refreshTokenRepository: new MongoRefreshTokenRepository(RefreshTokenModel),
    passwordResetTokenRepository: new MongoPasswordResetTokenRepository(
      PasswordResetTokenModel,
    ),
    passwordHasher: new BcryptPasswordHasher(BCRYPT_ROUNDS),
    refreshTokenHasher: new Sha256RefreshTokenHasher(),
    idGenerator: new CryptoIdGenerator(),
    tokenProvider: new JwtTokenProvider(TOKEN_SECRET_KEY, ACCESS_TOKEN_TTL as TokenExpiry),
    // The reset token is hashed with the very same sha256 hasher as the refresh
    // token. Both are high-entropy random strings rather than user-chosen
    // secrets, so a fast digest is the right tool: there is nothing to brute
    // force, and bcrypt's slowness would only add latency to a request the user
    // is waiting on.
    emailSender: new ResendEmailSender({ apiKey: RESEND_API_KEY, from: EMAIL_FROM }),
  };
}
