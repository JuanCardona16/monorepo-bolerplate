import {
  AuthRepository,
  AuthUser,
  UserAlreadyExistsError,
} from "@repo/core/authentication";
import { Prisma, PrismaClient } from "../prisma/generated/prisma/client.js";
import { AuthUserMapper } from "../mappers/AuthUserMapper.js";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    const row = await this.prisma.authUserSchema.findUnique({ where: { email } });
    return row ? AuthUserMapper.toDomain(row) : null;
  }

  async findByUuid(uuid: string): Promise<AuthUser | null> {
    const row = await this.prisma.authUserSchema.findUnique({ where: { uuid } });
    return row ? AuthUserMapper.toDomain(row) : null;
  }

  async save(user: AuthUser): Promise<void> {
    try {
      await this.prisma.authUserSchema.create({ data: AuthUserMapper.toPersistence(user) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new UserAlreadyExistsError();
      }
      throw error;
    }
  }

  async update(user: AuthUser): Promise<void> {
    await this.prisma.authUserSchema.update({
      where: { uuid: user.uuid },
      data: AuthUserMapper.toPersistence(user),
    });
  }
}
