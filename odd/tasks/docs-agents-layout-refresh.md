# Feature: docs-agents-layout-refresh

Objective: Correct `AGENTS.md` so it matches the repo on disk (architect-level fix, not cosmetic).
Problem: AGENTS.md listed `apps/background-workers/` and `packages/shared/` that do not exist, omitted `apps/web` entirely, and contradicted itself in three places. Any session trusting that file worked on wrong information — flagged in `odd/tasks/vitest-quality-gate.md:54`.
Why: AGENTS.md is the steering file every agent reads first. Stale steering is a silent correctness defect, worse than a missing file.
Scope: Single file `AGENTS.md`. No source, config, or manifest changes.
Constraints: Delete stale claims rather than keeping them beside newer ones; preserve every trap/why note that documents a paid-for bug; artifacts in English.
Authorized scope: `AGENTS.md` only.

## Tasks
- [x] T1 (inline): Fix Layout section — apps list, docs/tools reality, design-system outside workspace, `.next/**` dead config — route: inline, trigger evidence: one already-understood file, no research
- [x] T2 (inline): Fix self-contradictions — stale 204-test count vs current, `vitest.workspace.ts` dead file, "25 tests skipped in CI" contradicting the CI DATABASE_URL wiring — route: inline, trigger evidence: mechanical consistency pass
- [x] T3 (inline): Add architectural guidance — dependency direction + how the boundary is (not) enforced, web outside the graph, two TS majors, Swagger UI already resolved — route: inline, trigger evidence: architectural reviewer judgment

## Acceptance
- No entry in AGENTS.md names a path absent from disk.
- No two bullets in AGENTS.md assert conflicting facts.
- Every paid-for trap note retained.

## Progress
- 2026-10-01: doc created after read-only architecture review (codegraph CLI).
- 2026-10-01: T1-T3 applied to AGENTS.md, 7 edits, single file.

## Verification evidence
- Read-back of Layout section: only real dirs listed (`apps/api-gateway`, `apps/web`, `docs/decisions.md`, `tools/gh.ps1`, `packages/*`).
- `apps/` read: api-gateway, web. `packages/` read: core, eslint-config, infrastructure, security, typescript-config. `tools/` read: gh.ps1, README.md.
- `apps/web/package.json:2` confirms name is `web`, not `@repo/web`; `:14-21` confirms zero `workspace:*` deps.
- `apps/api-gateway/package.json:29` confirms `swagger-ui-express@5.0.1` installed, so the "Still open" claim was false.
- `odd/tasks/vitest-quality-gate.md:109` confirms the two-TypeScript-majors fact.
- Tests NOT run: documentation-only change, no functional surface touched.

## Next step
- Optional follow-up: `turbo.json` still carries `.next/**` in `build.outputs` (low-severity dead config). Reviewer suggested removing it as a separate one-line change.