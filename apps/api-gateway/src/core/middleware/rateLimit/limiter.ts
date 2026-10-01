import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: "Too many attempts. Try again later.",
      code: "RATE_LIMITED",
      status: 429,
    },
  },
});

/**
 * Password reset gets its own, much tighter budget than login.
 *
 * Login is 10/15min because a credential-guessing attack is bounded by the
 * attacker guessing *two* things. This route is a mail cannon: 3 requests
 * produce 3 emails to a third party, which is both an abuse of the provider's
 * sending reputation and a way to attack someone else's inbox. 5 per 15 minutes
 * still lets a real user who forgot their password try again, twice.
 *
 * The `reset` route is separate, and not because the two are equally dangerous:
 * it is a token-guessing route, and each attempt costs the user nothing, so it
 * gets its own counter. Sharing one budget would let a burst of `forgot`
 * requests lock a legitimate user out of the `reset` page.
 */
const rateLimited = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: "Too many attempts. Try again later.",
      code: "RATE_LIMITED",
      status: 429,
    },
  },
};

/**
 * Exported so the tests assert against the same number the limiter is built
 * from, instead of duplicating a literal that would drift and start failing
 * (or worse, silently start passing) on a later change.
 */
export const FORGOT_PASSWORD_RATE_LIMIT = 5;
export const RESET_PASSWORD_RATE_LIMIT = 10;

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: FORGOT_PASSWORD_RATE_LIMIT,
  ...rateLimited,
});

export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: RESET_PASSWORD_RATE_LIMIT,
  ...rateLimited,
});
