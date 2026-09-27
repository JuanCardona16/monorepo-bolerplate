# Gateway auth con cookies — tareas

> Objetivo: cablear auth en `apps/api-gateway` estilo template del usuario, refresh en cookie `HttpOnly` + access en body.
> Alcance autorizado (usuario, 2026-09-27): implementar siguiendo `JuanCardona16/api-rest-express-template`.
> Modo: inline sin subagentes. TDD deshabilitado (sin runner). Verificación: build + smoke HTTP.
> Decisiones: refresh en cookie `HttpOnly`/`Secure`/`SameSite=strict` (nombre `refresh_token`, path `/api/v1/auth`, 30d); access en body; envelope `{success,data}` del template; register devuelve 201 `{uuid}` sin auto-login; DI en composition root (nada de `new` en controllers); sin DB viva → smoke solo toca paths sin DB.

## Checklist

- [ ] **G1** Deps: `zod`, `helmet`, `cookie-parser` (+types) y workspace `@repo/core|security|infrastructure`; `pnpm install`.
- [ ] **G2** `infra`: factory `createAuthPrismaClient(url)` + re-export `PrismaClient`; rebuild infra.
- [ ] **G3** `core/errors/`: `GlobalHandleError` + `asyncHandler` + `HttpError` + mapa `code→status`; `core/middleware/`: `validateWithZod`, `authorize`, limiters; `constants/routes.ts`.
- [ ] **G4** `features/authentication/`: schemas zod, controllers finos (casos de uso), rutas + DI + montaje en `app.ts` (`helmet`, `cookieParser`, router, NotFound, `GlobalHandleError`).
- [ ] **G5** Verificación: build + smoke (400 validación, 401 sin cookie, cookie `HttpOnly` en login requiere DB — documentar). Commit por unidad.

## Progreso

- 2026-09-27: creado el documento (5 tareas).
