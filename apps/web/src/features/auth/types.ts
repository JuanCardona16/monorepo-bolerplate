/**
 * The auth wire contract, owned by `@repo/core`.
 *
 * Every name below is a re-export of the type that actually defines the
 * contract, renamed to this module's original names so the pages and hooks keep
 * importing from here. Nothing is declared in this file: a second hand-written
 * copy is exactly the drift this module used to cause, because `web` talks to
 * the API over HTTP with nothing at build time proving the two agree.
 *
 * Type-only on purpose. `web` never imports `@repo/core` at runtime, so it
 * gains no server-side code (and no `bcrypt` / `jsonwebtoken` behind it) in the
 * browser bundle — `verbatimModuleSyntax` guarantees these specifiers are
 * erased before the bundler ever looks at them.
 */
export type { LoginInputDTO as LoginInput } from "@repo/core";
export type { RegisterInputDTO as RegisterInput } from "@repo/core";
export type { SessionDTO as SessionPayload } from "@repo/core";
export type { RequestPasswordResetInput as ForgotPasswordInput } from "@repo/core";
export type { ConfirmPasswordResetInput as ResetPasswordInput } from "@repo/core";
export type { ProfileOutput as Profile } from "@repo/core";
