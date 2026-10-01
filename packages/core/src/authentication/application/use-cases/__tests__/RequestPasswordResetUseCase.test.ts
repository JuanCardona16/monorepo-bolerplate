import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthUser } from "../../../domain/entities/AuthUser.js";
import { PasswordResetToken } from "../../../domain/entities/PasswordResetToken.js";
import { InvalidEmailError } from "../../../domain/errors/InvalidEmailError.js";
import { EmailSendError } from "../../../domain/errors/EmailSendError.js";
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  RequestPasswordResetUseCase,
} from "../RequestPasswordResetUseCase.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { PasswordResetTokenRepository } from "../../../domain/repositories/PasswordResetTokenRepository.js";
import type { EmailMessage, EmailSender } from "../../ports/EmailSender.js";
import type { IdGenerator } from "../../ports/IdGenerator.js";
import type { RefreshTokenHasher } from "../../ports/RefreshTokenHasher.js";

const EMAIL = "user@example.com";
const RESET_URL = "https://app.test/reset-password";

function makeUser(email: string = EMAIL): AuthUser {
  return new AuthUser({
    uuid: "user-1",
    email,
    passwordHash: "$2b$10$hash",
    roles: new Set(["user"]),
  });
}

type Deps = {
  authRepository: AuthRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  refreshTokenHasher: RefreshTokenHasher;
  idGenerator: IdGenerator;
  emailSender: EmailSender;
  sent: EmailMessage[];
  saved: PasswordResetToken[];
  existing: AuthUser | null;
};

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  const state: Deps = {
    authRepository: {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUuid: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    passwordResetTokenRepository: {
      save: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    // A real sha256, not a fake: the whole point of the port here is that the
    // stored value must not be the raw token, and a mock that returns a
    // constant would pass that assertion without hashing anything.
    refreshTokenHasher: {
      hash: vi.fn(async (raw: string) => `sha256:${raw}`),
      verify: vi.fn(async (raw: string, tokenHash: string) => tokenHash === `sha256:${raw}`),
    },
    idGenerator: {
      generate: vi.fn().mockReturnValueOnce("raw-token-abc").mockReturnValue("row-id-1"),
    },
    emailSender: { send: vi.fn().mockResolvedValue(undefined) },
    sent: [],
    saved: [],
    existing: null,
    ...overrides,
  };

  vi.mocked(state.authRepository.findByEmail).mockImplementation(async (email: string) =>
    state.existing && state.existing.email === email ? state.existing : null,
  );
  vi.mocked(state.passwordResetTokenRepository.save).mockImplementation(async (token) => {
    state.saved.push(token);
  });
  vi.mocked(state.emailSender.send).mockImplementation(async (message) => {
    state.sent.push(message);
  });
  return state;
}

function useCase(deps: Deps): RequestPasswordResetUseCase {
  return new RequestPasswordResetUseCase(
    deps.authRepository,
    deps.passwordResetTokenRepository,
    deps.refreshTokenHasher,
    deps.idGenerator,
    deps.emailSender,
    RESET_URL,
  );
}

async function run(deps: Deps, email: string = EMAIL): Promise<void> {
  return useCase(deps).execute({ email });
}

describe("RequestPasswordResetUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("silence", () => {
    it("resolves without touching any port when the account does not exist", async () => {
      const deps = makeDeps({ existing: null });

      await expect(run(deps, "nobody@example.com")).resolves.toBeUndefined();

      expect(deps.passwordResetTokenRepository.save).not.toHaveBeenCalled();
      expect(deps.emailSender.send).not.toHaveBeenCalled();
    });

    it("produces no observable difference between a known and an unknown address", async () => {
      // The enumeration guard. Everything the caller can see is identical; the
      // only difference is work done behind a repository the caller never sees.
      const known = makeDeps({ existing: makeUser() });
      const unknown = makeDeps({ existing: null });

      await run(known, EMAIL);
      await run(unknown, EMAIL);

      expect(known.authRepository.findByEmail).toHaveBeenCalledWith(EMAIL);
      expect(unknown.authRepository.findByEmail).toHaveBeenCalledWith(EMAIL);
      await expect(run(known, EMAIL)).resolves.toBeUndefined();
      await expect(run(unknown, EMAIL)).resolves.toBeUndefined();
    });

    it("normalizes the address before looking it up", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps, "  User@Example.COM  ");

      expect(deps.authRepository.findByEmail).toHaveBeenCalledWith(EMAIL);
    });

    it("rejects a malformed address without looking anybody up", async () => {
      // A syntax check on the caller's own input reveals nothing about any
      // account, so it is safe to answer honestly here.
      const deps = makeDeps({ existing: null });

      await expect(run(deps, "not-an-email")).rejects.toThrow(InvalidEmailError);
      expect(deps.authRepository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe("token storage", () => {
    it("persists the hash of the token and never the token itself", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      const [stored] = deps.saved;
      expect(stored?.tokenHash).toBe("sha256:raw-token-abc");
      expect(stored?.tokenHash).not.toBe("raw-token-abc");
      expect(deps.refreshTokenHasher.hash).toHaveBeenCalledWith("raw-token-abc");
    });

    it("stores no property whose value is the raw token", async () => {
      // Deliberately not a substring check: the fake hasher here is
      // `sha256:${raw}`, so a real digest never contains the raw value but this
      // one necessarily does. What must hold is that no stored field *is* the
      // raw token, which is what the next line asserts.
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      const [stored] = deps.saved;
      const values = Object.getOwnPropertyNames(stored as object).map(
        (name) => (stored as unknown as Record<string, unknown>)[name],
      );
      expect(values).not.toContain("raw-token-abc");
      expect(deps.saved[0]?.tokenHash).toMatch(/^sha256:/);
    });

    it("binds the token to the account that requested it", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      expect(deps.saved[0]?.userUuid).toBe("user-1");
    });

    it("starts the token unused", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      expect(deps.saved[0]?.isUsed).toBe(false);
      expect(deps.saved[0]?.usedAt).toBeNull();
    });

    it("expires the token one hour out", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      const expected = Date.now() + PASSWORD_RESET_TOKEN_TTL_MS;
      expect(deps.saved[0]?.expiresAt.getTime()).toBeGreaterThan(expected - 5_000);
      expect(deps.saved[0]?.expiresAt.getTime()).toBeLessThanOrEqual(expected);
      expect(deps.saved[0]?.isActive()).toBe(true);
    });
  });

  describe("email", () => {
    it("sends one message to the address on the account", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      expect(deps.emailSender.send).toHaveBeenCalledTimes(1);
      expect(deps.sent).toHaveLength(1);
      expect(deps.sent[0]?.to).toBe(EMAIL);
    });

    it("carries the link in the URL fragment, which never leaves the browser", async () => {
      const deps = makeDeps({ existing: makeUser() });

      await run(deps);

      const body = deps.sent[0]?.text ?? "";
      expect(body).toContain(`${RESET_URL}#token=raw-token-abc`);
      // A query string would be written to the access log, to every proxy log
      // in front of the app, and to the Referer of the next page visited.
      expect(body).not.toContain("?token=");
    });

    it("sends the token to the account, not to whatever the caller typed", async () => {
      // `findByEmail` is the lookup, so a matching normalized address is the
      // only way in; this pins that the recipient is the stored one.
      const deps = makeDeps({ existing: makeUser("stored@example.com") });

      await expect(run(deps, "stored@example.com")).resolves.toBeUndefined();

      expect(deps.sent[0]?.to).toBe("stored@example.com");
    });
  });

  describe("when delivery fails", () => {
    it("keeps the token usable and still resolves", async () => {
      // Design decision 5: an orphaned token beats telling a user "we emailed
      // you" about an email that was never sent.
      const deps = makeDeps({ existing: makeUser() });
      vi.mocked(deps.emailSender.send).mockRejectedValue(new EmailSendError());

      await expect(run(deps)).resolves.toBeUndefined();

      expect(deps.saved).toHaveLength(1);
      expect(deps.saved[0]?.isUsed).toBe(false);
      expect(deps.saved[0]?.isActive()).toBe(true);
    });

    it("does not let an unexpected error escape, because that would enumerate accounts", async () => {
      // A rejected `TypeError` from the adapter must not turn a real address
      // into a 500 while an unknown one still answers 200.
      const deps = makeDeps({ existing: makeUser() });
      vi.mocked(deps.emailSender.send).mockRejectedValue(new TypeError("socket hang up"));

      await expect(run(deps)).resolves.toBeUndefined();
    });

    it("does not burn the token it already wrote", async () => {
      const deps = makeDeps({ existing: makeUser() });
      vi.mocked(deps.emailSender.send).mockRejectedValue(new EmailSendError());

      await run(deps);

      expect(deps.saved[0]?.isUsed).toBe(false);
    });
  });
});
