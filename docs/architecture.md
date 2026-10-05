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
│   ├── infrastructure/       Adaptadores Mongoose MongoDB + email (Resend)
│   ├── typescript-config/    base.json activo (nextjs/react-library sin uso)
│   └── eslint-config/        Consumir vía ./base
├── docs/                     overview · architecture · tasks · traps (+ pendientes históricos en git)
├── .opencode/agents/         implementer (writer acotado) · reviewer (verificador solo-lectura)
├── design-system/auth-app/   Diseño visual (FUERA del workspace: Turbo lo ignora)
├── tools/                    Herramientas externas y scripts (fuera del workspace: Turbo lo ignora)
├── devops/                   Objetivo — no existe aún: docker, kubernetes, terraform y demás
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
MongoDB (vía Mongoose) · Email (vía Resend)
```

Regla de dirección: `core` no conoce a nadie; `security` e `infrastructure`
conocen a `core`; solo `api-gateway` conoce a los tres; `web` solo conoce los
**tipos** de `core`. Nada en `packages/*` importa de `apps/*`, nunca.

## Arquitectura objetivo

Definición única hacia donde evoluciona el repo. Si algo de lo aquí escrito
contradice a los manifests o a `src/`, mandan los manifests y `src/`.

- **`packages/core` — lógica de negocio con DDD y Hexagonal.** Dominio puro:
  entidades, value objects, errores tipados con `code` y casos de uso. Los
  puertos (`application/ports/`, `domain/repositories/`) definen lo que el
  negocio necesita; las implementaciones viven fuera. Sin dependencias runtime.
- **`packages/infrastructure` — infraestructura del negocio.** Bases de datos y
  sus implementaciones, caché, sistemas externos y adaptadores que implementan
  los puertos de `core` (hoy: repositorios Mongoose MongoDB, mappers, `connection.ts`,
  `ResendEmailSender`). `cache/`, `external/`, `shared/`, `config/`
  son puntos de extensión para futuras bases, cachés o integraciones.
- **`packages/security` — seguridad.** Toda la lógica e implementación de
  seguridad requerida por los puertos de `core` (hoy: hash con bcrypt, JWT,
  hash sha256 de refresh tokens, generación de ids). Conoce a `core`, nunca al
  revés; el dominio no sabe cómo se hashea o firma algo.
- **`tools/` — herramientas externas y scripts.** Helpers de desarrollo que no
  se importan desde las aplicaciones ni se empaquetan (hoy: `gh.ps1`,
  `with-github-token.ps1` + `README.md`). Fuera del workspace de pnpm y de los
  globs de Turbo.
- **`devops/` — objetivo, no existe aún.** Directorio previsto para docker,
  kubernetes, terraform y demás automatización de despliegue e infraestructura.
  No se crea por anticipado: cuando aparezca, vive acá y fuera de los globs de
  Turbo, igual que `tools/`.

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
| `persistence/mongo/models/` | `AuthUserModel`, `RefreshTokenModel`, `PasswordResetTokenModel` (Mongoose; `uuid` clave de negocio, email unique normalizado) |
| `persistence/mongo/mappers/` | Mongo ↔ entidades (con las 2 pérdidas deliberadas documentadas) |
| `persistence/mongo/repositories/` | `MongoAuthRepository`, `MongoRefreshTokenRepository`, `MongoPasswordResetTokenRepository` |
| `persistence/mongo/connection.ts` | `resolveMongoUri`, `connectDatabase`, `disconnectDatabase` (mongoose vive solo acá) |
| `persistence/mongo/scripts/` | `promoteAdmin.ts` (primer admin; `mongo:promote-admin`) |
| `email/` | `ResendEmailSender` (implementa el port `EmailSender`) |

`cache/`, `external/`, `shared/`, `config/` son extension points vacíos.

### `apps/api-gateway/src/` — composición HTTP (estilo del dueño)

| Carpeta | Responsabilidad |
|---|---|
| `core/di/` | Composition root (`container.ts`): acá se hace `new` de todo |

Composition root de auth (TK-13/TK-14, DI manual sin frameworks):

- `core/di/infrastructure.ts` (`createAuthInfrastructure`): construye adapters
  compartidos (repos Mongoose, seguridad, email) desde `config/env`.
- `core/di/authentication.ts` (`createAuthenticationContainer(infra)`):
  ensambla casos de uso + controller + middleware `authorize` ya construido.
  Expone API mínima (`controller`, `authorize`, `useCases`); los adapters
  concretos no salen de acá. Módulo de referencia para futuros features.
- `core/di/container.ts`: App root fino (`{ authentication, close }`) +
  singleton lazy y shutdown idempotente. Las rutas no componen: reciben piezas
  listas.
- Lifecycle: `core/index.ts` conecta (`connectDatabase`), SIGTERM/SIGINT
  cierran (`closeContainer`, idempotente). MongoDB pertenece a auth —único
  consumidor—; si aparece un segundo módulo, el lifecycle sube al arranque.
- Config centralizada en `config/env/` (fail-fast); ni el container ni los
  casos de uso leen `process.env`.
- Sin app container multi-módulo hasta que haya ≥2 módulos (decisión
  explícita, no deuda).
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

### `tools/` — herramientas externas y scripts

Helpers de desarrollo (`gh.ps1`, `with-github-token.ps1`, `README.md`). Nada de
acá se importa desde `apps/*` o `packages/*`, nada se empaqueta, Turbo lo
ignora (fuera de los globs del workspace `apps/*`, `packages/*`).

### `devops/` — objetivo, no existe aún

Directorio previsto para docker, kubernetes, terraform y demás. No existe en el
repo hoy (verificado); no se crea vacío por anticipado. Cuando aparezca, sigue
las mismas reglas que `tools/`: fuera del workspace y fuera de los globs de
Turbo.

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

## Agentes del repo

Los subagentes que este flujo puede usar viven en tres capas: builtins
(`explore`, `general`), globales (`test-writer`, `doc-writer`, `sdd-*`) y de
repo (`.opencode/agents/`: `implementer` para escribir acotado, `reviewer`
para verificar sin tocar). La tabla de ruteo por fase TK y el contrato de
prompt están en `AGENTS.md` (sección Delegación); acá solo importa saber que
existen y dónde viven.
