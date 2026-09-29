# Feature: Vitest Quality Gate

## Objective
Add the missing automated test layer to the monorepo so "tested" becomes a real, enforceable claim instead of a wish. Establish the local quality gate (Vitest + turbo `test` task) that Phase 2 CI will later enforce on every pull request.

## Problem
The repo has 5 commits on `main` and zero tests. There is no `test` script, no test runner, and `turbo.json` declares no `test` task. The planned bug/feature flow requires a "everything tested before merge to main" gate; today nothing can be tested, so that gate would be unenforceable.

The repo also has no GitHub remote and no CI, so nothing prevents merging broken code to `main`. This feature builds the test substrate. Remote, `gh` auth, branch protection, and CI workflows are separate later phases and are explicitly OUT OF SCOPE here.

## Why
Without a test layer, every later quality gate (CI, required status checks, review confidence) is decorative. Vitest was chosen over `node:test` and Jest because it matches the existing `tsup` / `turbo` / TypeScript toolchain without introducing a new paradigm, and it provides watch mode, coverage, and declarative mocking that the security and infrastructure packages will need.

## Scope
IN SCOPE:
- Add Vitest to the workspace and wire a `test` task into Turborepo.
- Declare the 4 testable packages in a root `vitest.workspace.ts`.
- Add a `test` script to each of the 4 packages that have `build` scripts.
- Add a first real test suite in `@repo/core` covering the domain value objects and entities.
- Create a `test` task in `turbo.json` with `dependsOn: ["^build"]` and `coverage/**` outputs.

OUT OF SCOPE (later phases, do not implement here):
- GitHub remote creation, `gh auth login`, branch protection rules.
- `.github/workflows/ci.yml` and required status checks.
- `ISSUE_TEMPLATE` / `pull_request_template`.
- Deployment to any production environment.
- Test suites for `@repo/security`, `@repo/infrastructure`, `api-gateway`.

## Constraints
- Package manager is `pnpm@12.5.1`; never use npm or yarn.
- `moduleResolution: NodeNext` is active: relative imports MUST use explicit `.js` extensions.
- `packages/typescript-config` and `packages/eslint-config` are config-only packages with no scripts; they are excluded from the test workspace.
- Tests must live in the same commit as the behavior they verify.
- Generated artifacts (`dist/`, `.turbo/`, `node_modules/`) must never be edited.
- `pnpm format` rewrites repo-wide because there is no Prettier config file; do not run it outside touched files.

## Tasks

- [x] **T1** — Add `test` task to `turbo.json` with `dependsOn: ["^build"]`, `outputs: ["coverage/**"]`.
- [x] **T2** — Add `vitest` to root `devDependencies` and a root `test` script running `turbo run test`.
- [x] **T3** — Create root `vitest.workspace.ts` declaring the 4 testable packages.
- [x] **T4** — Add per-package `test` scripts and `vitest.config.ts` (node environment, `globals: false`).
- [x] **T5** — Write the first real test suite for `@repo/core` domain (Email, Password, Role, AuthUser, RefreshToken, and the domain error `code` contract).
- [x] **T6** — Verify: `pnpm install`, `pnpm test`, `pnpm build`, `pnpm --filter @repo/core build:types`.
- [x] **T7** — Add `apps/web` as a 5th test project (added after the writer discovered the app exists and the user approved inclusion).

## Authorized scope
Files allowed to change: root `package.json`, `turbo.json`, root `vitest.config.ts`, per-package `vitest.config.ts`, the `package.json` of the 5 testable packages, new `*.test.ts` files, `odd/tasks/vitest-quality-gate.md`, and `pnpm-lock.yaml` as a side effect of installing.

**Authorized deviation (accepted):** the writer also modified 4 library `tsconfig.json` files, which were outside the original list. Without adding `"vitest.config.ts"` to `exclude`, `build:types` failed with `TS6059: File ... is not under 'rootDir'`, because those tsconfigs set `rootDir: ./src` with no `include` so `tsc` globs `**/*`. The fix mirrors the pre-existing `tsup.config.ts` exclusion convention. Accepted: the alternative (dropping per-package configs) would break T4.

## Corrections to the original plan
- **The plan said 4 packages. There are 5.** `apps/web` (React 19 + Vite 8 + TanStack Query + react-router 7 + Zustand + Tailwind, 32 git-tracked files) was missed by the initial scan. The writer caught it. It was added as T7.
- **`AGENTS.md` is stale and actively misleading.** It states "Do not assume a Next.js app exists" and lists only `api-gateway` and `background-workers` as apps. It never mentions `apps/web`. Any session trusting that file works on wrong information. Fixing it is a separate follow-up.
- **`vitest.workspace.ts` was in the original plan and is wrong.** It was removed in Vitest 3+; Vitest 4 uses the `test.projects` array in a single root config. The implementation uses `test.projects`.
- **`pnpm --filter web build:types` does not exist and must not be created.** For the libraries `build:types` means `tsc` declaration emit, but `apps/web` is `noEmit: true` and bundled by Vite. The correct checks for `web` are `build` (`tsc -b && vite build`) and `check-types` (`tsc --noEmit -p tsconfig.app.json`). Fabricating the script would manufacture a quality signal that does not exist.

## Acceptance criteria
- [x] `pnpm test` runs from the repo root and executes real tests, not a no-op.
- [x] `turbo.json` exposes a `test` task and `turbo run test` resolves the package dependency graph.
- [x] `@repo/core` domain value objects and entities are covered by passing tests.
- [x] `pnpm build` still succeeds; the new `test` task breaks nothing.
- [x] `pnpm --filter @repo/core build:types` still passes.
- [x] The test suite is the one committed alongside the configuration that enables it.
- [x] All 5 testable packages appear in the task graph, including `web#test`.

## Applicable checks
| Check | Command | Expected |
|---|---|---|
| Tests | `pnpm test` | All suites pass |
| Build | `pnpm build` | Success across workspace |
| Types | `pnpm --filter @repo/core build:types` | No TS errors |
| Task graph | `turbo run test --dry=json` | Resolves `test` task with `^build` deps |

## TDD mode
- **Resolved mode: STRICT TDD — ON**
- **Source:** global policy explicitly CONFIRMED by the user on 2026-09-01 ("Activalo de forma global por favor y tambien quiero que quede activado en mi flujo de trabajo"), recorded in Engram observation #145 under topic `sdd/monorepo-bolerplate/testing-capabilities`. This is the authoritative policy; it survives the loss of the runner.
- **Runner to restore:** `pnpm test` → `turbo run test` → `vitest run`
- **Vitest version:** `4.1.10` — the version previously configured in this project (Engram #7, #145). Pin to this rather than resolving latest, so the restored setup matches what the project already validated.
- **Recovery context:** Vitest 4.1.10 with a `test` task in `turbo.json` and a root `vitest.config.ts` was configured on 2026-08-09 against an older package layout (`packages/domain`, `packages/application`, `packages/shared`, `apps/api`). The repo was subsequently restructured to the current `core` / `security` / `infrastructure` / `api-gateway` layout and the Vitest configuration was lost in that restructure. Drift was already observed on 2026-09-23 (Engram #237). This feature restores the layer against the CURRENT layout.
- **Applicability:** T1-T4 restore the runner itself and have no behavior to specify first, so no RED phase is possible. T5 covers already-shipped domain code, where TDD ordering cannot be reconstructed retroactively; these are characterization tests, not test-first development. Any NEW behavior from this feature onward must follow RED → GREEN → REFACTOR.

## Route declaration
| Task | Route | Trigger evidence |
|---|---|---|
| T1-T4 | delegated writer | 4+ non-trivial config files touched across 7 files |
| T5 | delegated writer | Requires reading domain VOs/entities to derive assertions; preparation-for-write trigger |
| T6 | inline | Bounded verification of one command surface |

## Progress
Implementation delegated to a single writer covering T1-T5 (cohesive work unit: the test substrate plus the proof it works). Verification T6 run inline by the orchestrator.

## Verification evidence
All commands observed by the orchestrator, not merely reported by the writer.

| Check | Command | Observed result |
|---|---|---|
| Tests | `pnpm test` | exit 0 — `@repo/core`: 6 files, 87 tests, 87 passed, 0 failed. `web#test` present. |
| Tests (uncached) | `pnpm turbo run test --force` | exit 0 — 8/8 tasks. Forced because a cached run once replayed a stale log. |
| Build | `pnpm build` | exit 0 — 5/5 tasks |
| Types (lib) | `pnpm --filter @repo/core build:types` | exit 0, no diagnostics |
| Types (web) | `pnpm --filter web build` | exit 0, built in 923ms |
| Types (web) | `pnpm --filter web check-types` | exit 0 |
| Task graph | `turbo run test --dry=json` | 11 tasks, 7 `#test`, includes `web#test` |

## Follow-ups (deliberately NOT done in this feature)
1. **`tsc` emits compiled test files into `dist/`.** `build:types` produces 18 `__tests__/*.test.{js,d.ts,d.ts.map}` files under `packages/core/dist/`. Benign (gitignored, and `exports` exposes only `.` and `./authentication`). Excluding `__tests__` would also stop typechecking the tests, so the clean fix is a separate `tsconfig.build.json`.
2. **`AGENTS.md` must be corrected** to document `apps/web` and remove the "do not assume a Next.js app exists" misdirection.
3. **Two TypeScript majors in one monorepo.** `apps/web` pins `typescript: ~6.0.2`; root and all library packages use `7.0.2`. Pre-existing, not introduced here.
4. **Frontend tests are unwritten.** `apps/web` runs with `--passWithNoTests`, so the web project reports green with zero coverage until the first real test exists. Strict TDD applies to that first test.
5. **`IS_REACT_ACT_ENVIRONMENT` setup file omitted** for `apps/web`. It is needed before the first React test can avoid act() warnings; adding it with zero tests would be speculative config.

## Operational gotcha: pnpm 12 pacquet bug
`pnpm install` failed 4 times during this feature with `failed to rename staging directory ... -> ... : Acceso denegado. (os error 5)`, on `prisma` and later on `esbuild`. It is **not** MAX_PATH (proven with a 79-char-path probe that installed `prisma@7.10.0` cleanly). Root cause is a corrupt half-state in the workspace `node_modules`. Fix: delete the workspace `node_modules` and reinstall. This fires on essentially every dependency addition, so expect it on any future `pnpm add`.

## Delivery strategy
- Strategy: `ask-on-risk` (default).
- Chain strategy: not applicable; this feature stays under the 400-line delivery budget.
- Forecast: well under 400 authored changed lines.

## Commit evidence
One work-unit commit on branch `feat/vitest-quality-gate`, subject `test: agrega quality gate con Vitest 4 y cobertura del dominio de auth`, 25 files changed (1580 insertions, 16 deletions) of which 754 insertions are `pnpm-lock.yaml`.

The commit hash is deliberately not recorded here: this document is committed inside that same commit, so any hash written here would be invalidated by the amend that carries it. Resolve the hash with `git log --oneline -1 feat/vitest-quality-gate`.

**Size note:** authored lines excluding the lockfile total 842, which exceeds the ~400 delivery budget. Not split, deliberately. 570 of those lines are the test suite itself, and the budget rules explicitly forbid omitting tests or splitting artificially to fit a number. The change is one cohesive unit: the runner config without the tests proving it works is not independently reviewable. There is also no remote yet, so no PR exists to chain. When the PR is opened in a later phase, this should carry a maintainer-approved `size:exception`.

## Route
Single delegated writer for T1–T5, the same writer continued for T7, orchestrator inline for T6 verification and the commit.

## Next step
Run T6 verification, create the work-unit commit on `feat/vitest-quality-gate`, then hand off to Phase 0 (remote + `gh` auth + branch protection) which requires the user's own credentials.
