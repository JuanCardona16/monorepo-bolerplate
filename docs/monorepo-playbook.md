# Monorepo Playbook

Manual operativo del monorepo: cómo está organizado, cómo se trabaja en él y
qué trampas no repetir. Es síntesis de `AGENTS.md`, `docs/overview.md`,
`docs/architecture.md`, `docs/traps.md`, `docs/tasks.md` y los manifests
(`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `vitest.config.ts`,
`.github/workflows/ci.yml`).

Orden de lectura recomendado: este playbook primero (panorama), después el doc
específico según la necesidad (mapa de responsabilidades, catálogo de trampas,
backlog). Si algo de lo aquí escrito contradice a los manifests o a `src/`,
mandan los manifests y `src/`.

## 1. Qué es este repo

Monorepo de autenticación de punta a punta: dominio de auth en TypeScript puro,
API Express que lo expone y cliente React que lo consume. Sirve como base
reutilizable y como referencia de decisiones ya pagadas (cada trampa que costó
tiempo está registrada en Engram, proyecto `monorepo-bolerplate`, topics
`decisions/D-XXX`).

La autenticación opera completa: registro, login, refresh con rotación y
revocación, logout, perfil, gestión de roles, reset de contraseña, spec OpenAPI
con Swagger UI y MongoDB (Atlas para la app, `mongo:8.0` local/CI para tests).

## 2. Arquitectura y dirección de dependencias

| Paquete | Qué es | Deps de workspace |
|---|---|---|
| `apps/api-gateway` | App Express 5, compone todo (`src/core/di/container.ts`) | `core`, `security`, `infrastructure` |
| `apps/web` | Cliente React 19 + Vite 8 + Tailwind 4 (nombre `web`, no `@repo/web`) | `core` solo como devDep solo-tipos |
| `packages/core` | Lógica de negocio con DDD y Hexagonal: dominio puro + ports, sin deps runtime, dueño del contrato | ninguna |
| `packages/security` | Seguridad: toda la lógica/implementación requerida por los ports de core (bcrypt, JWT, sha256, ids) | `core` |
| `packages/infrastructure` | Infraestructura del negocio: DBs y sus implementaciones, caché, sistemas externos, adaptadores (Mongoose MongoDB + email Resend) | `core` |
| `packages/typescript-config` | Solo `base.json` activo; resto sin uso | — |
| `packages/eslint-config` | Consumir vía `./base` | — |
| `tools/` | Herramientas externas y scripts (fuera del workspace, Turbo lo ignora) | — |
| `devops/` | Objetivo — no existe aún: docker, kubernetes, terraform y demás | — |

Arquitectura objetivo: `core` es dominio puro con puertos hexagonales; las
implementaciones viven en `security` e `infrastructure`. `tools/` y `devops/`
quedan fuera del workspace y de Turbo (ver sección 3).

Regla de dirección (por estructura, no por tooling):

- `core` no conoce a nadie; `security` e `infrastructure` conocen a `core`;
  solo `api-gateway` conoce a los tres; `web` solo conoce los **tipos** de `core`.
- Nada en `packages/*` importa de `apps/*`, nunca.

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

### Boundaries e imports

- Importar siempre por package exports (`@repo/core/authentication`,
  `@repo/infrastructure/persistence/mongo`). Un deep import
  `../../packages/*/src/...` rompe el boundary y tsc igual lo acepta.
- `turbo boundaries` evaluado y descartado a propósito: cero deep imports hoy
  (ver D-029 en Engram).
- `moduleResolution: NodeNext` (heredado de `typescript-config/base.json`) —
  los imports relativos llevan extensión `.js`.
- `web` nunca importa runtime de `core`: solo tipos, y `verbatimModuleSyntax`
  los borra del bundle (`apps/web/tsconfig.app.json` y `tsconfig.node.json` lo
  activan; `apps/web/src/features/auth/types.ts` documenta la garantía).

### Build y tsconfig por librería

- `tsup.config.ts` por lib: entry `src/**/index.ts`, solo `format: ["esm"]`,
  `sourcemap: true`. Cada subpath necesita su `index.ts`.
- `build:js` = `tsup`, `build:types` = `tsc`, `build` = `pnpm build:js &&
  pnpm build:types` — en ese orden.
- `dev` = `tsup --watch --onSuccess "pnpm run build:types"`.
- `tsconfig.json` por lib: `rootDir ./src`, `outDir ./dist`. Sin `include`
  (tsc globea todo `.ts`) y con `exclude` de `src/**/__tests__/**` para no
  emitir tests compilados al `dist/`.
- `dist/`, `.turbo/`, `node_modules/` son artefactos — nunca editar; rebuild
  vía `build:js`/`build:types`.

### Responsabilidades por carpeta (resumen)

- `packages/core/src/authentication/`: `domain/entities/` (`AuthUser`,
  `RefreshToken`, `PasswordResetToken`), `domain/value-objects/` (`Email`,
  `Password`, `Role`), `domain/errors/` (tipados con `code`, sin status HTTP),
  `domain/repositories/` (ports), `application/use-cases/` (`Login`,
  `Register`, `Refresh`, `Logout`, `GetProfile`, `ChangeRoles`,
  `Request/ConfirmPasswordReset`), `application/dtos/` (contrato wire +
  `SessionDTO`), `application/ports/`. Tres use cases tienen tipos junto a su
  caso de uso, no en `dtos/` — buscar solo en `dtos/` lleva a duplicarlos
  (D-028). Regla objetivo: el dominio no importa implementaciones; todo lo
  externo entra por ports.
- `packages/security/src/`: seguridad — una implementación por archivo
  (`BcryptPasswordHasher`, `JwtTokenProvider`, `Sha256RefreshTokenHasher`,
  `CryptoIdGenerator`). Si hay que cambiar cómo se hashea o firma algo, es acá;
  el dominio no se entera. Conoce a `core`, nunca al revés.
- `packages/infrastructure/src/`: infraestructura del negocio —
  `persistence/mongo/models/` (`AuthUserModel`, `RefreshTokenModel`,
  `PasswordResetTokenModel`), `persistence/mongo/mappers/`,
  `persistence/mongo/repositories/`, `persistence/mongo/connection.ts`
  (`resolveMongoUri`, `connectDatabase`, `disconnectDatabase` — mongoose vive
  solo acá, el gateway no lo importa directo),
  `persistence/mongo/scripts/` (`promoteAdmin.ts`, `mongo:promote-admin`),
  `email/` (`ResendEmailSender`). `cache/`, `external/`, `shared/`, `config/`
  son extension points vacíos para futuras DBs, cachés o sistemas externos.
- `apps/api-gateway/src/`: `core/di/` (composition root, acá se hace `new` de
  todo), `core/routes/`, `core/middleware/`, `core/errors/`, `core/docs/`
  (OpenAPI + Swagger UI en `/api/docs`), `config/env/` (6 secretos
  `required()` fail-fast), `constants/` (enums `ApiPrefix` + `PublicRoutes` /
  `PrivateRoutes`), `features/authentication/` (`routes/` → `schemas/` Zod →
  `controllers/` finos).
- `apps/web/src/`: `features/auth/pages/`, `features/auth/stores/` (zustand; el
  token NO sale de acá, sale del accessor de `apiClient`),
  `features/auth/types.ts` (cero declaraciones, solo re-exports),
  `infrastructure/http/apiClient.ts`, `core/composition/` (`Bootstrap.tsx`,
  `router.tsx`), `constants/routes.ts` (paths espejados del gateway).

### Estilo del api-gateway (seguir el del dueño)

- Fuente: template `JuanCardona16/api-rest-express-template` (Express 5, capas
  `config/core/features/infrastructure/lib/shared/constants`). `src/core/` =
  núcleo de app — NO el dominio.
- Controladores finos: routes → `validateWithZod` → `asyncHandler` →
  controller → **use case de `@repo/core`**. Nada de portar servicios/repos al
  gateway; nada de `new XRepository()` en controllers; todo en el composition
  root.
- Errores: el dominio lleva solo `code` — el gateway mapea `code → HTTP status`
  en `GlobalHandleError` (envelope
  `{success:false, error:{message,code,status,timestamp}}`).
- Patrón de rutas: enums `ApiPrefix` + `PublicRoutes` en `constants/`; JSDoc
  swagger en routes. Imports relativos con `.js` (NodeNext), sin alias `@/`.
- Resuelto: refresh en **cookie HttpOnly**, `helmet` montado, rate limiter
  propio en login, OpenAPI spec **y** Swagger UI servidos.

## 3. Organización: archivos muertos e ignorados por Turbo

- **`vitest.workspace.ts` es un archivo muerto**: ese concepto se eliminó en
  Vitest 3+. El workspace vive en `test.projects` del `vitest.config.ts` raíz
  (ver sección 6).
- Fuera de los globs de Turbo: `design-system/auth-app/MASTER.md`
  (documentación de diseño) y `tools/` (herramientas externas y scripts:
  helpers `gh.ps1`, `with-github-token.ps1` + `README.md`) no los toca Turbo.
  Nada de `tools/` se importa desde `apps/*` o `packages/*`.
- **`devops/` es objetivo y no existe aún** (verificado: sin archivos en el
  repo). Directorio previsto para docker, kubernetes, terraform y demás. No se
  crea vacío por anticipado; cuando aparezca, vive fuera del workspace
  (`apps/*`, `packages/*`) y fuera de los globs de Turbo, igual que `tools/`.
- `packages/typescript-config` y `packages/eslint-config` son paquetes solo de
  configuración, sin scripts: excluidos a propósito de los proyectos de Vitest.
- `odd/tasks/`: bitácoras de trabajo por feature. El done-log histórico vive en
  git (`git log --grep=TK-NN`), no en `docs/tasks.md`.

## 4. Dependencias y setup

- `pnpm@12.5.1`, `node >= 24` (`engines` en `package.json`). Siempre `pnpm`;
  nada de npm/yarn.
- Raíces del workspace (`pnpm-workspace.yaml`): `apps/*`, `packages/*`.
- Instalación: `pnpm install`. El orden de build importa: dependencias primero
  vía `turbo run build` (`build.dependsOn: ["^build"]` en `turbo.json`).
- `turbo.json`: `check-types` dependsOn `^build` (necesita los `dist/*.d.ts`
  de las dependencias). `build.outputs` incluye `dist/**`. `build.inputs`
  incluye `.env*`.
- `allowBuilds` en `pnpm-workspace.yaml`: `bcrypt`, `esbuild` aprobados; **`@scarf/scarf` explícitamente `false`**
  (postinstall que reporta a `scarf.sh`, transitivo vía `swagger-ui-dist`).
  Re-chequear `allowBuilds` con cada `pnpm add` (D-020).
- `onlyBuiltDependencies` se eliminó en pnpm v11 y el campo `pnpm` en
  `package.json` ya no se lee. Ambos son callejones sin salida; los settings de
  pnpm 12 viven en `pnpm-workspace.yaml`.
- `dangerouslyAllowAllBuilds` deliberadamente no usado.
- Env: `.env*` gitignored, nunca commitear secretos. `turbo.json`
  `build.inputs` incluye `.env*`. El gateway exige 6 secretos a boot
  (`required()` fail-fast: `TOKEN_SECRET_KEY`, `REFRESH_TOKEN_SECRET_KEY`,
  `MONGODB_URI` y otros tres en `apps/api-gateway/src/config/env/`); `dotenv`
  carga `.env.local` y después `.env`.
- Prettier sin config; `pnpm format` reescribe in place — correr solo sobre
  archivos tocados o esperar diff repo-wide.

### Gotcha de pnpm (va a hacer perder tiempo otra vez)

`pnpm install` pasando en local no prueba nada sobre CI. Un `node_modules`
poblado hace que pnpm nunca re-evalúe postinstall scripts, que es justo el
check que falla en un runner limpio. Para ejercitar build scripts de verdad:
`pnpm rebuild`.

Caso concreto (histórico, era Prisma): un postinstall que genera artefactos solo
corre en `install`, no en `build`; si se borra el artefacto, un `pnpm install`
común NO lo trae de vuelta — usar `pnpm install --force`. Hoy infrastructure no
genera nada en postinstall.

## 5. Contrato de auth (`@repo/core` manda)

- `apps/web/src/features/auth/types.ts` tiene cero declaraciones: todo es
  `export type` re-exportando el tipo de core que define la forma
  (`LoginInput`→`LoginInputDTO`, `Profile`→`ProfileOutput`,
  `SessionPayload`→`SessionDTO`, …). `@repo/core` es **devDependency** de `web`,
  nunca runtime. **Agregar un campo a un DTO es un cambio en core** (D-028).
- Cuando un DTO cambia, `core` cambia primero. Lo único todavía manual del lado
  web es la lista de **paths** en `apps/web/src/constants/routes.ts`, que
  espeja `ApiPrefix` + `PublicRoutes`/`PrivateRoutes` del gateway. Seis paths
  vienen de `PublicRoutes`; `ME` viene de **`PrivateRoutes`**.
- `SessionDTO` es deliberadamente **más angosto** que
  `LoginOutputDTO`/`RefreshOutputDTO`: el gateway responde `{ accessToken }`
  porque el refresh viaja en cookie HttpOnly. No "simplificarlo" a
  `Pick<LoginOutputDTO, "accessToken">` — codificaría la decisión de transporte
  como proyección del cliente.
- `Email` normaliza (`trim().toLowerCase()`) antes de validar; índice único
  funcional en `lower(email)`; ambas capas en sync (D-001).

## 6. Gates de verificación

Comandos raíz (todo vía Turbo): `pnpm build`, `pnpm dev` (persistente, sin
cache), `pnpm lint` (ROTO, ver abajo), `pnpm check-types`, `pnpm format`.
Por paquete (preferido para trabajo enfocado):
`pnpm --filter @repo/core build`, `turbo build --filter=@repo/core`.

- **Vitest 4.1.10**, un proyecto por paquete testeable (5: `@repo/core`,
  `@repo/security`, `@repo/infrastructure`, `api-gateway`, `web`) vía
  `test.projects` en el `vitest.config.ts` raíz.
- **593 tests** (`pnpm test` sin DB): `@repo/core` 216, `api-gateway` 175,
  `web` 134, `@repo/security` 39, `@repo/infrastructure` 29 + 5 de integración
  con **skip**. Correr el gate **dos veces**: sin `MONGODB_URI` y con él. Los 5
  tests de integración de `infrastructure` están gated: hacen **skip** sin la
  variable y hacen **throw** con `CI=true` sin ella (en CI significa que el
  service container o el env wiring se rompió).
- **`.github/workflows/ci.yml`**: tres jobs paralelos (`build`, `check-types`,
  `test`), sin `needs`, `concurrency` cancela runs superados. Los tres son
  **required status checks en `main`**. El job `test` levanta un service
  container **`mongo:8.0`** (pineado, no `latest`) y expone `MONGODB_URI` — sin
  DB los repos de mongo no tienen contra qué probarse y el gate lo grita en vez
  de skipear.
- `main` protegida: checks requeridos, `strict: true`, `enforce_admins: true`,
  **0 aprobaciones** (solo developer), force-push y borrado bloqueados. Push
  directo a `main` rechazado — todo por PR.
- Lo más cercano a un typecheck standalone:
  `pnpm --filter <pkg> build:types` (`tsc` con `declaration: true`). El
  `check-types` raíz corre **8 tasks** (5 typechecks + 3 builds de
  dependencias): cada paquete con `tsconfig.test.json` con `noEmit: true`
  que type-checkea `src/**/*` incluyendo tests, porque `tsconfig.json` excluye
  `__tests__` del emit. El gateway tiene `check-types` propio desde TK-14
  (antes sus tests con args de menos al controller pasaban en verde sin que
  tsc los viera).
- El task `test` declara `env: ["MONGODB_URI"]` e `inputs: [".env*"]` (sin
  declarar, Turbo filtraba la variable y los tests de integración se
  skipeaban en *cada* run) y tiene **`cache: false`** (depende de una DB viva
  cuyo contenido ninguna cache key puede ver).
- **Ningún paquete usa `--passWithNoTests`.** Una suite vacía es failure de CI,
  no verde falso. No re-agregar el flag.
- Gate local completo:
  `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test`.

### `pnpm lint` está rojo (no es defecto de código)

Falla con `Error: typescript-eslint does not support TS 7.0` (tracking
typescript-eslint#10940, soporte para TS >= 7.1). **No se arregla subiendo una
versión**: esperar >= 7.1 o apuntar el parser a la API de TS 6 side-by-side
(TK-07, D-030).

- Solo `apps/web` define script `lint`; los cuatro paquetes de backend **no
  definen ninguno**, así que Turbo los saltea en silencio (TK-08). Un `pnpm
  lint` en verde significaría 1 de 5, no el repo.
- **No es CI gate**: `ci.yml` tiene exactamente tres jobs y `lint` no es uno.
  `pnpm peers check` también sale 1 por lo mismo (el parser pide
  `typescript: '>=4.8.4 <6.1.0'`).
- Los gates confiables hoy: `pnpm build`, `pnpm check-types`, `pnpm test`.

## 7. Rutina de trabajo por tarea (TK)

Capa operativa sobre ODD (autorizar → explorar → clasificar → trackear →
implementar → verificar → cerrar). Las reglas no se negocian por apuro: si una
choca con el pedido (tocar lo verificado, saltear tests, no documentar), se
frena y se pregunta.

1. **Leer primero, siempre.** Antes de tocar nada: `docs/tasks.md` (qué está
   pendiente), `docs/traps.md` (trampas del área), Engram (`mem_search` en
   `monorepo-bolerplate`: decisiones y estado de sesión), y
   `docs/architecture.md` si hay que ubicarse.
2. **Rama nueva por tarea**: `<tipo>/TK-NN-descripcion-corta` (`docs/`,
   `feature/`, `bugfix/`, `ci/`). Ej: `feature/TK-10-login-google`. Una tarea =
   una rama; nada de dos TK en la misma rama.
3. **Lo verificado no se toca.** Una tarea cerrada y en verde solo se reabre por
   vulnerabilidad/fallo encontrado, o porque otra feature la rompe y hay que
   adaptarla. Mejoras "de paso" van a `tasks.md` como TK nuevo, no al diff
   actual.
4. **Cachear al cerrar**: guardar en Engram lo aprendido (decisión, bug,
   gotcha) y sincronizar el índice de codegraph (`sync <root>`) tras editar.
   Engram = porqué y estado; codegraph = dónde está el código. No se cachea
   trivia.
5. **Docs al día al cerrar**: `tasks.md` (tachar el TK), Engram si hubo decisión
   nueva, y el doc alcanzado si cambió el contrato. Commit de cierre separado
   de docs vs código cuando aplique.
6. **TDD siempre en código**: test primero en la categoría que corresponda,
   rojo observado, después el código mínimo que lo pone en verde, después
   refactor. Verificado por mutación cuando el test pina un bug. En tareas
   solo-docs, la "prueba" es el readback de verificación, no un test inventado.
7. **Cuándo avanzar solo y cuándo frenar.** Solo: lo pedido es explícito y cabe
   en el alcance; verificar con gates reales y reportar; commitear en la rama
   de trabajo. Frenar y preguntar (una sola pregunta): alcance ambiguo o
   condicional, decisión de producto/arquitectura no registrada, expansión a
   archivos fuera de lo pedido, push/PR/merge/borrado de datos/credenciales, o
   evidencia que contradice lo pedido. Nunca: asumir respuestas, afirmar sin
   leer/ejecutar, expandir alcance "de paso", presentar menús sin bifurcación
   real.

### Política de PRs y merge (standing)

- Por cada tarea se crea su PR. Si los checks están en verde y no es sensible,
  se mergea sin preguntar. Si es sensible o requiere revisión, se sube el PR y
  se avisa para que lo revise y mergee el usuario.
- **Sensible =** comportamiento de auth o seguridad, datos reales o migraciones
  en producción, secretos/credenciales, cambios a CI o a la protección de
  `main`, cambios de contrato (DTOs, rutas). Docs, tests y refactors internos
  con checks verdes no son sensibles.
- **El remoto se llama `main`, no `origin`.** `origin` no existe.
  `git fetch main`, `git push main <branch>`.
- Todo por PR con merge commit (`gh pr merge <n> --merge`, sin squash/rebase).
  Commits convencionales en español, sin atribución a IA, identidad repo-local.

## 8. Trampas (índice — el catálogo vive en `docs/traps.md`)

| Voy a tocar | Leer primero |
|---|---|
| Tests, Vitest, mocks, Mongo en tests | `traps.md` — Tests / Vitest |
| Middleware, logger, docs, Swagger, gateway | `traps.md` — Express / gateway |
| Login, reset, roles, cookies, cliente auth | `traps.md` — Auth / dominio |
| `.env.local`, Atlas vs local | `traps.md` — Mongo / env |
| pnpm, Turbo, imports, rutas | `traps.md` — Tooling / repo |

Resumen de las más caras (detalle y evidencia en `traps.md`):

- `vi.mock` resuelve desde el módulo bajo test, no desde el test (D-013): un
  especificador distinto hace que el mock no aplique en silencio y la suite
  toque una DB real.
- El env de tests del gateway se setea en `src/test/setupEnv.ts` (entry
  `setupFiles`), no por suite: `required()` corre a import time (D-021).
- Express reescribe `req.url` dentro de un router montado: `requestLogger`
  captura `method`/`path`/`ip` eagerly y va primero en `app.ts` (D-015, D-016).
- Docs handlers con `get("/path")`, nunca `use("/", handler)` (D-010); sin
  `swaggerUi.serve`, pantalla en blanco con todo en 200.
- Password reset: `forgot` responde byte-idéntico y el use case traga todo
  error del sender (anti-oráculo, D-024); token en el fragment de la URL.
- Dos `.env.local`: `apps/api-gateway/.env.local` (Atlas) es la app; el raíz
  es para integration tests (D-009). Sin migraciones: el schema lo definen los
  modelos Mongoose.
- Aislamiento de tests por clave única (`randomUUID`), nunca `deleteMany`
  global (D-009).
- Primer admin por script
  (`pnpm --filter @repo/infrastructure mongo:promote-admin -- <email>`), no
  por ruta (D-012).
- Cambiar roles es reemplazo total + revoca sesiones; `requireRole("admin")`
  después de `createAuthorize`; el anónimo recibe 401, nunca 403 (D-005,
  D-006).
- El "Remember for 30 days" del login es texto estático, no checkbox (D-018);
  TK-10 lo vuelve checkbox real cuando se implemente.
- `RESEND_KEY`, `CLIENT_GOOGLE_ID`, `CLIENT_GOOGLE_SECRET` eliminados
  (leftovers del template, cero consumidores) — no re-agregar sin el código que
  los use (D-017).
- `apiClient` normaliza un `fetch` rechazado a `ApiError` (`NETWORK_ERROR`);
  `AbortError` pasa intacto (D-019).
- En `web`, el header `Authorization` sale del accessor que `Bootstrap` instala
  vía `configureApi`, no del store zustand.

## 9. Decisiones D-019 a D-030 (referencia rápida)

Solo lo verificable en archivos del repo; el contenido completo vive en Engram
(`decisions/D-XXX`). No verificado en archivos (ver en Engram antes de afirmar):
D-022, D-025, D-026.

| Decisión | Tema | Dónde se ve en el repo |
|---|---|---|
| D-019 | `apiClient` normaliza a `ApiError`, `AbortError` intacto | `traps.md` — Auth / dominio |
| D-020 | `@scarf/scarf` no aprobado en `allowBuilds` | `pnpm-workspace.yaml`, `traps.md` |
| D-021 | Env de tests a import-time (`setupEnv.ts`) | `traps.md` |
| D-023 | Vars de email opcionales con warning; sin `PASSWORD_RESET_URL`, links muertos (TK-02) | `traps.md`, `tasks.md` TK-02 |
| D-024 | `forgot` byte-idéntico, anti-oráculo de enumeración | `traps.md` — Auth / dominio |
| D-027 | Histórica (era Prisma): scripts `prisma:migrate:*` pasaban `--config` solos; sin objeto desde TK-12 | Engram |
| D-028 | Agregar un campo a un DTO es un cambio en core; tipos junto a use cases | `AGENTS.md`, `traps.md` |
| D-029 | `turbo boundaries` descartado (cero deep imports) | `AGENTS.md`, `traps.md` |
| D-030 | `pnpm lint` rojo por parser TS 7.0, no es defecto de código (TK-07) | `AGENTS.md`, `tasks.md` TK-07 |

## 10. GitHub: token, CLI y MCP

- Auth remoto con `GITHUB_TOKEN` del entorno; **cada shell es un proceso
  fresco**: re-exportarlo en cada comando (`AGENTS.md` — Git).
- `GITHUB_TOKEN` persistido a nivel de usuario (variable de entorno del SO)
  cubre tanto al GitHub MCP server como al CLI `gh` (documentado en
  `tools/README.md`): fijarlo una vez con
  `[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', '<token>', 'User')` y
  reiniciar OpenCode para que lo tome.
- Para no pegar el token en el historial del shell, usar los helpers (nunca
  imprimen ni guardan el token, solo lo exportan al proceso hijo):
  `powershell -File tools\gh.ps1 pr list` o
  `powershell -File tools\with-github-token.ps1 gh auth status`.
  `with-github-token.ps1` resuelve desde el `.env.local` raíz
  (`OPENCODE_GITHUB_TOKEN`, fallback `GITHUB_TOKEN`); `gh.ps1` resuelve
  proceso → variable de usuario.
- Reglas de seguridad: nunca pegar valores de tokens en chat, transcripts o
  comandos; nunca guardar secretos en archivos del repo (`.env*` está
  gitignored) ni en memoria. Preferir token fine-grained limitado a este repo.

## 11. Cómo navegar el repo

1. **Codegraph primero** en preguntas estructurales (`status`, `query`,
   `explore`, `callers`); `sync` tras editar. Si el índice está stale,
   verificar con Read.
2. **Por síntoma**: error HTTP → `features/authentication/` del gateway; forma
   de datos → `core/.../dtos/`; comportamiento de auth → use case en core;
   persistencia → `infrastructure/.../repositories/`; UI →
   `web/features/auth/pages/`.
3. **Por decisión**: Engram antes de cambiar comportamiento (`mem_search`,
   proyecto `monorepo-bolerplate`, topics `decisions/D-001..D-030`).
4. **Por path HTTP**: `constants/routes.ts` del gateway es la fuente; el espejo
   web es copia (y `ME` vive en `PrivateRoutes`, no en `PublicRoutes`).
5. Backlog vivo en `docs/tasks.md` (IDs `TK-NN` inmutables, nunca reutilizados;
   hecho = se borra el ítem y el commit dice `cierra TK-NN`).
