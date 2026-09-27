import {
  AuthRepository,
  GetProfileUseCase,
  IdGenerator,
  LoginUseCase,
  PasswordHasher,
  RefreshTokenHasher,
  RefreshTokenRepository,
  RefreshTokenUseCase,
  RegisterUserUseCase,
  LogoutUseCase,
  TokenProvider,
} from "@repo/core/authentication";
import {
  createAuthPrismaClient,
  PrismaAuthRepository,
  PrismaRefreshTokenRepository,
  PrismaClient,
} from "@repo/infrastructure/persistence/postgresSql";
import {
  BcryptPasswordHasher,
  CryptoIdGenerator,
  JwtTokenProvider,
  Sha256RefreshTokenHasher,
  TokenExpiry,
} from "@repo/security";
import { AuthController } from "../../features/authentication/controllers/auth.controller.js";
import {
  ACCESS_TOKEN_TTL,
  BCRYPT_ROUNDS,
  DATABASE_URL,
  TOKEN_SECRET_KEY,
} from "../../config/env/index.js";

export interface ContainerOverrides {
  prisma?: PrismaClient;
  authRepository?: AuthRepository;
  refreshTokenRepository?: RefreshTokenRepository;
  passwordHasher?: PasswordHasher;
  refreshTokenHasher?: RefreshTokenHasher;
  idGenerator?: IdGenerator;
  tokenProvider?: TokenProvider;
}

export interface AuthContainer {
  prisma: PrismaClient;
  tokenProvider: TokenProvider;
  loginUseCase: LoginUseCase;
  registerUseCase: RegisterUserUseCase;
  refreshUseCase: RefreshTokenUseCase;
  logoutUseCase: LogoutUseCase;
  getProfileUseCase: GetProfileUseCase;
  authController: AuthController;
  close: () => Promise<void>;
}

export function createContainer(overrides: ContainerOverrides = {}): AuthContainer {
  const prisma = overrides.prisma ?? createAuthPrismaClient(DATABASE_URL);
  const authRepository = overrides.authRepository ?? new PrismaAuthRepository(prisma);
  const refreshTokenRepository =
    overrides.refreshTokenRepository ?? new PrismaRefreshTokenRepository(prisma);
  const passwordHasher = overrides.passwordHasher ?? new BcryptPasswordHasher(BCRYPT_ROUNDS);
  const refreshTokenHasher = overrides.refreshTokenHasher ?? new Sha256RefreshTokenHasher();
  const idGenerator = overrides.idGenerator ?? new CryptoIdGenerator();
  const tokenProvider =
    overrides.tokenProvider ??
    new JwtTokenProvider(TOKEN_SECRET_KEY, ACCESS_TOKEN_TTL as TokenExpiry);

  const loginUseCase = new LoginUseCase(
    authRepository,
    passwordHasher,
    tokenProvider,
    refreshTokenRepository,
    refreshTokenHasher,
    idGenerator,
  );
  const registerUseCase = new RegisterUserUseCase(authRepository, passwordHasher, idGenerator);
  const refreshUseCase = new RefreshTokenUseCase(
    refreshTokenRepository,
    refreshTokenHasher,
    tokenProvider,
    idGenerator,
  );
  const logoutUseCase = new LogoutUseCase(refreshTokenRepository);
  const getProfileUseCase = new GetProfileUseCase(authRepository);
  const authController = new AuthController(
    loginUseCase,
    registerUseCase,
    refreshUseCase,
    logoutUseCase,
    getProfileUseCase,
  );

  return {
    prisma,
    tokenProvider,
    loginUseCase,
    registerUseCase,
    refreshUseCase,
    logoutUseCase,
    getProfileUseCase,
    authController,
    close: () => prisma.$disconnect(),
  };
}

let cached: AuthContainer | null = null;

export function getContainer(): AuthContainer {
  if (!cached) {
    cached = createContainer();
  }
  return cached;
}

export async function closeContainer(): Promise<void> {
  if (cached) {
    await cached.close();
    cached = null;
  }
}
