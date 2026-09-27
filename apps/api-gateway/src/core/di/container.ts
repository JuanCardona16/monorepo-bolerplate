import {
  LoginUseCase,
  RefreshTokenUseCase,
  RegisterUserUseCase,
} from "@repo/core/authentication";
import {
  createAuthPrismaClient,
  PrismaAuthRepository,
  PrismaRefreshTokenRepository,
} from "@repo/infrastructure/persistence/postgresSql";
import {
  BcryptPasswordHasher,
  CryptoIdGenerator,
  JwtTokenProvider,
  Sha256RefreshTokenHasher,
} from "@repo/security";
import { AuthController } from "../../features/authentication/controllers/auth.controller.js";
import {
  DATABASE_URL,
  REFRESH_TOKEN_SECRET_KEY,
  TOKEN_SECRET_KEY,
} from "../../config/env/index.js";

const prisma = createAuthPrismaClient(DATABASE_URL);

const authRepository = new PrismaAuthRepository(prisma);
const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
const passwordHasher = new BcryptPasswordHasher();
const refreshTokenHasher = new Sha256RefreshTokenHasher();
const idGenerator = new CryptoIdGenerator();

export const tokenProvider = new JwtTokenProvider(TOKEN_SECRET_KEY, "15m");

export const loginUseCase = new LoginUseCase(
  authRepository,
  passwordHasher,
  tokenProvider,
  refreshTokenRepository,
  refreshTokenHasher,
  idGenerator,
);

export const registerUseCase = new RegisterUserUseCase(
  authRepository,
  passwordHasher,
  idGenerator,
);

export const refreshUseCase = new RefreshTokenUseCase(
  refreshTokenRepository,
  refreshTokenHasher,
  tokenProvider,
  idGenerator,
);

export const authController = new AuthController(
  loginUseCase,
  registerUseCase,
  refreshUseCase,
  refreshTokenRepository,
);
