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

## Required manual step the orchestrator could NOT do
The branch protection rule currently requires at least 1 approving review, and the GitHub UI only offers 1 through 6. The REST API accepts 0, which keeps the pull request mandatory while requiring no reviewers — the correct setting for a solo developer. This requires a personal access token and must be run by the user:

```powershell
gh api -X PATCH repos/JuanCardona16/monorepo-bolerplate/branches/main/protection/required_pull_request_reviews `
  -F required_approving_review_count=0
```

`PATCH` is used rather than `PUT` on purpose: `PUT` requires every field and would reset `required_status_checks` to null.

## Order of operations
1. Run the PATCH above (approvals → 0). User action, needs a token.
2. Push this branch so the workflow runs once.
3. Only after the first successful run, mark the `build`, `check-types` and `test` checks as required. GitHub will not offer a check that has never reported.
4. Confirm PR #1 reaches a mergeable state.

## Acceptance criteria
- [x] Workflow exists with three parallel jobs
- [x] Every command the workflow runs has been executed locally and exits 0
- [x] The Prisma client generation blocker is handled
- [ ] First GitHub Actions run is green (cannot be verified until pushed)
- [ ] Status checks marked as required (requires step 3 above)
