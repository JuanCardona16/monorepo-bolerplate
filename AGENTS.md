# AGENTS.md

> Lectura en orden: este archivo dice **cómo trabajar**; `docs/overview.md` dice
> **qué es el proyecto**; `docs/architecture.md` dice **dónde vive cada cosa**;
> `docs/decisions.md` dice **por qué**. Si algo de lo técnico contradice a los
> manifests o a `src/`, mandan los manifests y `src/`.

## 0. Cómo trabajar en este repo

Estas reglas están primero a propósito: el desvío más caro hasta ahora fue de
autonomía, no de código.

### Cuándo avanzar solo y cuándo frenar

**Avanzar solo** (sin preguntar):

- Lo pedido es explícito y cabe en el alcance: implementar, corregir o documentar
  dentro de los archivos y el comportamiento nombrados.
- Verificar con gates reales (`build`, `check-types`, `test`) y reportar el resultado.
- Commitear en la rama de trabajo con el formato de `## Git`.

**Frenar y preguntar** (una sola pregunta, después esperar):

- El alcance es ambiguo o condicional ("si…", "quizás", "como quieras").
- La tarea implica una decisión de producto o arquitectura no registrada en
  `docs/decisions.md` (un default nuevo, un campo nuevo en un DTO, un cambio de
  transporte como cookie vs body).
- El trabajo se expandiría a archivos fuera de lo pedido.
- Hay que pushear, abrir un PR, mergear, borrar datos reales o tocar credenciales,
  secretos o infraestructura.
- La evidencia contradice lo pedido (el código dice otra cosa que el pedido).

**Nunca**:

- Asumir la respuesta y seguir como si el usuario la hubiera dado.
- Afirmar algo del código sin haberlo leído o ejecutado (ver `Verificar antes
  de afirmar`).
- Expandir el alcance "de paso" — ni un fix chico fuera de lo pedido sin avisar.
- Presentar menús de opciones salvo bifurcación real con tradeoffs.

### Verificar antes de afirmar

- Toda afirmación técnica se cruza contra manifests (`package.json`,
  `turbo.json`, `pnpm-workspace.yaml`, `ci.yml`) o `src/` antes de escribirse.
- `pnpm build`, `pnpm check-types` y `pnpm test` son los gates reales; un verde
  local sin correrlos es una opinión, no una verificación.
- Si una herramienta delegada falla o no existe en este entorno, se dice
  explícitamente y se sigue en directo — nunca se finge la delegación.

### Comunicación

- Respuestas cortas en español rioplatense. Mínimo útil primero; expandir solo si
  lo piden o la tarea lo exige.
- Una pregunta por vez. Después de preguntar, frenar y esperar.
- Los artefactos técnicos (código, UI copy, commits, docs de `docs/`) van en
  inglés salvo que el archivo ya esté en español — se sigue el idioma del archivo.

## Setup

- `pnpm@12.5.1`, `node >= 24`. Siempre `pnpm`; nada de npm/yarn.
- Raíces del workspace (`pnpm-workspace.yaml`): `apps/*`, `packages/*`.
- Instalación: `pnpm install`. El orden de build importa: dependencias primero vía
  `turbo run build` (`build.dependsOn: ["^build"]` en `turbo.json`).

## Comandos

Raíz (`package.json` — todo vía Turbo):

```sh
pnpm build        # turbo run build
pnpm dev          # turbo run dev (persistente, cache: false)
pnpm lint         # turbo run lint — ROTO, ver Gates
pnpm check-types  # turbo run check-types
pnpm format       # prettier --write "**/*.{ts,tsx,md}" (sin config — defaults)
```

Por paquete (preferido para trabajo enfocado):

```sh
pnpm --filter @repo/core build
pnpm --filter @repo/security build
pnpm --filter @repo/infrastructure build
turbo build --filter=@repo/core
```

Librerías (`core`, `security`, `infrastructure`):

- `build:js` = `tsup`, `build:types` = `tsc`, `build` = `pnpm build:js && pnpm build:types` — en ese orden.
- `dev` = `tsup --watch --onSuccess "pnpm run build:types"`.

## Gates de verificación

- **Vitest 4.1.10**, un proyecto por paquete testeable (5: `@repo/core`,
  `@repo/security`, `@repo/infrastructure`, `api-gateway`, `web`) vía
  `test.projects` en el `vitest.config.ts` raíz. **`vitest.workspace.ts` es un
  archivo muerto** — ese concepto se eliminó en Vitest 3+.
- **646 tests**: `@repo/core` 210, `api-gateway` 166, `web` 133,
  `@repo/security` 39, `@repo/infrastructure` 98. Correr el gate **dos veces**:
  sin `DATABASE_URL` y con él. Los 35 tests de integración de `infrastructure`
  están gated: hacen **skip** sin la variable y hacen **throw** con `CI=true` sin
  ella (en CI significa que el service container o el env wiring se rompió).
- **`.github/workflows/ci.yml`**: tres jobs paralelos (`build`, `check-types`,
  `test`), sin `needs`, `concurrency` cancela runs superados. Los tres son
  **required status checks en `main`**. El job `test` levanta un service
  container **`postgres:17-alpine`** (pineado, no `latest`) y aplica migraciones
  con `pnpm --filter @repo/infrastructure prisma:migrate:deploy` *antes* de
  `pnpm test` — sin schema cada query falla con `P2021`, que se lee como repo
  roto en vez de migración faltante.
- `main` está protegida: checks requeridos, `strict: true`, `enforce_admins: true`,
  **0 aprobaciones** (solo developer), force-push y borrado bloqueados. Push
  directo a `main` rechazado — todo por PR.
- Lo más cercano a un typecheck standalone: `pnpm --filter <pkg> build:types`
  (`tsc` con `declaration: true`). El `check-types` raíz corre **7 tasks**
  (4 typechecks + 3 builds de dependencias): cada librería tiene un
  `tsconfig.test.json` con `noEmit: true` que type-checkea `src/**/*` incluyendo
  tests, porque `tsconfig.json` excluye `__tests__` del emit.
- `turbo.json`: `check-types` dependsOn `^build` (el `check-types` de un paquete
  necesita los `dist/*.d.ts` de sus dependencias). `build.outputs` incluye
  `dist/**`. El task `test` declara `env: ["DATABASE_URL"]` e
  `inputs: [".env*"]` (sin declarar, Turbo filtraba la variable y los 35 tests de
  integración se skipeaban en *cada* run) y tiene **`cache: false`** (depende de
  una DB viva cuyo contenido ninguna cache key puede ver).
- **Ningún paquete usa `--passWithNoTests`.** Una suite vacía es failure de CI, no
  verde falso. No re-agregar el flag.
- **`pnpm lint` está ROJO y NO es defecto de código — y cubre solo 1 de 5
  paquetes.** Falla con `Error: typescript-eslint does not support TS 7.0`
  (tracking typescript-eslint#10940, soporte para TS >= 7.1). **No se arregla
  subiendo una versión**: esperar >= 7.1 o apuntar el parser a la API de TS 6
  side-by-side.
  - Solo `apps/web` define script `lint`; los cuatro paquetes de backend **no
    definen ninguno**, así que Turbo los saltea en silencio. Un `pnpm lint` en
    verde significaría 1 de 5, no el repo.
  - **No CI gate en rojo**: `ci.yml` tiene exactamente tres jobs y `lint` no es
    uno. `pnpm peers check` también sale 1 por lo mismo (el parser pide
    `typescript: '>=4.8.4 <6.1.0'`).
  - Los gates confiables hoy: `pnpm build`, `pnpm check-types`, `pnpm test`.
- Gate local completo: `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test`.

### Gotcha de pnpm que va a hacer perder tiempo otra vez

`pnpm install` pasando en local no prueba nada sobre CI. Un `node_modules`
poblado hace que pnpm nunca re-evalúe postinstall scripts, que es justo el check
que falla en un runner limpio. Para ejercitar build scripts de verdad: `pnpm rebuild`.

- `strictDepBuilds` default `true`: un postinstall no aprobado aborta con
  `ERR_PNPM_IGNORED_BUILDS`.
- Aprobados en **`pnpm-workspace.yaml`** bajo `allowBuilds`: `@prisma/engines`,
  `bcrypt`, `esbuild`, `prisma`.
- `onlyBuiltDependencies` se **eliminó** en pnpm v11 y el campo `pnpm` en
  `package.json` ya no se lee. Ambos son callejones sin salida; settings de
  pnpm 12 viven en `pnpm-workspace.yaml`.
- `dangerouslyAllowAllBuilds` deliberadamente no usado: dejaría correr scripts de
  dependencias transitivas sin revisar.

## Mapa (resumen — el detalle vive en `docs/architecture.md`)

| Paquete | Qué es | Deps de workspace |
|---|---|---|
| `apps/api-gateway` | App Express 5, compone todo (`src/core/di/container.ts`) | `core`, `security`, `infrastructure` |
| `apps/web` | Cliente React 19 + Vite 8 + Tailwind 4 (`web`, no `@repo/web`) | `core` solo como devDep solo-tipos |
| `packages/core` | Dominio de auth, sin deps runtime | ninguna |
| `packages/security` | Implementa ports de core (bcrypt, JWT, sha256, ids) | `core` |
| `packages/infrastructure` | Adaptadores Prisma Postgres + email | `core` |
| `packages/typescript-config` | Solo `base.json` activo; resto sin uso | — |
| `packages/eslint-config` | Consumir vía `./base` | — |

- Dirección de dependencias por estructura, no por tooling: `core` no tiene runtime
  deps, `security`/`infrastructure` dependen de `core`, solo `api-gateway` compone.
  Importar siempre por exports (`@repo/core/authentication`,
  `@repo/infrastructure/persistence/postgresSql`); un deep import
  `../../packages/*/src/...` rompe el boundary y tsc igual lo acepta.
  `turbo boundaries` **no** configurado — evaluado y descartado a propósito (cero
  deep imports hoy; ver D-029).
- Fuera de globs: `design-system/auth-app/MASTER.md` (documentación de diseño) y
  `tools/` (helper `gh.ps1`) no los toca Turbo.

## Contrato de auth (`@repo/core` manda)

- `apps/web/src/features/auth/types.ts` tiene cero declaraciones: todo es
  `export type` re-exportando el tipo de core que define la forma
  (`LoginInput`→`LoginInputDTO`, `Profile`→`ProfileOutput`,
  `SessionPayload`→`SessionDTO`, …). `@repo/core` es **devDependency** de `web`,
  nunca runtime: `verbatimModuleSyntax` los borra, nada llega al bundle.
  **Agregar un campo a un DTO es un cambio en core** (ver D-028).
- Cuando un DTO cambia, `core` cambia primero. Lo único todavía manual del lado web
  es la lista de **paths** en `apps/web/src/constants/routes.ts`, que espeja
  `ApiPrefix` + `PublicRoutes`/`PrivateRoutes` del gateway. Seis paths vienen de
  `PublicRoutes`; `ME` viene de **`PrivateRoutes`**.
- `SessionDTO` es deliberadamente **más angosto** que
  `LoginOutputDTO`/`RefreshOutputDTO`: el gateway responde `{ accessToken }`
  porque el refresh viaja en cookie HttpOnly. No "simplificarlo" a
  `Pick<LoginOutputDTO, "accessToken">` — codificaría la decisión de transporte
  como proyección del cliente.

## Trampas pagadas (leer antes de tocar lo suyo)

Cada una costó tiempo real; están pineadas por tests o por decisión registrada.

**Tests / Vitest**

- `noUncheckedIndexedAccess` activado: `const [first] = arr` no typecheckea. Usar
  `arr[0]` con acceso opcional en tests.
- `packages/core|security|infrastructure` no tienen `include` en tsconfig (tsc
  globea todo `.ts`) y excluyen `src/**/__tests__/**` del emit.
- `apps/web` usa `@testing-library/react` con `globals: false`: `src/test/setup.ts`
  registra `cleanup()` en `afterEach`. Su `tsconfig.app.json` incluye `src`, así
  que tsc type-checkea los tests web sin config separada.
- Un `__tests__` excluido del tsconfig **no puede importar nada de afuera** (en
  `api-gateway`, `src/core/__tests__/` no importa `src/constants/...`; falla con
  `Cannot find module '/constants/index.js'`). Helpers compartidos van en
  `src/__tests__/` de nivel superior (D-007).
- `api-gateway` setea su env de tests en `src/test/setupEnv.ts` (entry
  `setupFiles`), no por suite: `required()` corre **a import time**, antes que
  cualquier `beforeAll` o `vi.stubEnv`. Verificar paridad con CI moviendo
  `.env.local` a un lado, no confiando en un verde local.
- `vi.mock` resuelve desde el módulo bajo test, no desde el test (D-013). Un
  especificador distinto hace que el mock no aplique en silencio y la suite toque
  una DB real.
- Prisma `update`/`updateMany` toman **UN** objeto (`{ where, data, select }`), no
  `(where, data)` (D-014). Suites multi-caso necesitan `vi.clearAllMocks()` en
  `beforeEach`.
- Dos pérdidas de datos deliberadas en los mappers, pineadas por tests:
  `createdAt`/`updatedAt` se dropean (las entidades no tienen dónde guardarlas,
  Prisma las rellena al escribir) y roles duplicados colapsan (`Set<string>` vs
  `String[]`).

**Express / gateway**

- `statusForCode` usa `Object.hasOwn` a propósito: `STATUS_BY_CODE[code] ?? 500`
  resolvería keys heredadas (`constructor`, `toString`) a funciones.
- **Express reescribe `req.url` al despachar dentro de un router montado**:
  leer `req.path` en `res.on("finish")` da el path relativo (`/login`, no
  `/api/v1/auth/login`). `requestLogger` captura `method`/`path`/`ip` eagerly
  (D-016).
- `createRequestLogger` va **primero** en `app.ts`: después de `helmet`/rate
  limiter perdería los 429, después de las rutas perdería los 404. Loguea
  `req.path` (nunca `originalUrl`, nunca body, nunca `Authorization`; IP solo con
  `ACCESS_LOG_IPS=true`) (D-015).
- Montar docs handlers con `get("/path")`, nunca `use("/", handler)`: `use`
  matchea todo bajo el mount y shadowea siblings con HTML y 200.
- `swaggerUi.serve` sirve los assets; `setup()` renderiza **solo el HTML**. Sin
  `serve`, la página carga en blanco con todo en 200. `docs.spec.test.ts` aserta
  el `content-type` del CSS por eso.
- OpenAPI + Swagger UI en `GET /api/docs` (sibling de `/api/v1`).
  `DOCS_ENABLED` default ON en dev, **OFF en producción**; `OPENAPI_SERVER_URL`
  default `/` (D-020).
- **`@scarf/scarf` explícitamente NO aprobado** (`"@scarf/scarf": false`):
  postinstall que reporta a `scarf.sh`, transitivo vía `swagger-ui-dist`.
  Re-chequear `allowBuilds` con cada `pnpm add`.
- Knobs del gateway (`config/env/index.ts`, validados a boot): `TRUST_PROXY_HOPS`
  (default `0`), `REFRESH_COOKIE_SAME_SITE` (`lax`, D-003),
  `REFRESH_COOKIE_SECURE` (true en producción), `ACCESS_LOG_IPS` (`false`, GDPR).
- `RESEND_KEY`, `CLIENT_GOOGLE_ID`, `CLIENT_GOOGLE_SECRET` se **eliminaron**
  (leftovers del template, cero consumidores). No re-agregar sin el código que
  los use (D-017).

**Auth / dominio**

- `docs/decisions.md` es el decision log. Leerlo antes de cambiar comportamiento
  de auth (D-001..D-030).
- `Email` normaliza (`trim().toLowerCase()`) antes de validar + índice único
  funcional en `lower(email)`. Ambas capas en sync (D-001).
- Password reset (`forgot|reset`): `forgot` responde **byte-idéntico** para
  conocida/desconocida y el use case traga *todo* error del sender — si no,
  cualquier bug del adapter se vuelve oráculo de enumeración (D-024). El token va
  en el **fragment** de la URL (el browser nunca lo transmite). Vars opcionales a
  propósito (`RESEND_API_KEY`, `PASSWORD_RESET_URL`, `EMAIL_FROM`) con warning en
  producción si faltan (D-023).
- `apiClient` normaliza un `fetch` rechazado a `ApiError` (`NETWORK_ERROR`,
  status `0`); `AbortError` pasa intacto — cancelar no es un problema de conexión
  (D-019). Las páginas renderizan error solo con `instanceof ApiError`.
- En `apps/web` el header `Authorization` NO sale del store zustand: `apiClient`
  lo lee de un accessor que `Bootstrap` instala vía `configureApi`. `main.tsx`
  importa `RouterProvider` de `react-router/dom` mientras los componentes consumen
  el contexto de `react-router` — instancias distintas que rompen tests de routing.
- Cambiar roles es reemplazo total + revoca sesiones, `requireRole("admin")`
  **después** de `createAuthorize` (D-005). El anónimo recibe 401, nunca 403.
- Primer admin por script, no por ruta:
  `pnpm --filter @repo/infrastructure prisma:promote-admin -- <email>` (D-012).
- El "Remember for 30 days" del login es **texto estático, no checkbox**: la vida
  de la cookie la manda `REFRESH_COOKIE_MAX_AGE_MS` en el servidor. Hay un test
  que aserta su *ausencia* (D-018).

**Prisma / env**

- Dos `.env.local`, y la app usa el del paquete: `apps/api-gateway/.env.local`
  (Neon vía PgBouncer + `PORT=3001`) es la app; el raíz (Postgres 17.11 local) es
  para los integration tests de `infrastructure`. Editar el raíz no cambia dónde
  guarda la app.
- Migraciones en
  `packages/infrastructure/src/persistence/postgresSql/prisma/migrations/`
  (aplicadas en ambas DBs al 2026-09-29). El archivo debe llamarse exactamente
  `migration.sql` (si no, `P3015`). Los scripts `prisma:migrate:*` pasan
  `--config` solos (D-008, D-027). Para migrar Neon, exportar el `DATABASE_URL`
  del gateway. Aislamiento de tests por clave única (`randomUUID`), nunca
  `TRUNCATE`/`deleteMany` global (D-009).
- `@repo/infrastructure` genera el Prisma client en `postinstall` (CI no tiene
  paso manual). Corre solo en `install`, no en `build`: tras borrar `generated/`,
  un `pnpm install` común NO lo trae de vuelta — usar `pnpm install --force`.

**Convenciones de código**

- `moduleResolution: NodeNext` — imports relativos con extensión `.js`.
- `tsup.config.ts`: entry `src/**/index.ts`, solo `format: ["esm"]`,
  `sourcemap: true`. Cada subpath necesita su `index.ts`.
- `tsconfig.json` por lib: `rootDir ./src`, `outDir ./dist`. `dist/`, `.turbo/`,
  `node_modules/` son artefactos — nunca editar; rebuild vía `build:js`/`build:types`.
- Env: `turbo.json` `build.inputs` incluye `.env*`; `.env*` gitignored. Nunca
  commitear secretos. El gateway exige 6 secretos a boot (`required()` fail-fast);
  `dotenv` carga `.env.local` y después `.env`.
- Prettier sin config; `pnpm format` reescribe in place — correr solo sobre
  archivos tocados o esperar diff repo-wide.
- Codegraph primero: el repo tiene índice `.codegraph/`. CLI (`status`, `query`,
  `explore`, `callers`) antes de Read/Glob/Grep en preguntas estructurales;
  `sync <root>` tras editar. Un banner de staleness significa índice atrasado —
  verificar el archivo con Read.
- `Email` normaliza (`trim().toLowerCase()`) antes de validar, whitespace
  aceptado y trimmeado, casing nunca llega a storage. Índice único funcional en
  `lower(email)`; ambas capas en sync.

## Api-gateway (estilo del dueño — seguirlo)

- Fuente: template `JuanCardona16/api-rest-express-template` (Express 5, capas
  `config/core/features/infrastructure/lib/shared/constants`). `src/core/` = núcleo
  de app (bootstrap, errors, middleware, routes) — NO el dominio.
- Controladores finos: routes → `validateWithZod` → `asyncHandler` → controller →
  **use case de `@repo/core`**. Nada de portar servicios/repos al gateway; viven
  en packages. Nada de `new XRepository()` en controllers; todo en el composition
  root.
- Errores: el dominio lleva solo `code` — el gateway mapea `code → HTTP status`
  en `GlobalHandleError` (envelope `{success:false, error:{message,code,status,timestamp}}`).
- Patrón de rutas: enums `ApiPrefix` + `PublicRoutes` en `constants/`; JSDoc
  swagger en routes.
- Imports relativos con `.js` (NodeNext) — sin alias `@/`.
- Resuelto: refresh en **cookie HttpOnly**, `helmet` montado, rate limiter propio
  en login, OpenAPI spec **y** Swagger UI servidos.

## Git

- Rama `main`, commits convencionales en español, sin atribución a IA. Identidad
  repo-local.
- **El remoto se llama `main`, no `origin`.** `origin` no existe.
  `git fetch main`, `git push main <branch>`.
- Todo por PR — `main` protegida, pushes directos rechazados.
  `gh pr merge <n> --merge` (merge commit, sin squash/rebase).
- Auth remoto con `GITHUB_TOKEN` del entorno; **cada shell es un proceso fresco**:
  re-exportarlo en cada comando.
