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
1. **Add a `postinstall` hook to `@repo/infrastructure`** running `prisma generate`. This is the better fix than repeating the step in every job: it also removes the manual `prisma generate` step that a fresh local clone currently requires. Deliberately out of scope here because it touches a package file rather than `.github/`.
2. **Add `check-types` scripts to the 3 library packages** so the job name matches reality.
3. **`lint` was left out on purpose.** `pnpm lint` only really runs for `apps/web` today, and adding a fourth job on day one risks a red CI from pre-existing lint findings. Add it once the baseline is clean.
4. **Turbo remote caching is not configured.** It would need a token and a scoped remote; the local cache already makes reruns cheap.
5. **`apps/web` still reports green with zero tests** (`--passWithNoTests`). Once the first frontend test lands, remove the flag so an empty suite fails.

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

