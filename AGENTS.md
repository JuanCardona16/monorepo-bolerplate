# AGENTS.md

> README.md is the stale Turborepo starter (mentions `docs`/`web`/`@repo/ui`). Trust manifests and `src/` below, not README prose.

## Setup

- `pnpm@12.5.1`, `node >= 24`. Always use `pnpm`; do not use npm/yarn.
- Workspace roots (`pnpm-workspace.yaml`): `apps/*`, `packages/*`.
- Install: `pnpm install`. Build order matters: dependencies first via `turbo run build` (`build.dependsOn: ["^build"]` in `turbo.json`).

## Commands

Root (`package.json` — all via Turbo):

```sh
pnpm build        # turbo run build
pnpm dev          # turbo run dev (persistent, cache: false)
pnpm lint         # turbo run lint
pnpm check-types  # turbo run check-types
pnpm format       # prettier --write "**/*.{ts,tsx,md}" (no config file — defaults)
```

Single package (preferred for focused work):

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/security build
pnpm --filter @repo/infrastructure build
turbo build --filter=@repo/core
```

Library packages (`core`, `security`, `infrastructure`) each define:

- `build:js` = `tsup`, `build:types` = `tsc`, `build` = `pnpm build:js && pnpm build:types` — run in that order.
- `dev` = `tsup --watch --onSuccess "pnpm run build:types"`.

## Verification

- **Vitest 4.1.10** is the test runner. `pnpm test` = `turbo run test` (8 tasks, green as of 2026-09-29). **177 tests total**: `@repo/core` 138 (domain + all 5 use cases, using `vi.fn()` fakes for the ports) and `@repo/security` 39 (the 4 adapters, tested for real — no mocks, no fake timers). No database required.
- `noUncheckedIndexedAccess` is on, so `const [first] = arr` does not typecheck. Use `arr[0]` with optional access in tests.
- `packages/core/tsconfig.json` and `packages/security/tsconfig.json` have no `include`, so tsc globs every `.ts`. Both exclude `src/**/__tests__/**` to keep compiled tests out of the published `dist/`.
- **`.github/workflows/ci.yml` exists** — three parallel jobs (`build`, `check-types`, `test`), no `needs` between them, `concurrency` cancels superseded runs. All three are **required status checks on `main`** (verified green, run `36524305417`).
- `main` is protected: required checks, `strict: true`, `enforce_admins: true`, **0 approving reviews** (solo developer), force-push and deletion blocked. Push straight to `main` is rejected — go through a PR.
- Closest to a standalone typecheck: `pnpm --filter <pkg> build:types` (`tsc` with `declaration: true`). Root `check-types` runs **only 1 task** because only `apps/web` defines that script; library type errors are still caught by `pnpm build`, which runs `build:types`. The CI job name overstates its scope — see `odd/tasks/ci-workflow.md`.
- `apps/web`, `apps/api-gateway` and `@repo/infrastructure` still run Vitest with `--passWithNoTests`, so an empty suite reports green. The flag must go once the first real test lands in each one. Do not remove it before writing those tests: CI goes red immediately. (`@repo/core` and `@repo/security` no longer have the flag.)
- Prisma migrations live in `packages/infrastructure/src/persistence/postgresSql/prisma/migrations/`. Scripts: `pnpm --filter @repo/infrastructure prisma:migrate:dev|deploy|status`. **The initial migration has never been applied** — no Docker or Postgres on this machine, so `migrate status` returns `P1001`.
- `@repo/infrastructure` has a `postinstall` hook that generates the Prisma client, so CI has no manual generate step. It depends on the `allowBuilds` entries above; without them the hook itself would be blocked.
- Full local gate: `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test`.

### pnpm gotcha that will waste your time again

`pnpm install` passing locally proves nothing about CI. A populated `node_modules` means pnpm never re-evaluates postinstall scripts, which is exactly the check that fails on a clean runner. To actually exercise build scripts, run `pnpm rebuild`.

- `strictDepBuilds` defaults to `true`, so an unapproved postinstall aborts install with `ERR_PNPM_IGNORED_BUILDS`.
- Approved packages are declared in **`pnpm-workspace.yaml`** under `allowBuilds`, currently `@prisma/engines`, `bcrypt`, `esbuild`, `prisma`.
- `onlyBuiltDependencies` is **removed** in pnpm v11 and the `pnpm` field in `package.json` is no longer read at all. Both are dead ends. pnpm 12 settings live in `pnpm-workspace.yaml`.
- `dangerouslyAllowAllBuilds` is deliberately not used: it would let unreviewed transitive dependencies run scripts.


## Layout (real code, not README)

- `apps/api-gateway/` — Express 5 app (user-owned style, see `## Api-gateway`). `apps/background-workers/` — empty. `docs/` holds `auth-tareas-pendientes.md`. `tools/`, `packages/shared/` — empty. Do not assume a Next.js app exists; `turbo.json` `.next/**` outputs are leftover defaults.
- `packages/core` (`@repo/core`) — auth domain only. Entrypoints: `src/index.ts` (re-exports `authentication/`), `src/authentication/{application,domain}/`. Exports `.` and `./authentication`. No runtime deps. Typed domain errors carry `code` (no HTTP status — gateway maps it).
- `packages/security` (`@repo/security`) — implements core ports: `BcryptPasswordHasher`, `JwtTokenProvider`, `Sha256RefreshTokenHasher`, `CryptoIdGenerator`. Depends on `@repo/core` + `bcrypt`, `jsonwebtoken`.
- `packages/infrastructure` (`@repo/infrastructure`) — `src/persistence/postgresSql/` (Prisma adapters + mappers + `PrismaAuthRepository`/`PrismaRefreshTokenRepository`); `cache/`, `external/`, `shared/`, `config/` are empty extension points (`mongodb/`, `messaging/` deleted; hollow `exports` removed — only `.` and `./persistence/postgresSql` remain). Deps: `prisma@7.10`, `@prisma/adapter-pg`, `@prisma/client`, `pg`, `dotenv`, `tsx`, `@repo/core`. Prisma client generates to `prisma/generated/` (gitignored) via a `postinstall` hook, so a fresh clone or a clean CI checkout needs no manual step. Run `pnpm --filter @repo/infrastructure prisma:generate` to regenerate by hand. **The hook only runs on `install`, not on `build`**: after deleting `generated/` a plain `pnpm install` will NOT bring it back (pnpm skips re-evaluating scripts when the dependency tree is unchanged) — use `pnpm install --force`. No DB available, migration SQL still pending.
- `packages/typescript-config` — `base.json` is the only active base (`strict`, `module/moduleResolution: NodeNext`, `target ES2022`, `noUncheckedIndexedAccess`, `isolatedModules`). `nextjs.json` / `react-library.json` are unused.
- `packages/eslint-config` — consume via `./base`; ignores `dist/**`, sets `turbo/no-undeclared-env-vars: warn`.

## Conventions / quirks

- `moduleResolution: NodeNext` — relative imports MUST use `.js` extensions (e.g. `export * from './BcryptPasswordHasher.js'`). Verified in `core/src/authentication/index.ts`, `security/src/index.ts`.
- `tsup.config.ts`: entry `src/**/index.ts`, `format: ["esm"]` only, `sourcemap: true`. Every subpath needs its own `index.ts` to be built.
- `tsconfig.json` per lib: `rootDir ./src`, `outDir ./dist`. `dist/`, `.turbo/`, `node_modules/` are build artifacts (gitignored but present) — never edit; rebuild via `build:js`/`build:types`.
- Env: `turbo.json` `build.inputs` includes `.env*`; root `.env.local` exists and `.env*` is gitignored. Never commit secrets. Gateway requires 6 secrets at boot (`required()` fail-fast in `apps/api-gateway/src/config/env/`); `dotenv` loads `.env.local` then `.env`.
- Formatting: Prettier with no config file; `pnpm format` rewrites in place — run only on touched files or expect repo-wide diffs.
- Codegraph first: repo has `.codegraph/` index. Use CLI (`status`, `query`, `explore`, `callers`) before Read/Glob/Grep on structural questions; `sync <root>` after edits. Skill: `codegraph` (global).
- Git: `main`, conventional commits in Spanish, no AI attribution. Identity is repo-local.
- **The remote is named `main`, not `origin`.** `origin` does not exist; `git fetch origin` fails. Use `git fetch main`, `git push main <branch>`.
- All work goes through a PR — `main` is protected and direct pushes are rejected. `gh pr merge <n> --merge` (merge commit, no squash/rebase).
- Remote auth uses `GITHUB_TOKEN` from the environment, and **every shell call is a fresh process**: re-export it in each command rather than assuming it persisted.

## Api-gateway (user style — follow it)

- Style source: user's template `JuanCardona16/api-rest-express-template` (Express 5, layered `config/core/features/infrastructure/lib/shared/constants`). `src/core/` = app nucleus (bootstrap, errors, middleware, routes) — NOT the domain.
- Controllers are thin: routes → `validateWithZod` → `asyncHandler` → controller → **use case from `@repo/core`**. Never port services/repositories into the gateway — they live in packages. No `new XRepository()` inside controllers; wire everything in a composition root.
- Errors: domain errors carry `code` only — gateway owns the `code → HTTP status` map inside `GlobalHandleError` (envelope `{success:false, error:{message,code,status,timestamp}}`).
- Routes/contants pattern: `ApiPrefix` + `PublicRoutes` enums in `constants/`; swagger JSDoc on routes.
- Imports are relative with `.js` extensions (NodeNext) — no `@/` alias.
- Open decisions: refresh transport (template uses HttpOnly cookies; current DTOs return it in body), swagger setup, `helmet`, login rate-limit wiring.
