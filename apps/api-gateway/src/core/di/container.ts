import {
  AuthRepository,
  ChangeUserRolesUseCase,
  ConfirmPasswordResetUseCase,
  EmailSender,
  GetProfileUseCase,
  IdGenerator,
  LoginUseCase,
  PasswordHasher,
  PasswordResetTokenRepository,
  RefreshTokenHasher,
  RefreshTokenRepository,
  RefreshTokenUseCase,
  RegisterUserUseCase,
  LogoutUseCase,
  RequestPasswordResetUseCase,
  TokenProvider,
} from "@repo/core/authentication";
import {
  createAuthPrismaClient,
  PrismaAuthRepository,
  PrismaPasswordResetTokenRepository,
  PrismaRefreshTokenRepository,
  PrismaClient,
} from "@repo/infrastructure/persistence/postgresSql";
import { ResendEmailSender } from "@repo/infrastructure/email";
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
  EMAIL_FROM,
  PASSWORD_RESET_URL,
  RESEND_API_KEY,
  TOKEN_SECRET_KEY,
} from "../../config/env/index.js";

export interface ContainerOverrides {
  prisma?: PrismaClient;
  authRepository?: AuthRepository;
  refreshTokenRepository?: RefreshTokenRepository;
  passwordResetTokenRepository?: PasswordResetTokenRepository;
  passwordHasher?: PasswordHasher;
  refreshTokenHasher?: RefreshTokenHasher;
  idGenerator?: IdGenerator;
  tokenProvider?: TokenProvider;
  emailSender?: EmailSender;
}

export interface AuthContainer {
  prisma: PrismaClient;
  tokenProvider: TokenProvider;
  loginUseCase: LoginUseCase;
  registerUseCase: RegisterUserUseCase;
  refreshUseCase: RefreshTokenUseCase;
  logoutUseCase: LogoutUseCase;
  getProfileUseCase: GetProfileUseCase;
  changeUserRolesUseCase: ChangeUserRolesUseCase;
  requestPasswordResetUseCase: RequestPasswordResetUseCase;
  confirmPasswordResetUseCase: ConfirmPasswordResetUseCase;
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
  const passwordResetTokenRepository =
    overrides.passwordResetTokenRepository ?? new PrismaPasswordResetTokenRepository(prisma);
  // The reset token is hashed with the very same sha256 hasher as the refresh
  // token. Both are high-entropy random strings rather than user-chosen
  // secrets, so a fast digest is the right tool: there is nothing to brute
  // force, and bcrypt's slowness would only add latency to a request the user
  // is waiting on.
  const emailSender =
    overrides.emailSender ?? new ResendEmailSender({ apiKey: RESEND_API_KEY, from: EMAIL_FROM });

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
  const changeUserRolesUseCase = new ChangeUserRolesUseCase(
    authRepository,
    refreshTokenRepository,
  );
  const requestPasswordResetUseCase = new RequestPasswordResetUseCase(
    authRepository,
    passwordResetTokenRepository,
    refreshTokenHasher,
    idGenerator,
    emailSender,
    PASSWORD_RESET_URL,
  );
  const confirmPasswordResetUseCase = new ConfirmPasswordResetUseCase(
    authRepository,
    refreshTokenRepository,
    passwordResetTokenRepository,
    passwordHasher,
    refreshTokenHasher,
  );
  const authController = new AuthController(
    loginUseCase,
    registerUseCase,
    refreshUseCase,
    logoutUseCase,
    getProfileUseCase,
    changeUserRolesUseCase,
    requestPasswordResetUseCase,
    confirmPasswordResetUseCase,
  );

  return {
    prisma,
    tokenProvider,
    loginUseCase,
    registerUseCase,
    refreshUseCase,
    logoutUseCase,
    getProfileUseCase,
    changeUserRolesUseCase,
    requestPasswordResetUseCase,
    confirmPasswordResetUseCase,
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
