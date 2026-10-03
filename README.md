# monorepo-bolerplate

An end-to-end authentication monorepo: pure-TypeScript auth domain, an Express API
that serves it, and a React client that consumes it. Built as a reusable starter
with every hard-won lesson written down — the `docs/` folder records not just
what the code does, but why it does it that way.

## What's inside

| App / Package | Description |
|---|---|
| `apps/api-gateway` | Express 5 API: auth routes, Zod validation, OpenAPI + Swagger UI |
| `apps/web` | React 19 + Vite 8 + Tailwind 4 client (login, register, password reset, profile) |
| `@repo/core` | Framework-free auth domain: entities, value objects, use cases, DTOs |
| `@repo/security` | Core port implementations: bcrypt hashing, JWT, refresh-token hashing |
| `@repo/infrastructure` | Prisma Postgres adapters + email sender |
| `@repo/typescript-config` / `@repo/eslint-config` | Shared TS and ESLint bases |

Auth covers register, login, token refresh with rotation and revocation, logout,
profile, role management, password reset, and a documented OpenAPI spec.

## Quickstart

Requirements: `pnpm@12.5.1`, `node >= 24`, a Postgres 17 database.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

- API dev server: `pnpm --filter api-gateway dev` (needs
  `apps/api-gateway/.env.local` with `DATABASE_URL` plus the required secrets).
- Web dev server: `pnpm --filter web dev`.
- Database: apply migrations with
  `pnpm --filter @repo/infrastructure prisma:migrate:deploy`.

## Scripts

All root scripts run through Turbo:

| Command | What it runs |
|---|---|
| `pnpm build` | `turbo run build` |
| `pnpm dev` | `turbo run dev` |
| `pnpm check-types` | `turbo run check-types` |
| `pnpm test` | `turbo run test` (646 tests across 5 packages) |
| `pnpm lint` | `turbo run lint` — currently blocked, see below |

## Testing & CI

CI runs three required checks on `main`: `build`, `check-types`, and `test` (with
a pinned `postgres:17-alpine` service so the 35 integration tests execute for
real instead of silently skipping).

Known limitation: `pnpm lint` is red repo-wide because `typescript-eslint` does
not yet support TypeScript 7.0 (upstream tracking issue
typescript-eslint#10940) — a parser version gate, not a code defect. It is not a
CI gate.

## Docs

- `docs/overview.md` — project summary, stack, dependencies, how to run it
- `docs/architecture.md` — where everything lives and how to navigate it
- `docs/decisions.md` — decision log: the reasoning behind the code
