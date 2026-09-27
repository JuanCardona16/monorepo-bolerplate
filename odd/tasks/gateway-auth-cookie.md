# Gateway auth con cookies — tareas

> Objetivo: cablear auth en `apps/api-gateway` estilo template del usuario, refresh en cookie `HttpOnly` + access en body.
> Alcance autorizado (usuario, 2026-09-27): implementar siguiendo `JuanCardona16/api-rest-express-template`.
> Modo: inline sin subagentes. TDD deshabilitado (sin runner). Verificación: build + smoke HTTP.
> Decisiones: refresh en cookie `HttpOnly`/`Secure`/`SameSite=strict` (nombre `refresh_token`, path `/api/v1/auth`, 30d); access en body; envelope `{success,data}` del template; register devuelve 201 `{uuid}` sin auto-login; DI en composition root (nada de `new` en controllers); sin DB viva → smoke solo toca paths sin DB.

## Checklist

- [x] **G1** Deps: `zod`, `helmet`, `cookie-parser` (+types) y workspace `@repo/core|security|infrastructure`; `pnpm install` (commit `c3ea0f7`).
- [x] **G2** `infra`: factory `createAuthPrismaClient(url)` + re-export `PrismaClient`; rebuild infra (commit `c3ea0f7`).
- [x] **G3** `core/errors/`: `GlobalHandleError` + `asyncHandler` + `HttpError` + mapa `code→status`; `core/middleware/`: `validateWithZod`, `authorize`, limiters; `constants/routes.ts` (commit `c3ea0f7`).
- [x] **G4** `features/authentication/`: schemas zod, controllers finos (casos de uso), rutas + DI + montaje en `app.ts` (`helmet`, `cookieParser`, router, NotFound, `GlobalHandleError`) (commit `c3ea0f7`).
- [x] **G5** Verificación: build + smoke (400 validación, 401 sin cookie, 500 enmascarado con DB ausente, envelope+`code` probados, cookie pendiente de DB). Commit `c3ea0f7`.

## Progreso

- 2026-09-27: creado el documento (5 tareas).
- 2026-09-27: **G1–G5 cerradas** (`c3ea0f7`, 26 archivos, incluye cambios AGENTS.md pendientes). Build gateway 0. Smoke: register inválido→400 `VALIDATION_ERROR` con envelope; refresh sin cookie→401; login válido→500 enmascarado (sin DB); 404 con envelope. Desvíos propios corregidos: olvidé `IdGenerator` en el container (lo agarró `tsc`), import con ruta vieja, `idGenerator` duplicado. **Feature completa 5/5.** Pendiente con DB real: login→cookie `HttpOnly`, refresh→rotación, logout→204, migración SQL.
- 2026-09-27: **E2E con DB real** (`6ed68e2`). Migración `20260927174808_init_auth` aplicada (Neon Postgres en sync). Flujo completo: register→201, login→200+cookie `HttpOnly`, refresh→200 rotado, reuso del viejo→401, logout→204, post-logout→401. Ajustes: `prisma migrate` necesita `--config` explícito (no auto-descubre el nuestro); RESEND/GOOGLE a opcionales (se validan al usarse); secretos JWT generados en `.env.local` de la gateway (gitignored, valores nunca expuestos).
- 2026-09-27: **DI mejorado** (`0797b92`, 9 archivos). `createContainer(overrides?)`/`getContainer()`/`closeContainer()` (prisma perezoso, inyectable para tests); shutdown SIGTERM/SIGINT; `LogoutUseCase` en `core` (controller sin repos); `ACCESS_TOKEN_TTL`/`BCRYPT_ROUNDS` al env. E2E repetido en verde (201/200/200/401/204/401). Desvío: import corto en `LogoutUseCase` (lo agarró `tsc`).
