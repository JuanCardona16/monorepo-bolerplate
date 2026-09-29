import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * The full replacement set of roles for a user.
 *
 * This is a replace, not a merge, so the array is required and has to be
 * explicit: omitting it is a different mistake than passing `[]`.
 */
export const changeRolesSchema = z.object({
  roles: z.array(z.string().min(1)).max(50),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

/**
 * The strength rules live in the domain (`Password`), not here.
 *
 * Duplicating them in Zod would create a second definition that can drift, and
 * the day it drifts the gateway would answer 400 for a password the domain
 * accepts, or worse, accept one the domain rejects. `min(1)` only rejects an
 * empty body field, which is a shape problem rather than a policy one.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});
