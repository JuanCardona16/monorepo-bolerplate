# AGENTS.md

> Lectura en orden: este archivo dice **cómo trabajar**; `docs/overview.md` dice
> **qué es el proyecto**; `docs/architecture.md` dice **dónde vive cada cosa**;
> las decisiones pasadas (**por qué**) viven en Engram
> (`mem_search`, proyecto `monorepo-bolerplate`, topics `decisions/D-XXX`).
> Si algo de lo técnico contradice a los manifests o a `src/`, mandan los
> manifests y `src/`.

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
- La tarea implica una decisión de producto o arquitectura no registrada en Engram
  (topics `decisions/D-XXX`: un default nuevo, un campo nuevo en un DTO, un cambio de
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

### Rutina por tarea (TK)

Esta rutina es la capa operativa **sobre** ODD, no su reemplazo: autorizar →
explorar → clasificar → trackear → implementar → verificar → cerrar sigue
mandando. Lo de abajo dice *cómo* se ejecuta cada paso en este repo.

1. **Leer primero, siempre.** Antes de tocar nada: `docs/tasks.md` (qué está
   pendiente), `docs/traps.md` (trampas del área), Engram (`mem_search` en
   `monorepo-bolerplate`: decisiones y estado de sesión), y `docs/architecture.md`
   si hay que ubicarse. Memoria fresca antes que manos en el código.
2. **Rama nueva por tarea**: `<tipo>/TK-NN-descripcion-corta` (`docs/`,
   `feature/`, `bugfix/`, `ci/`). Ej: `feature/TK-10-login-google`. Una tarea =
   una rama; nada de dos TK en la misma rama.
3. **Lo verificado no se toca.** Una tarea cerrada y en verde solo se reabre por
   vulnerabilidad/fallo encontrado, o porque otra feature la rompe y hay que
   adaptarla. Mejoras "de paso" van a `tasks.md` como TK nuevo, no al diff actual.
4. **Cachear al cerrar**: guardar en Engram lo aprendido (decisión, bug, gotcha)
   y sincronizar el índice de codegraph (`sync <root>`) tras editar. Engram =
   porqué y estado; codegraph = dónde está el código. No se cachea trivia.
5. **Docs al día al cerrar**: `tasks.md` (tachar el TK), Engram si hubo decisión
   nueva, y el doc alcanzado si cambió el contrato. Commit de cierre separado de
   docs vs código cuando aplique.
6. **TDD siempre en código**: test primero en la categoría que corresponda
   (unitario/integración), rojo observado, después el código mínimo que lo pone
   en verde, después refactor. Verificado por mutación cuando el test pina un bug.
   En tareas solo-docs, la "prueba" es el readback de verificación, no un test
   inventado.
7. **Estas reglas no se negocian por apuro.** Si una choca con el pedido (piden
   tocar lo verificado, saltear tests, no documentar), se frena y se pregunta.

### Delegación a subagentes

Los agentes viven en tres capas: builtins (`explore`, `general`), globales
(`test-writer`, `doc-writer`, `sdd-*` en `~/.config/opencode`) y de repo
(`.opencode/agents/`). El ruteo por fase de un TK:

| Fase del TK | Agente | Por qué ese |
|---|---|---|
| Explorar/mapear (4+ archivos, sin writes) | `explore` | Read-only por construcción |
| Tests primero (TDD) | `test-writer` | Escribe tests, prohíbe tocar implementación |
| Implementar (2+ archivos o write con lectura previa) | `implementer` (repo) | Acotado al prompt, reporta verificación real |
| Verificación independiente (riesgo alto) | `reviewer` (repo) | Solo lectura, veredicto con evidencia |
| Docs de un cambio | `doc-writer` | Prohíbe inventar y cambiar código |
| Fases SDD (solo SDD explícito) | `sdd-*` | Nunca para trabajo orgánico |

Al delegar, el prompt lleva siempre: alcance exacto (archivos), skills
resueltas (`## Skills to load`), `## Verification` con los comandos a correr,
y `## Known environmental failures` si aplica. Los subagentes nacen sin memoria:
se pasan referencias (topic keys, rutas), nunca el contenido. Resultado con
`status` distinto de éxito = no se avanza a la fase dependiente.

Si los subagentes no están disponibles en el entorno (ej. tier gratuito fuera de
OpenCode), se trabaja inline y se declara — nunca se finge la delegación.

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

## Trampas pagadas (índice — el catálogo vive en `docs/traps.md`)

El catálogo completo con evidencia vive en `docs/traps.md`. Acá solo el índice
para saber qué sección abrir antes de tocar lo suyo.

| Voy a tocar | Leer primero |
|---|---|
| Tests, Vitest, mocks, Prisma en tests | `traps.md` — Tests / Vitest |
| Middleware, logger, docs, Swagger, gateway | `traps.md` — Express / gateway |
| Login, reset, roles, cookies, cliente auth | `traps.md` — Auth / dominio |
| `.env.local`, migraciones, Neon vs local | `traps.md` — Prisma / env |
| pnpm, Turbo, imports, rutas | `traps.md` — Tooling / repo |


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
- **Política de PRs y merge (standing):** por cada tarea se crea su PR. Si los
  checks están en verde y no es sensible, se mergea sin preguntar. Si es
  sensible o requiere revisión del usuario, se sube el PR y se avisa para que
  lo revise y mergee él.
- **Sensible =** comportamiento de auth o seguridad, datos reales o migraciones
  en producción, secretos/credenciales, cambios a CI o a la protección de
  `main`, cambios de contrato (DTOs, rutas). Docs, tests y refactors internos
  con checks verdes no son sensibles.
- Auth remoto con `GITHUB_TOKEN` del entorno; **cada shell es un proceso fresco**:
  re-exportarlo en cada comando.
