# Feature: CI Workflow (Phase 2)

## Objective
Add a GitHub Actions workflow that runs the workspace quality gate on every pull request and on every push to `main`, so the branch protection rule on `main` has something real to enforce.

## Problem
`main` is protected and PR #1 reports `mergeable_state: "blocked"`, but the repo has never run a single check: `check_runs` total is 0. The protection cannot be completed because GitHub will not let a status check be marked as required until that check has reported at least once. This is the blocking dependency for the whole branch workflow.

## What shipped
`.github/workflows/ci.yml` with three parallel jobs: `build`, `check-types`, `test`.

Each job: `actions/checkout@v4` → `pnpm/action-setup@v4` (12.5.1) → `actions/setup-node@v4` (node 24, `cache: pnpm`) → `pnpm install --frozen-lockfile` → generate the Prisma client → run the command.

Jobs are deliberately parallel with no `needs` between them: they are independent, so serializing them would only add wall-clock time. `concurrency` cancels superseded runs on the same ref.

## The blocker this had to solve
`packages/infrastructure/src/persistence/postgresSql/prisma/generated/` is **gitignored**, and `@repo/infrastructure` has **no `postinstall` hook**. Meanwhile `PrismaAuthRepository.ts` and `PrismaRefreshTokenRepository.ts` import the generated client by **value**, not by type:

```ts
import { Prisma, PrismaClient } from "../prisma/generated/prisma/client.js";
```

On a clean CI checkout that module does not exist, so `tsup` and `tsc` both fail. All three jobs would have been red on the first run. Each job therefore runs `prisma generate` before its command, using the schema path relative to the package.

## Verification
Commands were run locally and observed, not assumed.

| Check | Result |
|---|---|
| YAML parses | OK — jobs `build`, `check-types`, `test`; triggers `pull_request`, `push` |
| `prisma generate` (CI command) | exit 0 — "Generated Prisma Client (7.10.0)" |
| `pnpm install --frozen-lockfile` | exit 0 — "Lockfile is up to date" |
| `pnpm build` | exit 0 — 5/5 tasks |
| `pnpm check-types` | exit 0 — **1/1 task** (see limitation below) |
| `pnpm test` | exit 0 — 8/8 tasks, `@repo/core` 87/87 |

**Not verifiable locally:** the workflow has never executed on GitHub Actions. `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node` are only proven once the first real run happens. The commands are proven; the runner is not.

## Known limitation: the `check-types` job is weaker than its name
`turbo run check-types` executed **one** task. The three library packages define `build:types` (declaration emit), not `check-types`, so only `apps/web` has a `check-types` script. This is a pre-existing gap called out in `AGENTS.md`.

Type errors in the libraries are not missed, because `pnpm build` runs `build:types` (`tsc`) and is covered by the `build` job. Nothing is unchecked; the job name just overstates its scope. Fixing it properly means adding `check-types` scripts to the three libraries.

## Follow-ups
1. ~~**Add a `postinstall` hook to `@repo/infrastructure`**~~ — **hecho.** `@repo/infrastructure` ya tiene `"postinstall": "pnpm run prisma:generate"`, así que el paso explícito de `prisma generate` en cada job se eliminó: `pnpm install` lo cubre. Un clone nuevo no necesita paso manual.
   Ojo con la trampa: el hook corre **solo en `install`**, nunca en `build`. Después de borrar `generated/`, un `pnpm install` normal **no** lo repone porque pnpm no reevalúa scripts con el árbol de dependencias igual — hay que usar `pnpm install --force`.
2. ~~**Add `check-types` scripts to the 3 library packages**~~ — **hecho.** Cada biblioteca tiene un `tsconfig.test.json` con `noEmit: true` que type-checkea `src/**/*` incluyendo tests (porque `tsconfig.json` excluye `__tests__` del emit). La task raíz corre **7 tareas**: 4 typechecks + 3 builds de dependencias.
3. **`lint` sigue fuera de CI, a propósito.** Es lo último que queda y no necesita nada del usuario. Ver *Estado 2026-10-01* abajo.
4. **Turbo remote caching is not configured.** It would need a token and a scoped remote; the local cache already makes reruns cheap.
5. ~~**`apps/web` still reports green with zero tests** (`--passWithNoTests`)~~ — **hecho.** Ningún paquete usa `--passWithNoTests` anymore. Una suite vacía es ahora un fallo de CI, no un verde falso. **No volver a agregar el flag.**

## Branch protection: applied 2026-09-29

`main` was **not** protected (API returned `404 Branch not protected`), so the rule was created from scratch with `PUT` rather than patched. Final state, read back from the API:

| Field | Value |
|---|---|
| `required_status_checks.contexts` | `build`, `check-types`, `test` |
| `required_status_checks.strict` | `true` (branch must be up to date) |
| `required_approving_review_count` | `0` (solo developer) |
| `enforce_admins` | `true` |
| `allow_force_pushes` / `allow_deletions` | `false` / `false` |
| `required_conversation_resolution` | `true` |

Note this supersedes the earlier `PATCH` recipe above: with no existing rule there was nothing to preserve, so `PUT` with the full body was the correct call. A `PATCH` would have failed against a non-protected branch.

## What the first real runs exposed

The workflow had never executed. When it finally did (runs `36521600006` and `36521571544`), all three jobs failed at `pnpm install --frozen-lockfile`:

```
Ignored build scripts: @prisma/engines@7.10.0, bcrypt@6.0.0
Error: ERR_PNPM_IGNORED_BUILDS
```

`strictDepBuilds` defaults to `true`, so an unreviewed postinstall aborts the install. This is invisible locally: `node_modules` is already populated, so pnpm never re-evaluates the scripts.

Fixing it took two attempts, and the obvious answer is wrong twice over:

1. `onlyBuiltDependencies` in `package.json` is dead on arrival. pnpm 12 warns `The "pnpm" field in package.json is no longer read by pnpm`, and `onlyBuiltDependencies` was **removed in pnpm v11** and replaced by `allowBuilds`.
2. Settings moved out of the manifest: since pnpm 11 they live in `pnpm-workspace.yaml`.

The first fix (`@prisma/engines`, `bcrypt`) was correct but incomplete — the next run surfaced a second tier that had been masked: `esbuild@0.27.7`, `esbuild@0.28.2`, `prisma@7.10.0`. All four are now listed. `dangerouslyAllowAllBuilds` was deliberately not used; it would let any future transitive dependency run scripts unreviewed.

## Acceptance criteria
- [x] Workflow exists with three parallel jobs
- [x] Every command the workflow runs has been executed locally and exits 0
- [x] The Prisma client generation blocker is handled
- [x] `pnpm install` succeeds on a clean runner (`allowBuilds` for all four packages)
- [x] First GitHub Actions run is green (run `36523645201`: build, check-types, test all `success`)
- [x] Status checks marked as required on `main`
- [x] PR #3 reaches `mergeStateStatus: CLEAN` with all three checks `SUCCESS`

## Estado 2026-10-01 — el job `test` tiene base de datos

Actualización posterior (PR #25, merge `5746c86`). Lo de arriba describe el
workflow como se creó; esto es lo que quedó después de descubrir que **el `test`
job era más débil de lo que su nombre decía**.

**El problema.** Los 35 tests de integración de `@repo/infrastructure` se saltaban
con `describe.skipIf(!process.env.DATABASE_URL)`. No era solo un problema de CI:
la task `test` de `turbo.json` no declaraba la variable, Turbo la filtraba, y los
tests se saltaban **siempre**, incluso local con la base andando. Un mapper o un
repositorio roto llegaba a `main` con todo verde porque los tests que lo
habrían detectado nunca corrían. El peor tipo de falso verde: no falla,
**desaparece** (D-022).

Invisible porque `pnpm --filter X exec vitest run` **sí** veía la variable. El
comando de debuggear funcionaba y el del día a día no.

**Lo que se hizo**, y por qué el container no era lo importante:

1. `turbo.json`: `test` declara `env: ["DATABASE_URL"]` e `inputs: [".env*"]`.
2. `.github/workflows/ci.yml`: service container `postgres:17-alpine` (pinned, no
   `latest`: un bump mayor puede cambiar collation y poner en rojo un build por
   motivos ajenos al código) + `prisma:migrate:deploy` **antes** de los tests.
3. **El guard dejó de poder fallar en silencio.** Las tres suites ahora lanzan
   cuando `CI=true` y no hay `DATABASE_URL`. La asimetría es deliberada: local
   sin base = skip aceptable; CI sin base = error, porque ahí la ausencia de la
   base ya no es un estado normal, es la señal de que algo se rompió.

El punto 3 es el que importa. Meter el container sin cambiar el guard habría sido
una mejora a medias: el mismo `describe.skip` habría seguido reportando 35 tests
como skipped si el container no levantaba, y el build habría quedado verde.

4. `turbo.json`: `test` con `cache: false`. Depende de una base viva y ninguna
   clave de cache puede ver su contenido. Un `"98 passed"` reproducido es una
   afirmación sobre una base que ya no existe. Va en `turbo.json` y no como
   `TURBO_FORCE` en el workflow porque eso apagaría también el caché de `build`.

5. **Bug de paso**: los tres scripts `prisma:migrate:*` estaban rotos —pasaban
   `--schema` pero no `--config`. `prisma generate` sí funciona sin `--config`, así
   que el `postinstall` nunca lo detectó, y el workflow solo corría `pnpm test`
   (D-027).

**Verificado en el runner real**, no solo en local. El log del run `36911512069`:

```
Applying migration `20260927174808_init_auth`
Applying migration `20260929150000_email_normalization_index`
Applying migration `20260930093000_password_reset_tokens`
All migrations have been successfully applied.

@repo/infrastructure   8 test files, 98 passed
```

Cero `skipped` en los cinco paquetes. **Leer el log, no el check verde:** los tres
checks en `SUCCESS` no prueban que los tests hayan corrido; prueban que el job
terminó.

**Limitación de la simulación local**: `app_user` no tiene `CREATEDB`, así que no
se puede crear una base vacía para replicar el service container. Se usó un
**schema limpio** (`schema=ci_sim` sobre la misma URL), que para probar migraciones
desde cero es equivalente. La prueba contra una base de verdad la dio GitHub.

