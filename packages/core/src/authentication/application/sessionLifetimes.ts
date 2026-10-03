/**
 * The two refresh-session lifetimes, in one place so login, rotation, and the
 * cookie stay in sync.
 *
 * Short is the default (unchecked "remember me"): 24h is long enough to survive
 * a closed laptop and short enough that a stolen cookie rots fast. Long is the
 * explicit opt-in: the historical 30 days, unchanged.
 */
export const SHORT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const LONG_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionTtlMs(rememberMe: boolean): number {
  return rememberMe ? LONG_SESSION_TTL_MS : SHORT_SESSION_TTL_MS;
}
