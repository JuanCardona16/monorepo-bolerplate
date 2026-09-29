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

- **Vitest 4.1.10** is the test runner. `pnpm test` = `turbo run test` (8 tasks, green as of 2026-09-29). **204 tests total**: `@repo/core` 138 (domain + all 5 use cases, using `vi.fn()` fakes for the ports), `@repo/security` 39 (the 4 adapters, tested for real — no mocks, no fake timers), `@repo/infrastructure` 27 (the 2 mappers). No database required.
- `noUncheckedIndexedAccess` is on, so `const [first] = arr` does not typecheck. Use `arr[0]` with optional access in tests.
- `packages/core`, `packages/security` and `packages/infrastructure` tsconfigs have no `include`, so tsc globs every `.ts`. All three exclude `src/**/__tests__/**` to keep compiled tests out of the published `dist/`.
- **`.github/workflows/ci.yml` exists** — three parallel jobs (`build`, `check-types`, `test`), no `needs` between them, `concurrency` cancels superseded runs. All three are **required status checks on `main`** (verified green, run `36524305417`).
- `main` is protected: required checks, `strict: true`, `enforce_admins: true`, **0 approving reviews** (solo developer), force-push and deletion blocked. Push straight to `main` is rejected — go through a PR.
- Closest to a standalone typecheck: `pnpm --filter <pkg> build:types` (`tsc` with `declaration: true`). Root `check-types` now runs **7 tasks** (4 typechecks + 3 dependency builds): each library has a `tsconfig.test.json` with `noEmit: true` that type-checks `src/**/*` including tests, because `tsconfig.json` excludes `__tests__` from emit.
- `turbo.json`: `check-types` dependsOn `^build` (a package's `check-types` needs its dependencies' `dist/*.d.ts` to resolve `@repo/core/authentication`; without it the job fails on a clean runner but passes locally). `build.outputs` includes `dist/**` — it previously only listed `.next/**`, so no library build was ever cached.
- **No package uses `--passWithNoTests` any more.** An empty suite in any workspace package is now a CI failure, not a false green. Do not add the flag back.
- **553 tests**: `@repo/core` 151, `api-gateway` 142, `web` 108, `@repo/security` 39, `@repo/infrastructure` 37 (25 need Postgres).
- **`apiClient` normalizes a rejected `fetch` into an `ApiError`** (`NETWORK_ERROR`, status `0`). Every page renders its error only on `instanceof ApiError`, so a raw `TypeError` from a dropped connection used to render **nothing**: the button reset to idle and the user got no feedback. An `AbortError` is deliberately passed through unchanged — a cancellation is not a connection problem, and saying otherwise would be a lie.
- `LoginPage` and `RegisterPage` render errors with the same `mutation.error instanceof ApiError` pattern. They work now only because the client normalizes; a new page that catches the raw error itself would reintroduce the bug.
- **`docs/decisions.md` is the decision log.** Read it before changing auth behaviour: it records why the refresh replay revokes all sessions, why `Email` normalizes in the domain, why the cookie is `lax`, and the traps already paid for.
- **`Email` normalizes** (`trim().toLowerCase()`) before validating, so surrounding whitespace is accepted and trimmed rather than rejected, and casing never reaches storage. A functional unique index on `lower(email)` backs it at the database level. Both layers must stay in sync: removing the normalization without dropping the index would break inserts.
- `statusForCode` uses `Object.hasOwn` on purpose. A bare `STATUS_BY_CODE[code] ?? 500` resolves inherited `Object.prototype` keys (`constructor`, `toString`) to functions, and that value would reach `res.status()`.
- The Prisma repository tests need a real database: each suite is gated with `describe.skipIf(!process.env.DATABASE_URL)`, so **25 tests report as skipped in CI and run locally**. Isolation is per unique key (`randomUUID`), never `TRUNCATE` or a global `deleteMany`, so the suite never deletes rows the app created.
- `apps/web` uses `@testing-library/react` with `globals: false`, so `src/test/setup.ts` registers `cleanup()` in an `afterEach` (RTL cannot detect the global hook otherwise). Its `tsconfig.app.json` has `include: ["src"]`, so `tsc` type-checks the web tests with no separate config.
- **A `__tests__` directory cannot import anything from outside itself once `tsconfig.json` excludes it.** In `api-gateway`, `src/**/__tests__/**` is excluded and Vitest resolves modules through the tsconfig, so a test inside `src/core/__tests__/` cannot import `src/constants/...`; it fails with `Cannot find module '/constants/index.js'` (note the leading slash). A test in a top-level `src/__tests__/` resolves fine. Put shared helpers there, or assert on literal values.
- In `apps/web`, the `Authorization` header does NOT come from the zustand store: `apiClient` reads it from an accessor that `Bootstrap` installs via `configureApi`. `main.tsx` imports `RouterProvider` from `react-router/dom` while components consume the `react-router` entry context, which is a different module instance and breaks routing tests.
- Two known, deliberate data losses in the mappers, pinned by tests: `createdAt`/`updatedAt` are dropped (the domain entities have nowhere to keep them, Prisma refills them on write), and duplicate roles collapse because the entities use `Set<string>` against a `String[]` column.
- **Two `.env.local` files, and the app uses the package one.** `apps/api-gateway/.env.local` holds the real `DATABASE_URL` (Neon, pooled via PgBouncer, `sslmode=require`) and `PORT=3001`. The root `.env.local` points at a local Postgres 17.11 on `127.0.0.1:5432` that the gateway **never reads**; it exists for the `@repo/infrastructure` integration tests. Editing the root one will not change where the app stores data.
- Prisma migrations live in `packages/infrastructure/src/persistence/postgresSql/prisma/migrations/`. Scripts: `pnpm --filter @repo/infrastructure prisma:migrate:dev|deploy|status`. **Both migrations are applied to both databases** (local Postgres 17.11 and Neon) as of 2026-09-29: `20260927174808_init_auth` and `20260929150000_email_normalization_index`. Prisma requires the file inside a migration folder to be named exactly `migration.sql`; any other name makes it unreadable (`P3015`). **To migrate the database the app actually uses, set the gateway's URL and pass `--config` explicitly** — `prisma.config.ts` reads the *root* `.env.local`, so `$env:DATABASE_URL` alone still fails with `The datasource.url property is required`.
- Gateway deploy knobs, all read in `config/env/index.ts` and validated at boot: `TRUST_PROXY_HOPS` (default `0`; set to the real hop count behind nginx/Cloudflare, or every client shares one IP and the global rate limit locks everyone out), `REFRESH_COOKIE_SAME_SITE` (default `lax`), `REFRESH_COOKIE_SECURE` (defaults to true when `NODE_ENV=production`), `ACCESS_LOG_IPS` (default `false`; an IP is personal data under GDPR and an access log is exactly the kind of store that quietly accumulates it forever).
- **Access log**: `createRequestLogger` in `core/middleware/logger/`, mounted **first** in `app.ts` — after `helmet` or the rate limiter it would miss 429s, after the routes it would miss 404s. It logs `req.path` and never `req.originalUrl`, so the query string cannot leak; never the body, never `Authorization`; client IP only when `ACCESS_LOG_IPS=true`.
- **Express trap: `req.url` is rewritten while dispatching into a mounted router** and restored afterwards, so reading `req.path` on `res.on("finish")` yields the router-relative path (`/login`, not `/api/v1/auth/login`). `requestLogger` captures `method`/`path`/`ip` eagerly for this reason. The unit test with fake objects cannot catch it — only the integration suite in `src/__tests__/accessLog.test.ts` did.
- OpenAPI spec and Swagger UI live at `GET /api/docs` (a sibling of `/api/v1`, so the raw document stays out of the API envelope). `GET /api/docs/openapi.json` is the spec, `GET /api/docs/info` is the machine-readable discovery payload, and `GET /api/docs/` renders the UI. Knobs: `DOCS_ENABLED` (default ON in dev, **OFF in production**, because Swagger UI is a browsable inventory of every endpoint and error code) and `OPENAPI_SERVER_URL` (default `/`; set it or "Try it out" calls the wrong origin).
- **`@scarf/scarf` is explicitly NOT approved** in `pnpm-workspace.yaml`. It is a transitive dep of `swagger-ui-express` (via `swagger-ui-dist`) and its postinstall phones home to `scarf.sh` to report that this project installed the package. `"@scarf/scarf": false` keeps the UI working while blocking the telemetry. Re-check that list whenever a dependency is added: `pnpm add` can run a new postinstall **without** the strictDepBuilds check firing.
- `swaggerUi.serve` is what serves `swagger-ui.css` and `swagger-ui-bundle.js`; `swaggerUi.setup()` renders **only the HTML**. Without `serve`, the page loads and every one of its own assets answers `200` with the HTML page again — a blank screen in the browser while every status-code check reports green. `docs.spec.test.ts` asserts the CSS `content-type` for exactly that reason.
- Mount a docs handler with `get("/path")`, never with `use("/", handler)`. `use` matches **every** path under the mount, so a UI handler registered that way also answers `/openapi.json` — with the UI's HTML and a 200. Mount order relative to the UI is *not* what matters: `get("/")` matches only the mount root and cannot shadow a sibling `get("/openapi.json")`. Verified by mutation, because the opposite is the natural guess.
- Role management: `PUT /api/v1/auth/users/:uuid/roles` replaces the target's whole role set and revokes their sessions. Guarded by `requireRole("admin")` after `createAuthorize`.
- **First admin comes from a script, not a route**: `pnpm --filter @repo/infrastructure prisma:promote-admin -- <email> [--remove]`. The route requires a role the caller does not have, so without a path that bypasses the API the first admin could never exist. Needs `DATABASE_URL` exported (see the Neon-vs-local trap above). It normalizes the email through `Email`, uses a `Set` for roles so re-running never duplicates, and revokes the user's active refresh tokens.
- **`api-gateway` sets its test env in `src/test/setupEnv.ts` (a `setupFiles` entry), not per suite.** Three suites in a row failed on CI only with `Missing required environment variable: TOKEN_SECRET_KEY`, because they imported something reaching `config/env/index.ts` — whose `required()` runs **at import time**, before any `beforeAll` or `vi.stubEnv` can run. A developer's `.env.local` is what was hiding it. A setup file runs before any test module is imported, so it removes the trap; do not go back to setting these per suite. Verify CI parity by **moving `.env.local` aside** and running the suite, not by trusting a green local run.
- **`vi.mock` resolves its specifier from the module under test, not from the test file.** Writing `../client.js` when the script imports `../../client.js` makes Vitest look for a different file, the mock silently does not apply, and a unit suite ends up **connecting to a real database**. Same class of trap as the nested `__tests__` one above.
- **Prisma `update`/`updateMany` take ONE argument object** (`{ where, data, select }`), not `(where, data)`. Asserting on `calls[1].data` yields `undefined` in silence. A suite with multiple cases also needs `vi.clearAllMocks()` in `beforeEach`, or `not.toHaveBeenCalled()` fails counting earlier tests.
- `@repo/infrastructure` has a `postinstall` hook that generates the Prisma client, so CI has no manual generate step. It depends on the `allowBuilds` entries above; without them the hook itself would be blocked. It runs only on `install`, never on `build`, and a plain `pnpm install` will not re-run it when the dependency tree is unchanged — use `pnpm install --force`.
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
- Resolved: refresh transport is an **HttpOnly cookie** (the DTOs do not return the token in the body), `helmet` is mounted, login has its own rate limiter, and the OpenAPI spec is served. Still open: Swagger **UI** (needs `swagger-ui-express`).
- **`RESEND_KEY`, `CLIENT_GOOGLE_ID` and `CLIENT_GOOGLE_SECRET` were removed** (template leftovers: declared, absent from every `.env.local`, zero consumers). Do not re-add them without the code that uses them — an env var nothing reads is a promise the repo does not keep.
- The login page's "Remember for 30 days" is **static text, not a checkbox**: the refresh cookie's lifetime is `REFRESH_COOKIE_MAX_AGE_MS` on the server and the client cannot influence it. `LoginPage.test.tsx` asserts the checkbox's *absence* on purpose; putting it back is a regression.
