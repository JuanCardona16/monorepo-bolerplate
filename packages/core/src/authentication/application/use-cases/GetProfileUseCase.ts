import { InvalidCredentialsError } from "../../domain/errors/InvalidCredentialsError.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";

export interface ProfileOutput {
  uuid: string;
  email: string;
  roles: string[];
}

export class GetProfileUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(userUuid: string): Promise<ProfileOutput> {
    if (!userUuid) {
      throw new InvalidCredentialsError();
    }
    const user = await this.authRepository.findByUuid(userUuid);
    if (!user) {
      throw new InvalidCredentialsError();
    }
    return {
      uuid: user.uuid,
      email: user.email,
      roles: Array.from(user.roles),
    };
  }
}
