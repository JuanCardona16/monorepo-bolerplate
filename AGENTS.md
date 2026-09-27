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

- `apps/api-gateway/`, `apps/background-workers/` — empty. `docs/`, `tools/`, `packages/shared/` (except empty), `packages/infrastructure/src/config/` — empty. Do not assume a Next.js app exists; `turbo.json` `.next/**` outputs are leftover defaults.
- `packages/core` (`@repo/core`) — auth domain only. Entrypoints: `src/index.ts` (empty), `src/authentication/{application,domain}/`. Exports `.` and `./authentication`. No runtime deps.
- `packages/security` (`@repo/security`) — implements core ports: `src/BcryptPasswordHasher.ts`, `src/JwtTokenProvider.ts`. Depends on `@repo/core` + `bcrypt`, `jsonwebtoken`.
- `packages/infrastructure` (`@repo/infrastructure`) — `src/{cache,external,messaging,persistence/{postgresSql,mongodb},shared}/`. Deps: `prisma@7.10`, `@prisma/adapter-pg`, `@prisma/client`, `pg`, `dotenv`, `tsx`. CAUTION: `package.json` `exports["./messaging"]` currently points at `./dist/external/*` (copy-paste of `./external`) — verify before importing.
- `packages/typescript-config` — `base.json` is the only active base (`strict`, `module/moduleResolution: NodeNext`, `target ES2022`, `noUncheckedIndexedAccess`, `isolatedModules`). `nextjs.json` / `react-library.json` are unused.
- `packages/eslint-config` — consume via `./base`; ignores `dist/**`, sets `turbo/no-undeclared-env-vars: warn`.

## Conventions / quirks

- `moduleResolution: NodeNext` — relative imports MUST use `.js` extensions (e.g. `export * from './BcryptPasswordHasher.js'`). Verified in `core/src/authentication/index.ts`, `security/src/index.ts`.
- `tsup.config.ts`: entry `src/**/index.ts`, `format: ["esm"]` only, `sourcemap: true`. Every subpath needs its own `index.ts` to be built.
- `tsconfig.json` per lib: `rootDir ./src`, `outDir ./dist`. `dist/`, `.turbo/`, `node_modules/` are build artifacts (gitignored but present) — never edit; rebuild via `build:js`/`build:types`.
- Env: `turbo.json` `build.inputs` includes `.env*`; root `.env.local` exists and `.env*` is gitignored. Never commit secrets.
- Formatting: Prettier with no config file; `pnpm format` rewrites in place — run only on touched files or expect repo-wide diffs.
