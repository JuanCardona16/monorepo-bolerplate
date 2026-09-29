import { PasswordResetToken } from "../../domain/entities/PasswordResetToken.js";
import { AuthRepository } from "../../domain/repositories/AuthRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { Email } from "../../domain/value-objects/Email.js";
import { IdGenerator } from "../ports/IdGenerator.js";
import { RefreshTokenHasher } from "../ports/RefreshTokenHasher.js";
import { EmailSender } from "../ports/EmailSender.js";

export interface RequestPasswordResetInput {
  email: string;
}

/**
 * One hour. Long enough to survive a weekend of "I forgot it Friday afternoon",
 * short enough that a link forwarded by accident or sitting in an inbox for a
 * month is worthless.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a reset link, and answers the same thing every time.
 *
 * The contract that matters here is the silence: an unknown address and a known
 * one produce byte-identical output, because the only observable difference
 * between them would be an account-enumeration oracle. Everything below either
 * touches a repository the caller cannot see, or nothing at all.
 *
 * A malformed address is the one case that throws, and it does not leak
 * anything: it is a syntax check on the input the caller already sent, not a
 * lookup of that address.
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly idGenerator: IdGenerator,
    private readonly emailSender: EmailSender,
    private readonly resetUrl: string,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    const email = new Email(input.email);
    const user = await this.authRepository.findByEmail(email.value);

    // No account: stop here, with no token issued and no email sent. The caller
    // still receives a success, because saying otherwise is the enumeration bug.
    if (!user) {
      return;
    }

    const rawToken = this.idGenerator.generate();
    const token = new PasswordResetToken({
      id: this.idGenerator.generate(),
      userUuid: user.uuid,
      // Only the hash is persisted. The raw value exists in this local variable
      // and in the email body, and nowhere else.
      tokenHash: await this.refreshTokenHasher.hash(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      usedAt: null,
    });
    await this.passwordResetTokenRepository.save(token);

    const link = `${this.resetUrl}#token=${encodeURIComponent(rawToken)}`;
    // The token travels in the URL **fragment**, which browsers never put in an
    // HTTP request. It cannot reach the access log, a reverse proxy log, or the
    // Referer header of any page the user visits next. The reset page reads it
    // with `location.hash` and submits it in a request body.
    try {
      await this.emailSender.send({
        to: user.email,
        subject: "Reset your password",
        text: [
          "We received a request to reset your password.",
          "",
          `Open this link to choose a new one: ${link}`,
          "",
          `The link expires in ${PASSWORD_RESET_TOKEN_TTL_MS / 60000} minutes and works only once.`,
          "If you did not ask for this, you can ignore this message: nothing has changed.",
        ].join("\n"),
      });
    } catch {
      // The token is deliberately left valid. Invalidating it because the
      // provider had a bad minute would tell the user "we emailed you" and then
      // silently strand them; the design choice is an orphaned token over a
      // user told a lie. Retrying the request mints a fresh one.
      //
      // EVERY error is swallowed, not just `EmailSendError`. Re-throwing an
      // unexpected one would answer 500 for a real account and 200 for an
      // unknown one, which turns any bug in the adapter into an account
      // enumeration oracle: the silence this class exists to guarantee would
      // depend on nothing unexpected ever happening.
      //
      // The cost is that the provider's failure is invisible here, so the
      // adapter owns logging it: it is the only layer that knows what actually
      // broke, and it logs without the token.
    }
  }
}
