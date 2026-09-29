import { describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "../../../domain/errors/AuthenticationError.js";
import { LogoutUseCase } from "../LogoutUseCase.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";

const USER_UUID = "user-uuid-1";

function makeRefreshTokenRepository(): RefreshTokenRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByTokenHash: vi.fn().mockResolvedValue(null),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LogoutUseCase", () => {
  it("revokes every refresh token for the user", async () => {
    const repository = makeRefreshTokenRepository();

    await new LogoutUseCase(repository).execute(USER_UUID);

    expect(repository.revokeAllForUser).toHaveBeenCalledWith(USER_UUID);
  });

  it("resolves to nothing on success", async () => {
    const repository = makeRefreshTokenRepository();

    await expect(new LogoutUseCase(repository).execute(USER_UUID)).resolves.toBeUndefined();
  });

  it("throws AuthenticationError when the user uuid is missing", async () => {
    const repository = makeRefreshTokenRepository();

    await expect(new LogoutUseCase(repository).execute("")).rejects.toThrow(
      AuthenticationError,
    );
  });

  it("does not touch the repository when the user uuid is missing", async () => {
    const repository = makeRefreshTokenRepository();

    await new LogoutUseCase(repository)
      .execute("")
      .catch(() => undefined);

    expect(repository.revokeAllForUser).not.toHaveBeenCalled();
  });
});
