# Feature: verify-and-fix-architecture-findings

Objective: Verify the three architecture findings from the read-only review, then fix the ones that are real defects.
Problem: Review surfaced (a) two TypeScript majors in one monorepo, (b) apps/web hand-duplicating the auth contract, (c) no `turbo boundaries` enforcement. None were build-enforced.
Why: An unenforced contract drifts silently. In a repo that documents false greens as its main hazard, unenforced boundaries are the same class of defect.
Scope: TypeScript unification; move duplicated web DTOs onto `@repo/core` exports. NOT `turbo boundaries` (see decision).
Constraints: NodeNext `.js` extensions mandatory; `build:js` (tsup) before `build:types` (tsc); generated dirs never edited; pnpm 12 pacquet bug means any install may need `node_modules` removal.
Authorized scope: root `package.json`, `apps/web/package.json`, `packages/core/**`, `apps/web/src/**`, lockfile as install side effect.

## Verification (done before implementing)
| Finding | Evidence | Verdict |
|---|---|---|
| Two TS majors | `package.json:17` = `7.0.2`; `apps/web/package.json:43` = `~6.0.2`; `apps/api-gateway/package.json:42` = `^7.0.2` | REAL |
| `turbo boundaries` absent | zero matches across all `turbo.json` | REAL but NOT A DEFECT |
| web duplicates auth contract | `apps/web/src/features/auth/types.ts:1-27` redefines `LoginInput`, `RegisterInput`, `SessionPayload`, `Profile`; `apps/web/src/constants/routes.ts:1-11` rebuilds API paths by hand | REAL |

**Boundary check came back clean.** No `../../packages/*/src` deep import exists anywhere. The package boundary is intact by discipline, not by tooling. Decided to NOT add `turbo boundaries`: it would be enforcement for a violation that does not exist, and it adds a config surface that must be maintained. Revisit when someone actually breaks the boundary.

## Tasks
- [x] T0 (inline): Verify all three findings before implementing — route: inline, trigger evidence: read-only greps + reads, decides scope
- [x] T1 (delegated): Unify TypeScript to 7.0.2 across root, api-gateway, web
- [x] T2 (delegated): Move duplicated web auth DTOs onto `@repo/core` exports and import them from web
- [x] T3 (inline): Full verification — install, build, check-types, test

**Pre-implementation measurement (why T1 was low risk):** running the root `tsc` 7.0.2 against `apps/web/tsconfig.app.json` and `apps/web/tsconfig.node.json` produced zero diagnostics, exit 0. `web` was already TS 7-compatible; only the pin was stale.

## Acceptance
- One TypeScript major across every package; `pnpm check-types` and `pnpm build` exit 0.
- `apps/web/src/features/auth/types.ts` no longer redefines the wire contract; it re-exports or imports from `@repo/core`.
- No behavior change in tests: counts stay 210/39/63+35/166/133.
- web's routes stay in sync with the gateway's `PublicRoutes` enums.

## Decisions
- `turbo boundaries` rejected. Evidence-based, not deferred laziness: there is no violation to catch.
- TS unification goes first: it is mechanical and fully verifiable with the cycle already proven this session.

## Progress
- 2026-10-01: doc created after verification. Prior commits on this branch: `d8efbd1` (AGENTS.md), `a77892d` (turbo.json).

## Verification evidence

All commands re-run by the orchestrator, not only reported by the writer.

| Check | Command | Observed |
|---|---|---|
| Build | `pnpm build` | exit 0 |
| Types | `pnpm check-types` | exit 0 |
| Tests | `pnpm test` | exit 0 — 8/8 tasks |
| core tests | — | 210 passed |
| security tests | — | 39 passed |
| infrastructure tests | — | 63 passed, 35 skipped (no `DATABASE_URL`) |
| api-gateway tests | — | 166 passed |
| web tests | — | 133 passed |
| Lint | `pnpm lint` | **exit 2 — RED, see blocker** |

Baseline preserved exactly: 210/39/63+35/166/133. No test count moved.

## Blocker: `pnpm lint` is repo-wide red on TS 7

`Error: typescript-eslint does not support TS 7.0.` — a hard version gate in the parser, not a code defect. Tracked upstream at typescript-eslint #10940 (support for TS >= 7.1).

- **Pre-existing, not introduced by T1.** `@repo/core` never declared its own `typescript`, so it already resolved the root's 7.0.2 before any change here. T1 extended the same failure to `web`, which was on 6.0.3 and previously passed that gate.
- **No CI gate turned red.** `.github/workflows/ci.yml` defines exactly three jobs — `build`, `check-types`, `test`. `lint` is not among them, so nothing required turned red.
- **Not a version bump.** Needs either typescript-eslint support for TS >= 7.1, or running the parser against the side-by-side TS 6 API.
- Related: `packages/security` cannot resolve the `eslint` binary at all — same uncommitted eslint work.

## Contract ownership result

`apps/web/src/features/auth/types.ts` went from 6 hand-written interfaces to 6 `export type` re-exports from `@repo/core`, keeping the original export names so every consumer is unchanged.

| web name | core owner |
|---|---|
| `LoginInput` | `LoginInputDTO` |
| `RegisterInput` | `RegisterInputDTO` |
| `SessionPayload` | `SessionDTO` (**new**) |
| `ForgotPasswordInput` | `RequestPasswordResetInput` |
| `ResetPasswordInput` | `ConfirmPasswordResetInput` |
| `Profile` | `ProfileOutput` |

`@repo/core` is a **devDependency** of `web`, not a runtime one: every import is `export type`, so nothing reaches the browser bundle.

`SessionDTO` was the only genuinely missing shape. It was deliberately NOT satisfied with `Pick<LoginOutputDTO, "accessToken">`: the gateway answers `{ accessToken }` only because the refresh token moves into an HttpOnly cookie, and a `Pick` would encode that cookie decision as a client-side projection that compiles clean and silently drops a field if the gateway body changes.

**No contract drift in `routes.ts`.** All 7 paths match `apps/api-gateway/src/constants/routes.ts`. Six come from `PublicRoutes`; `ME` comes from `PrivateRoutes` — noted in the comment so the next reader does not grep only one enum.

## Open decisions for the maintainer
1. `apps/api-gateway/package.json:42` is `^7.0.2`, not an exact pin like root and now web. Same major, so acceptance is met; tightening it is a separate call.
2. The `typescript-eslint` TS 7 blocker needs a real decision (wait for >= 7.1 support, or side-by-side TS 6 API for the parser).
3. Engram observation #323 records a *different* root cause for the same lint block (a Windows file handle in `node_modules`) than the version assertion observed here. A file handle would surface as `EBUSY`/`EPERM`, not a version error. Recorded as `related`, not superseding; the two accounts should be reconciled.