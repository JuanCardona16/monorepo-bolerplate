# Overview

Monorepo de autenticación de punta a punta: dominio de auth en TypeScript puro,
API Express que lo expone y cliente React que lo consume. Sirve como base
reutilizable (este es el "bolerplate") y como referencia de decisiones ya pagadas:
cada trampa que costó tiempo está registrada en Engram (topics
`decisions/D-XXX`) con su motivo.

## Estado

La autenticación opera completa: registro, login, refresh con rotación y
revocación, logout, perfil, gestión de roles, reset de contraseña, spec OpenAPI con
Swagger UI y las dos bases (Neon para la app, Postgres local para tests).

## Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript 7.0.2 (un solo major en todo el workspace) |
| Monorepo | pnpm@12.5.1 workspaces (`apps/*`, `packages/*`) + Turbo 2 |
| API | Express 5, Zod, helmet, express-rate-limit, swagger-ui-express |
| Cliente | React 19, Vite 8, Tailwind 4, TanStack Query 5, zustand 5, react-hook-form 7 |
| Persistencia | Prisma 7.10 + Postgres 17 (`pg`, `@prisma/adapter-pg`) |
| Tests | Vitest 4.1.10, 5 proyectos, 646 tests |
| CI | GitHub Actions: `build`, `check-types`, `test` (+ Postgres service) |

## Dependencias por paquete

| Paquete | Runtime | Solo tipos / dev |
|---|---|---|
| `@repo/core` | ninguna | vitest |
| `@repo/security` | `@repo/core`, `bcrypt`, `jsonwebtoken` | `@types/*`, vitest |
| `@repo/infrastructure` | `@repo/core`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv` | `prisma`, `tsx`, vitest |
| `api-gateway` | `core`, `infrastructure`, `security`, `express`, `zod`, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `swagger-ui-express`, `dotenv` | `tsx`, `typescript ^7.0.2`, vitest |
| `web` | `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `zustand`, `react-hook-form` | `@repo/core` (devDep solo-tipos), `vite`, `tailwindcss`, `eslint`, `typescript-eslint`, testing-library, vitest |

`@repo/core` no tiene dependencias runtime: es importable desde cualquier lado sin
arrastrar nada. `web` no depende del API en build — el contrato se verifica con
tests y review, no con tipos (salvo los DTOs, que re-exporta de core).

## Cómo correrlo

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

- Dev API: `pnpm --filter api-gateway dev` (requiere `apps/api-gateway/.env.local`
  con `DATABASE_URL` y los 6 secretos de `src/config/env/`).
- Dev web: `pnpm --filter web dev`.
- Tests de integración: necesitan `DATABASE_URL` apuntando a un Postgres 17 con
  migraciones aplicadas (`pnpm --filter @repo/infrastructure prisma:migrate:deploy`);
  sin la variable hacen skip en local y fallan en CI.

## Documentación

| Archivo | Qué responde |
|---|---|
| `docs/overview.md` | Qué es esto (este archivo) |
| `docs/architecture.md` | Dónde vive cada cosa y cómo navegarlo |
| `docs/traps.md` | Trampas ya pagadas, por área |
| `docs/decisions.md` → Engram | Por qué el código es como es (proyecto `monorepo-bolerplate`, topics `decisions/D-001..D-030`) |
| `docs/auth-tareas-pendientes.md` | Qué de auth quedó pendiente |
| `design-system/auth-app/MASTER.md` | Diseño visual de la app de auth (fuera del workspace) |
| `odd/tasks/` | Bitácoras de trabajo por feature |
