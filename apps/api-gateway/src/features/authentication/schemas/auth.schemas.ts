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
