import { AuthUser } from "../../domain/entities/AuthUser.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { UserAlreadyExistsError } from "../../domain/errors/UserAlreadyExistsError.js";
import { Email } from "../../domain/value-objects/Email.js";
import { Password } from "../../domain/value-objects/Password.js";
import { RegisterInputDTO } from "../dtos/RegisterInputDTO.js";
import { RegisterOutputDTO } from "../dtos/RegisterOutputDTO.js";
import { IdGenerator } from "../ports/IdGenerator.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";

export class RegisterUserUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: RegisterInputDTO): Promise<RegisterOutputDTO> {
    const email = new Email(input.email);
    const password = new Password(input.password);

    const existingUser = await this.authRepository.findByEmail(email.value);
    if (existingUser) {
      throw new UserAlreadyExistsError();
    }

    const passwordHash = await this.passwordHasher.hash(password.value);

    const user = new AuthUser({
      uuid: this.idGenerator.generate(),
      email: email.value,
      passwordHash,
      roles: new Set(["user"]),
    });

    await this.authRepository.save(user);

    return { uuid: user.uuid };
  }
}
