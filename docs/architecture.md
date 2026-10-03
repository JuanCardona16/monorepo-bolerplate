# Architecture

Cómo está organizado el repo, qué responsabilidad tiene cada carpeta y cómo
navegarlo sin perderse. Lo factual corto vive en `AGENTS.md` (## Mapa); acá está
el porqué de cada ubicación.

## Diagrama

```text
monorepo-bolerplate
├── apps/
│   ├── api-gateway/          Express 5 · compone todo · expone HTTP
│   └── web/                  React 19 + Vite 8 · consume HTTP
├── packages/
│   ├── core/                 Dominio auth puro · sin runtime deps · dueño del contrato
│   ├── security/             Implementa ports de core (hash, JWT, ids)
│   ├── infrastructure/       Adaptadores Prisma Postgres + email (Resend)
│   ├── typescript-config/    base.json activo (nextjs/react-library sin uso)
│   └── eslint-config/        Consumir vía ./base
├── docs/                     overview · architecture · decisions · pendientes
├── design-system/auth-app/   Diseño visual (FUERA del workspace: Turbo lo ignora)
├── tools/                    Helper gh.ps1 (fuera del workspace)
└── odd/tasks/                Bitácoras de trabajo por feature
```

Flujo de una request:

```text
web (pages → hooks → apiClient)
  │  HTTP + cookie HttpOnly (refresh) / header Authorization (access)
  ▼
api-gateway (routes → validateWithZod → controller → use case de core)
  │  use cases          │  adapters
  ▼                     ▼
core (dominio)   security + infrastructure (implementan los ports)
  ▼
Postgres (vía Prisma) · Email (vía Resend)
```

Regla de dirección: `core` no conoce a nadie; `security` e `infrastructure`
conocen a `core`; solo `api-gateway` conoce a los tres; `web` solo conoce los
**tipos** de `core`. Nada en `packages/*` importa de `apps/*`, nunca.

## Responsabilidades por carpeta

### `packages/core/src/authentication/` — el dominio, lo más protegido

| Carpeta | Responsabilidad |
|---|---|
| `domain/entities/` | `AuthUser`, `RefreshToken`, `PasswordResetToken` — estado y reglas |
| `domain/value-objects/` | `Email` (normaliza+valida), `Password`, `Role` |
| `domain/errors/` | Errores tipados con `code`, sin status HTTP |
| `domain/repositories/` | Interfaces (ports) que otros implementan |
| `application/use-cases/` | `Login`, `Register`, `Refresh`, `Logout`, `GetProfile`, `ChangeRoles`, `Request/ConfirmPasswordReset` |
| `application/dtos/` | Contrato wire (+ `SessionDTO`: lo que el cliente ve) |
| `application/ports/` | `PasswordHasher`, `TokenProvider`, `RefreshTokenHasher`, `IdGenerator`, `EmailSender` |

Tres use cases viven con tipos que **no** están en `dtos/` sino junto a su caso de
uso — buscar solo en `dtos/` lleva a duplicarlos (ver D-028).

### `packages/security/src/` — implementaciones, una por archivo

`BcryptPasswordHasher`, `JwtTokenProvider`, `Sha256RefreshTokenHasher`,
`CryptoIdGenerator`. Si hay que cambiar cómo se hashea o firma algo, es acá; el
dominio no se entera.

### `packages/infrastructure/src/` — adaptadores y mundo exterior

| Carpeta | Responsabilidad |
|---|---|
| `persistence/postgresSql/repositories/` | `PrismaAuthRepository`, `PrismaRefreshTokenRepository` |
| `persistence/postgresSql/mappers/` | Prisma ↔ entidades (con las 2 pérdidas deliberadas documentadas) |
| `persistence/postgresSql/prisma/` | `schema.prisma` + `migrations/` (`migration.sql` exacto) |
| `persistence/postgresSql/config/` | `prisma.config.ts` (lee el `.env.local` **raíz**) |
| `persistence/postgresSql/scripts/` | `promoteAdmin.ts` (primer admin) |
| `persistence/postgresSql/client.ts` | Cliente Prisma |
| `email/` | `ResendEmailSender` (implementa el port `EmailSender`) |

`cache/`, `external/`, `shared/`, `config/` son extension points vacíos.

### `apps/api-gateway/src/` — composición HTTP (estilo del dueño)

| Carpeta | Responsabilidad |
|---|---|
| `core/di/` | Composition root (`container.ts`): acá se hace `new` de todo |
| `core/routes/`, `core/middleware/`, `core/errors/` | `app.ts`, `requestLogger` (primero), `GlobalHandleError` (mapa code→status) |
| `core/docs/` | OpenAPI + Swagger UI (`/api/docs`) |
| `config/env/` | 6 secretos `required()` fail-fast + knobs opcionales documentados |
| `constants/` | Enums `ApiPrefix` + `PublicRoutes`/`PrivateRoutes` |
| `features/authentication/` | `routes/` → `schemas/` (Zod) → `controllers/` (finos, piden use cases) |
| `__tests__/`, `test/` | Suites + `setupEnv.ts` (env a import-time, no por suite) |

Controladores finos por contrato: nunca `new XRepository()` adentro, nunca lógica
de dominio portada acá.

### `apps/web/src/` — cliente

| Carpeta | Responsabilidad |
|---|---|
| `features/auth/pages/` | `Login`, `Register`, `Forgot/ResetPassword`, `Profile` |
| `features/auth/stores/` | Store zustand (`auth.ts`); el token NO sale de acá (sale del accessor de `apiClient`) |
| `features/auth/types.ts` | Cero declaraciones: re-exports de `@repo/core` |
| `infrastructure/http/` | `apiClient.ts` (normaliza a `ApiError`) |
| `core/composition/` | `Bootstrap.tsx` (instala el accessor vía `configureApi`), `router.tsx` |
| `constants/routes.ts` | Paths espejados del gateway (único contrato manual restante) |
| `shared/components/`, `config/`, `test/` | UI compartida, `env.ts`, setup RTL |

## Cómo navegar

1. **Codegraph primero** en preguntas estructurales (`status`, `query`, `explore`,
   `callers`); `sync` tras editar. Si el índice está stale, verificar con Read.
2. **Por síntoma**: error HTTP → `features/authentication/` del gateway; forma de
   datos → `core/.../dtos/`; comportamiento de auth → use case en core; persistencia
   → `infrastructure/.../repositories/`; UI → `web/features/auth/pages/`.
3. **Por decisión**: Engram antes de cambiar comportamiento (`mem_search` en el
   proyecto `monorepo-bolerplate`, topics `decisions/D-001..D-030`).
4. **Por path HTTP**: `constants/routes.ts` del gateway es la fuente; el espejo web
   es copia (y `ME` vive en `PrivateRoutes`, no en `PublicRoutes`).
5. **Imports**: siempre por package exports; NodeNext exige `.js` en relativos.
   `web` nunca importa runtime de `core` (solo tipos, borrados en build).
