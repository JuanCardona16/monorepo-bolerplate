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

**553 tests**, verdes en los tres checks requeridos de `main`.

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
- [x] Spec OpenAPI en `GET /api/docs/openapi.json` y **Swagger UI** en
      `GET /api/docs/`, montados como hermanos de `/api/v1`. Apagados por default
      en producción vía `DOCS_ENABLED` (D-020).
- [x] Access log: una línea por request (método, ruta, status, duración), sin body,
      sin `Authorization`, sin query string, y con la IP solo bajo
      `ACCESS_LOG_IPS=true` (D-015, D-016).
- [x] Feedback ante fallo de red: `apiClient` normaliza un `fetch` rechazado en un
      `ApiError`, así que login y register le dicen al usuario qué pasó en vez de
      no renderizar nada (D-019).

## Pendiente real

### Requiere autorización del usuario

- [ ] **Reset de contraseña** y **login con Google**. La UI los muestra
      deshabilitados con `title="Coming soon"`, que es honesto: no hay backend.
      `RESEND_KEY`, `CLIENT_GOOGLE_ID` y `CLIENT_GOOGLE_SECRET` se eliminaron por
      estar declarados, ausentes de todo `.env.local` y sin un solo consumidor
      (D-017). Re-agregar cuando las features existan.
- [ ] **Caché remoto de Turbo** (requiere token).

### Decisiones de producto, no técnicas

- [ ] **"Recordarme" real.** La web ya no ofrece el control: la duración la
      decide el servidor (`REFRESH_COOKIE_MAX_AGE_MS`) y el cliente no puede
      cambiarla (D-018). Si se quiere de verdad, el cliente tiene que decirle a
      la API cuánto debe vivir la cookie de refresh, y eso es una postura de
      seguridad de sesión, no un detalle de UI.

### Deuda técnica

- [ ] **`pnpm lint` fuera de CI**, deliberadamente, hasta que la base de lint
      esté limpia.
- [ ] **Caché de Turbo sin `outputs` para `apps/web`** (`turbo.json` conserva
      `.next/**` de la plantilla original, que este repo no usa).
