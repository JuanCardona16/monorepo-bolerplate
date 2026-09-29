import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmPasswordResetUseCase } from "../../../application/use-cases/ConfirmPasswordResetUseCase.js";
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  RequestPasswordResetUseCase,
} from "../../../application/use-cases/RequestPasswordResetUseCase.js";
import { EmailSendError } from "../../../domain/errors/EmailSendError.js";
import { PasswordResetToken } from "../../../domain/entities/PasswordResetToken.js";
import type { AuthRepository } from "../../../domain/repositories/AuthRepository.js";
import type { PasswordResetTokenRepository } from "../../../domain/repositories/PasswordResetTokenRepository.js";
import type { RefreshTokenRepository } from "../../../domain/repositories/RefreshTokenRepository.js";
import type { EmailSender } from "../../../application/ports/EmailSender.js";
import type { IdGenerator } from "../../../application/ports/IdGenerator.js";
import type { PasswordHasher } from "../../../application/ports/PasswordHasher.js";
import type { RefreshTokenHasher } from "../../../application/ports/RefreshTokenHasher.js";

/**
 * The two use cases wired together, in the order a real reset happens.
 *
 * Each test pins a guard that, taken alone, would still leave the system
 * broken:
 *
 *  1. the token that the email carries is the token the confirm step accepts;
 *  2. that token is dead the second time it is presented;
 *  3. an older, still-unread link stops working the moment a newer one is used;
 *  4. confirming revokes every session;
 *  5. a dead provider leaves the user's token usable.
 *
 * The guards in `RequestPasswordResetUseCase.test.ts` and
 * `ConfirmPasswordResetUseCase.test.ts` prove each use case obeys its own
 * rules. They use fakes for the other side, so nothing there proves the two
 * actually fit together, and that gap is where "the email says one thing and
 * the endpoint expects another" would live.
 */
const RESET_URL = "https://app.test/reset-password";
const EMAIL = "user@example.com";
const PASSWORD = "Str0ngPassw0rd";

/**
 * A shared in-memory store behind the two repositories, so the second use case
 * reads what the first one wrote. This is the whole point: two independent fakes
 * cannot catch a mismatch between a writer and a reader.
 */
class InMemoryResetTokens implements PasswordResetTokenRepository {
  readonly rows = new Map<string, PasswordResetToken>();
  readonly ids = new Set<string>();
  savedOrder: string[] = [];

  async save(token: PasswordResetToken): Promise<void> {
    // A fresh instance on every read, the way a real database behaves: the
    // "used" state has to survive a reload, not just live in the object the
    // writer happened to hold.
    const stored = new PasswordResetToken({
      id: token.id,
      userUuid: token.userUuid,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    });
    this.rows.set(stored.tokenHash, stored);
    this.ids.add(stored.id);
    this.savedOrder.push(stored.id);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.rows.get(tokenHash) ?? null;
  }

  async revokeAllForUser(userUuid: string): Promise<void> {
    for (const [hash, row] of this.rows) {
      if (row.userUuid === userUuid && !row.isUsed) {
        this.rows.set(
          hash,
          new PasswordResetToken({
            id: row.id,
            userUuid: row.userUuid,
            tokenHash: row.tokenHash,
            expiresAt: row.expiresAt,
            usedAt: new Date(),
          }),
        );
      }
    }
  }
}

type Harness = {
  authRepository: AuthRepository;
  refreshTokenRepository: RefreshTokenRepository;
  resetTokens: InMemoryResetTokens;
  emailSender: EmailSender;
  sent: string[];
  idGenerator: IdGenerator;
  refreshTokenHasher: RefreshTokenHasher;
  passwordHasher: PasswordHasher;
  knownUsers: Set<string>;
  sessionsRevoked: string[];
};

function sha256Like(raw: string): string {
  // Not a real digest, and it does not need to be: `@repo/core` has no Node
  // types and no runtime dependency, and this only has to be deterministic and
  // produce a string different from its input. The real adapter is covered
  // against sha256 in `PrismaRefreshTokenRepository`/`Sha256RefreshTokenHasher`.
  let accumulator = 0;
  for (let index = 0; index < raw.length; index += 1) {
    accumulator = (accumulator * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `h${accumulator.toString(16)}`;
}

function makeHarness(overrides: Partial<Harness> = {}): Harness {
  const state = {
    knownUsers: new Set<string>([EMAIL]),
    sessionsRevoked: [] as string[],
    sent: [] as string[],
    resetTokens: new InMemoryResetTokens(),
    ...overrides,
  } as Harness;

  const counter = { value: 0 };

  state.authRepository = {
    findByEmail: vi.fn(async (email: string) => {
      if (!state.knownUsers.has(email)) return null;
      return {
        uuid: "user-1",
        email,
        passwordHash: "$2b$10$old",
        roles: new Set(["user"]),
        hasRole: () => true,
      } as never;
    }),
    findByUuid: vi.fn(async (uuid: string) =>
      uuid === "user-1"
        ? ({
            uuid: "user-1",
            email: EMAIL,
            passwordHash: "$2b$10$old",
            roles: new Set(["user"]),
          } as never)
        : null,
    ),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };

  state.refreshTokenRepository = {
    save: vi.fn(async () => undefined),
    findByTokenHash: vi.fn(async () => null),
    revokeAllForUser: vi.fn(async (uuid: string) => {
      state.sessionsRevoked.push(uuid);
    }),
  };

  state.idGenerator = {
    generate: vi.fn(() => `token-${(counter.value += 1)}`),
  };
  state.refreshTokenHasher = {
    hash: vi.fn(async (raw: string) => sha256Like(raw)),
    verify: vi.fn(async (raw: string, hash: string) => hash === sha256Like(raw)),
  };
  state.passwordHasher = {
    hash: vi.fn(async (password: string) => `$2b$10$${password}`),
    compare: vi.fn(async () => false),
  };
  state.emailSender = {
    send: vi.fn(async (message: { text: string }) => {
      state.sent.push(message.text);
    }),
  };

  return state;
}

function requestUseCase(state: Harness): RequestPasswordResetUseCase {
  return new RequestPasswordResetUseCase(
    state.authRepository,
    state.resetTokens,
    state.refreshTokenHasher,
    state.idGenerator,
    state.emailSender,
    RESET_URL,
  );
}

function confirmUseCase(state: Harness): ConfirmPasswordResetUseCase {
  return new ConfirmPasswordResetUseCase(
    state.authRepository,
    state.refreshTokenRepository,
    state.resetTokens,
    state.passwordHasher,
    state.refreshTokenHasher,
  );
}

/**
 * Pulls the raw token back out of the link the user would have received.
 *
 * `nth` selects which email to read, so a test that requests twice can compare
 * the first link against the second. Defaulting to the *last* one would hide
 * that mistake: both would return the same token and the "older link is dead"
 * test would pass for the wrong reason.
 */
function tokenFromEmail(state: Harness, nth = 0): string {
  const body = state.sent[nth];
  if (body === undefined) throw new Error(`No email was sent (index ${nth}).`);
  const match = /#token=([^\s]+)/.exec(body);
  if (match?.[1] === undefined) throw new Error("No token found in the email body.");
  return decodeURIComponent(match[1]);
}

describe("password reset, end to end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the very token the email carried", async () => {
    const state = makeHarness();

    await requestUseCase(state).execute({ email: EMAIL });
    const raw = tokenFromEmail(state);

    const result = await confirmUseCase(state).execute({ token: raw, password: PASSWORD });

    expect(result.uuid).toBe("user-1");
    expect(state.authRepository.update).toHaveBeenCalledTimes(1);
  });

  it("never stores the raw token, only its digest", async () => {
    const state = makeHarness();

    await requestUseCase(state).execute({ email: EMAIL });
    const raw = tokenFromEmail(state);

    for (const key of state.resetTokens.rows.keys()) {
      expect(key).not.toBe(raw);
      expect(key).toBe(sha256Like(raw));
    }
  });

  it("refuses the same link a second time", async () => {
    const state = makeHarness();
    await requestUseCase(state).execute({ email: EMAIL });
    const raw = tokenFromEmail(state);

    await confirmUseCase(state).execute({ token: raw, password: PASSWORD });

    await expect(
      confirmUseCase(state).execute({ token: raw, password: "An0therPassw0rd" }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    // The second attempt must not have written a second password.
    expect(state.authRepository.update).toHaveBeenCalledTimes(1);
  });

  it("kills an older link as soon as a newer one is used", async () => {
    const state = makeHarness();
    await requestUseCase(state).execute({ email: EMAIL });
    const first = tokenFromEmail(state, 0);
    await requestUseCase(state).execute({ email: EMAIL });
    const second = tokenFromEmail(state, 1);
    expect(second).not.toBe(first);

    await confirmUseCase(state).execute({ token: second, password: PASSWORD });

    await expect(
      confirmUseCase(state).execute({ token: first, password: "An0therPassw0rd" }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
  });

  it("revokes every session of the account when the reset is confirmed", async () => {
    const state = makeHarness();
    await requestUseCase(state).execute({ email: EMAIL });
    const raw = tokenFromEmail(state);

    await confirmUseCase(state).execute({ token: raw, password: PASSWORD });

    expect(state.sessionsRevoked).toEqual(["user-1"]);
  });

  it("revokes the sessions even when the request never reached a real user", async () => {
    const state = makeHarness();

    await requestUseCase(state).execute({ email: "nobody@example.com" });

    expect(state.sent).toHaveLength(0);
    expect(state.resetTokens.rows.size).toBe(0);
    // Nothing to revoke, and nothing attempted either.
    expect(state.sessionsRevoked).toEqual([]);
  });

  it("leaves the token usable when the email provider is down", async () => {
    // Design decision 5. The failure is swallowed on the request side, so the
    // response is the same silent 202 either way; what has to survive is the
    // token, because a retry of `forgot` would otherwise be the only way out
    // and the user has no way to know that.
    const state = makeHarness();
    const failing: EmailSender = {
      send: vi.fn(async () => {
        throw new EmailSendError();
      }),
    };
    const request = new RequestPasswordResetUseCase(
      state.authRepository,
      state.resetTokens,
      state.refreshTokenHasher,
      state.idGenerator,
      failing,
      RESET_URL,
    );

    await expect(request.execute({ email: EMAIL })).resolves.toBeUndefined();

    expect(state.resetTokens.rows.size).toBe(1);
    const [row] = [...state.resetTokens.rows.values()];
    expect(row?.isUsed).toBe(false);
    expect(row?.isExpired()).toBe(false);
  });

  it("mints a token the confirm step can use even after a failed delivery, on retry", async () => {
    const state = makeHarness();
    let attempts = 0;
    const flaky: EmailSender = {
      send: vi.fn(async (message) => {
        attempts += 1;
        if (attempts === 1) throw new EmailSendError();
        state.sent.push(message.text);
      }),
    };
    const request = new RequestPasswordResetUseCase(
      state.authRepository,
      state.resetTokens,
      state.refreshTokenHasher,
      state.idGenerator,
      flaky,
      RESET_URL,
    );

    await request.execute({ email: EMAIL });
    await request.execute({ email: EMAIL });

    // Only one email was ever delivered, so this is still index 0. The retry
    // produced the link the user actually received.
    const raw = tokenFromEmail(state);
    await expect(
      confirmUseCase(state).execute({ token: raw, password: PASSWORD }),
    ).resolves.toEqual({ uuid: "user-1" });
  });

  it("issues a token that expires an hour out, and refuses it past that", async () => {
    const state = makeHarness();

    await requestUseCase(state).execute({ email: EMAIL });
    const raw = tokenFromEmail(state);
    const [row] = [...state.resetTokens.rows.values()];

    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    expect(row?.isExpired()).toBe(false);

    // Simulate the hour passing by writing the row back already expired, which
    // is the only way to test the clock without a fake timer the whole suite
    // then has to agree to use.
    const expired = new PasswordResetToken({
      id: row?.id ?? "x",
      userUuid: row?.userUuid ?? "user-1",
      tokenHash: row?.tokenHash ?? "",
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    state.resetTokens.rows.set(expired.tokenHash, expired);

    await expect(
      confirmUseCase(state).execute({ token: raw, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(state.authRepository.update).not.toHaveBeenCalled();
  });
});
