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

- No test runner, no `*.test.*`, no `test` script, no `.github/` CI found. Do not invent a test command.
- Closest to typecheck: `pnpm --filter <pkg> build:types` (`tsc` with `declaration: true`). Root `lint`/`check-types` pipelines are no-ops for libs that lack those scripts.
- Full check: `pnpm build` then `pnpm --filter <pkg> build:types`.

## Layout (real code, not README)

- `apps/api-gateway/` — Express 5 app (user-owned style, see `## Api-gateway`). `apps/background-workers/` — empty. `docs/` holds `auth-tareas-pendientes.md`. `tools/`, `packages/shared/` — empty. Do not assume a Next.js app exists; `turbo.json` `.next/**` outputs are leftover defaults.
- `packages/core` (`@repo/core`) — auth domain only. Entrypoints: `src/index.ts` (re-exports `authentication/`), `src/authentication/{application,domain}/`. Exports `.` and `./authentication`. No runtime deps. Typed domain errors carry `code` (no HTTP status — gateway maps it).
- `packages/security` (`@repo/security`) — implements core ports: `BcryptPasswordHasher`, `JwtTokenProvider`, `Sha256RefreshTokenHasher`, `CryptoIdGenerator`. Depends on `@repo/core` + `bcrypt`, `jsonwebtoken`.
- `packages/infrastructure` (`@repo/infrastructure`) — `src/persistence/postgresSql/` (Prisma adapters + mappers + `PrismaAuthRepository`/`PrismaRefreshTokenRepository`); `cache/`, `external/`, `shared/`, `config/` are empty extension points (`mongodb/`, `messaging/` deleted; hollow `exports` removed — only `.` and `./persistence/postgresSql` remain). Deps: `prisma@7.10`, `@prisma/adapter-pg`, `@prisma/client`, `pg`, `dotenv`, `tsx`, `@repo/core`. Prisma client generates to `prisma/generated/` (gitignored — regenerate via `prisma generate --schema ./src/persistence/postgresSql/prisma/schema.prisma` from the package); no DB available, migration SQL still pending.
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

## Api-gateway (user style — follow it)

- Style source: user's template `JuanCardona16/api-rest-express-template` (Express 5, layered `config/core/features/infrastructure/lib/shared/constants`). `src/core/` = app nucleus (bootstrap, errors, middleware, routes) — NOT the domain.
- Controllers are thin: routes → `validateWithZod` → `asyncHandler` → controller → **use case from `@repo/core`**. Never port services/repositories into the gateway — they live in packages. No `new XRepository()` inside controllers; wire everything in a composition root.
- Errors: domain errors carry `code` only — gateway owns the `code → HTTP status` map inside `GlobalHandleError` (envelope `{success:false, error:{message,code,status,timestamp}}`).
- Routes/contants pattern: `ApiPrefix` + `PublicRoutes` enums in `constants/`; swagger JSDoc on routes.
- Imports are relative with `.js` extensions (NodeNext) — no `@/` alias.
- Open decisions: refresh transport (template uses HttpOnly cookies; current DTOs return it in body), swagger setup, `helmet`, login rate-limit wiring.
