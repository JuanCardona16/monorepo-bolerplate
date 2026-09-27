import { AuthUser } from "../../domain/entities/AuthUser.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { UserAlreadyExistsError } from "../../domain/errors/UserAlreadyExistsError.js";
import { Email } from "../../domain/value-objects/Email.js";
import { Password } from "../../domain/value-objects/Password.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";

export class RegisterUserUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(rawEmail: string, rawPassword: string): Promise<void> {
    const email = new Email(rawEmail);
    const password = new Password(rawPassword);

    const existingUser = await this.authRepository.findByEmail(email.value);
    if (existingUser) {
      throw new UserAlreadyExistsError();
    }

    const passwordHash = await this.passwordHasher.hash(password.value);

    const user = new AuthUser({
      uuid: crypto.randomUUID(),
      email: email.value,
      passwordHash,
      roles: new Set(["user"]),
    });

    await this.authRepository.save(user);
  }
}
