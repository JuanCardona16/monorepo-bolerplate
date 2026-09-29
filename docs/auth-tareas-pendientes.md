# Auth — Tareas pendientes

> Revisado el 2026-09-29 contra el árbol vigente (`main` @ `948ae8f`).
> La parte HTTP vive en `apps/api-gateway`; los paquetes solo contienen lógica de negocio.
> Decisiones registradas con su motivo en [`decisions.md`](./decisions.md).
>
> Este archivo se actualiza **junto al código**, no después. Que el próximo lector
> tenga que cruzarlo con `AGENTS.md` para saber qué quedó vivo es exactamente el
> defecto que ya se pagó una vez.

## Estado

La feature de autenticación está operativa de punta a punta: registro, login,
refresh con rotación y revocación, logout, perfil, gestión de roles, spec
OpenAPI, y las dos bases (Neon, que usa la app, y Postgres local, que usan los
tests de integración) migradas y verificadas.

**535 tests**, verdes en los tres checks requeridos de `main`.

## Paquetes (lógica de negocio) — completo

- [x] Refresh con estado en `packages/core`: entidad/VO, métodos en `AuthRepository` y DTOs.
- [x] Errores de dominio tipados, con `code` para que la gateway mapee a HTTP.
- [x] `findByUuid` / `update` en `AuthRepository` (los consume `ChangeUserRolesUseCase`).
- [x] Generación de UUID inyectada como puerto en `RegisterUserUseCase`.
- [x] Adapters Prisma + mappers en `packages/infrastructure`.
- [x] `ChangeUserRolesUseCase`: reemplazo total del conjunto de roles + revocación
      de las sesiones del objetivo. Replace y no merge a propósito (D-005).
- [x] Migraciones de Prisma aplicadas y verificadas en **ambas** bases.

## Api-gateway — completo

- [x] Rutas `POST /auth/register|login|refresh|logout`, `GET /auth/me`.
- [x] Validación de borde, middleware Bearer, mapeo de errores a HTTP en `GlobalHandleError`.
- [x] Raíz de composición DI (`core/di/container.ts`).
- [x] Rate limit global y rate limit dedicado de login.
- [x] `helmet`.
- [x] RBAC: `PUT /api/v1/auth/users/:uuid/roles` con `requireRole("admin")` (D-005, D-006).
- [x] Configuración de deploy: `TRUST_PROXY_HOPS`, `REFRESH_COOKIE_SAME_SITE`,
      `REFRESH_COOKIE_SECURE` (D-003, D-004).
- [x] Bootstrap del primer admin: `pnpm --filter @repo/infrastructure prisma:promote-admin -- <email>` (D-012).
- [x] Spec OpenAPI en `GET /api/docs/openapi.json`, montado como hermano de `/api/v1`.
- [x] Access log: una línea por request (método, ruta, status, duración), sin body,
      sin `Authorization`, sin query string, y con la IP solo bajo
      `ACCESS_LOG_IPS=true` (D-015, D-016).

## Pendiente real

### Requiere autorización del usuario

- [ ] **Swagger UI.** El spec ya existe y se sirve. Renderizarlo necesita
      `swagger-ui-express`, que no es dependencia: no se agregó sin autorización.
      Cuando se autorice, alcanza con montar la UI en `core/docs/docs.route.ts` y
      cambiar `ui.enabled` a `true`. El discovery de `GET /api/docs` ya lo dice.
- [ ] **Reset de contraseña** y **login con Google**. La UI los muestra
      deshabilitados con `title="Coming soon"`, que es honesto: no hay backend.
      `RESEND_KEY`, `CLIENT_GOOGLE_ID` y `CLIENT_GOOGLE_SECRET` están declarados
      en `config/env/index.ts` y **no los usa nadie**. O se implementan o se
      borran; dejarlos es ruido que promete una capacidad que no existe.
- [ ] **Caché remoto de Turbo** (requiere token).

### Decisiones de producto, no técnicas

- [ ] **Cookies de sesión anónimas / consent de tracking.** La web tiene un
      checkbox "Remember for 30 days" que hoy no controla nada: el `maxAge` de la
      cookie de refresh es una constante del servidor. O se conecta a la decisión
      o se saca de la UI, porque un control que no hace nada es peor que no
      tenerlo.

### Deuda técnica

- [ ] **`pnpm lint` fuera de CI**, deliberadamente, hasta que la base de lint
      esté limpia.
- [ ] **Caché de Turbo sin `outputs` para `apps/web`** (`turbo.json` conserva
      `.next/**` de la plantilla original, que este repo no usa).
