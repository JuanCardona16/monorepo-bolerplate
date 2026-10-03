# Trampas pagadas

Catálogo de trampas que ya costaron tiempo real en este repo. Cada una está
pineada por un test o por una decisión en Engram (`decisions/D-XXX`). Leer la
sección correspondiente **antes** de tocar lo suyo — repetir una es pagar dos
veces.

## Tests / Vitest

- `noUncheckedIndexedAccess` activado: `const [first] = arr` no typecheckea. Usar
  `arr[0]` con acceso opcional en tests.
- `packages/core|security|infrastructure` no tienen `include` en tsconfig (tsc
  globea todo `.ts`) y excluyen `src/**/__tests__/**` del emit.
- `apps/web` usa `@testing-library/react` con `globals: false`: `src/test/setup.ts`
  registra `cleanup()` en `afterEach`.
- Un `__tests__` excluido del tsconfig **no puede importar nada de afuera** (en
  `api-gateway`, `src/core/__tests__/` no importa `src/constants/...`; falla con
  `Cannot find module '/constants/index.js'`, con barra inicial). Helpers en
  `src/__tests__/` de nivel superior (D-007).
- `api-gateway` setea su env de tests en `src/test/setupEnv.ts` (entry
  `setupFiles`), no por suite: `required()` corre **a import time**, antes que
  cualquier `beforeAll` o `vi.stubEnv`. Verificar paridad con CI moviendo
  `.env.local` a un lado (D-021).
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

## Express / gateway

- `statusForCode` usa `Object.hasOwn`: `STATUS_BY_CODE[code] ?? 500` resolvería
  keys heredadas (`constructor`, `toString`) a funciones.
- **Express reescribe `req.url` al despachar dentro de un router montado**: leer
  `req.path` en `res.on("finish")` da el path relativo. `requestLogger` captura
  `method`/`path`/`ip` eagerly; solo la suite de integración lo detectó (D-016).
- `createRequestLogger` va **primero** en `app.ts`: después de `helmet`/rate
  limiter perdería los 429, después de las rutas los 404. Loguea `req.path`
  (nunca `originalUrl`, body ni `Authorization`; IP solo con `ACCESS_LOG_IPS=true`)
  (D-015).
- Docs handlers con `get("/path")`, nunca `use("/", handler)`: `use` matchea todo
  bajo el mount y shadowea siblings con HTML y 200 (D-010).
- `swaggerUi.serve` sirve los assets; `setup()` renderiza **solo el HTML**. Sin
  `serve`, pantalla en blanco con todo en 200. `docs.spec.test.ts` aserta el
  `content-type` del CSS por eso.
- **`@scarf/scarf` explícitamente NO aprobado** (`false` en `allowBuilds`):
  postinstall que reporta a `scarf.sh`, transitivo vía `swagger-ui-dist`.
  Re-chequear `allowBuilds` con cada `pnpm add` (D-020).
- `RESEND_KEY`, `CLIENT_GOOGLE_ID`, `CLIENT_GOOGLE_SECRET` **eliminados**
  (leftovers del template, cero consumidores). No re-agregar sin el código que los
  use (D-017).

## Auth / dominio

- `Email` normaliza (`trim().toLowerCase()`) antes de validar + índice único
  funcional en `lower(email)`. Ambas capas en sync o los inserts rompen (D-001).
- Password reset: `forgot` responde **byte-idéntico** para conocida/desconocida y
  el use case traga *todo* error del sender — si no, un bug del adapter se vuelve
  oráculo de enumeración (D-024). Token en el **fragment** de la URL (el browser
  nunca lo transmite). Vars opcionales con warning en producción si faltan (D-023).
- `apiClient` normaliza un `fetch` rechazado a `ApiError` (`NETWORK_ERROR`);
  `AbortError` pasa intacto — cancelar no es problema de conexión (D-019). Las
  páginas renderizan error solo con `instanceof ApiError`.
- En `web` el header `Authorization` NO sale del store zustand: sale del accessor
  que `Bootstrap` instala vía `configureApi`. `main.tsx` importa `RouterProvider`
  de `react-router/dom` mientras los componentes consumen `react-router` —
  instancias distintas que rompen tests de routing.
- Cambiar roles es reemplazo total + revoca sesiones, `requireRole("admin")`
  **después** de `createAuthorize`; el anónimo recibe 401, nunca 403 (D-005, D-006).
- Primer admin por script, no por ruta:
  `pnpm --filter @repo/infrastructure prisma:promote-admin -- <email>` (D-012).
- El "Remember for 30 days" del login es **texto estático, no checkbox**: la vida
  de la cookie la manda el servidor. Un test aserta su *ausencia* (D-018).

## Prisma / env

- Dos `.env.local`, y la app usa el del paquete: `apps/api-gateway/.env.local`
  (Neon) es la app; el raíz (Postgres local) es para los integration tests.
  Editar el raíz no cambia dónde guarda la app (D-009).
- Migraciones en `packages/infrastructure/src/persistence/postgresSql/prisma/migrations/`.
  El archivo debe llamarse exactamente `migration.sql` (si no, `P3015`). Los
  scripts `prisma:migrate:*` pasan `--config` solos (D-008, D-027). Para migrar
  Neon, exportar el `DATABASE_URL` del gateway.
- Aislamiento de tests por clave única (`randomUUID`), nunca `TRUNCATE`/`deleteMany`
  global (D-009).
- `@repo/infrastructure` genera el Prisma client en `postinstall` (solo en
  `install`, no en `build`): tras borrar `generated/`, un `pnpm install` común NO
  lo trae de vuelta — usar `pnpm install --force`.

## Tooling / repo

- `pnpm install` en local no prueba nada sobre CI: con `node_modules` poblado,
  pnpm nunca re-evalúa postinstalls. Para ejercitar build scripts: `pnpm rebuild`.
- `onlyBuiltDependencies` se eliminó en pnpm v11 y el campo `pnpm` en
  `package.json` ya no se lee. Settings de pnpm 12 viven en `pnpm-workspace.yaml`.
- `turbo boundaries` evaluado y descartado: cero deep imports hoy; configurar
  enforcement para una violación inexistente es superficie sin retorno (D-029).
- Tres use cases tienen tipos que **no** están en `application/dtos/` sino junto a
  su caso de uso — buscar solo en `dtos/` lleva a duplicarlos (D-028).
- `ME` viene de `PrivateRoutes`, no de `PublicRoutes`: grepear un solo enum no
  encuentra nada.
