# Auth — Tareas pendientes

> Revisado el 2026-10-03 contra el árbol vigente (`main` @ `5b2fa54`).
> La parte HTTP vive en `apps/api-gateway`; los paquetes solo contienen lógica de negocio.
> Decisiones registradas con su motivo en Engram (proyecto `monorepo-bolerplate`, topics `decisions/D-XXX`).
>
> Este archivo se actualiza **junto al código**, no después. Que el próximo lector
> tenga que cruzarlo con `AGENTS.md` para saber qué quedó vivo es exactamente el
> defecto que ya se pagó una vez.

## Estado

La feature de autenticación está operativa de punta a punta: registro, login,
refresh con rotación y revocación, logout, perfil, gestión de roles, **reset de
contraseña**, spec OpenAPI con Swagger UI, y las dos bases (Neon, que usa la app, y
Postgres local, que usan los tests de integración) migradas y verificadas.

**646 tests**, verdes en los tres checks requeridos de `main`, y **cero skipped en
CI**: el job `test` levanta un `postgres:17-alpine` como service container, así que
los 35 tests de integración de `@repo/infrastructure` se ejecutan de verdad y no
pueden volver a reportarse como skipped sin romper el build (D-026).

## Paquetes (lógica de negocio) — completo

- [x] Refresh con estado en `packages/core`: entidad/VO, métodos en `AuthRepository` y DTOs.
- [x] Errores de dominio tipados, con `code` para que la gateway mapee a HTTP.
- [x] `findByUuid` / `update` en `AuthRepository` (los consume `ChangeUserRolesUseCase`).
- [x] Generación de UUID inyectada como puerto en `RegisterUserUseCase`.
- [x] Adapters Prisma + mappers en `packages/infrastructure`.
- [x] `ChangeUserRolesUseCase`: reemplazo total del conjunto de roles + revocación
      de las sesiones del objetivo. Replace y no merge a propósito (D-005).
- [x] Migraciones de Prisma aplicadas y verificadas en **ambas** bases.
- [x] **Reset de contraseña**: `PasswordResetToken`, `RequestPasswordResetUseCase`,
      `ConfirmPasswordResetUseCase`, puertos `PasswordResetTokenRepository` y
      `EmailSender`, repositorio Prisma y adaptador de email (D-023, D-024, D-025).

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
- [x] **Rutas de reset**: `POST /api/v1/auth/password/forgot|reset`, con rate limit
      dedicado en cada una. `forgot` responde byte-idéntico exista o no la cuenta, y
      el `catch` del sender no filtra por tipo: re-lanzar un error inesperado
      respondería 500 para una cuenta real y 200 para una desconocida (D-024).

## Web — completo

- [x] `ForgotPasswordPage` y `ResetPasswordPage`, con `useForgotPassword` /
      `useResetPassword`. El token se lee del **fragment** de la URL
      (`#token=`), que los browsers nunca transmiten: no llega al access log, ni al
      log de un proxy, ni al `Referer` de la página siguiente.

## Pendiente real

### Requiere autorización del usuario

- [ ] **Migración `20260930093000_password_reset_tokens` en Neon.** Está aplicada en
      la base local de tests; **no** se tocó la base que usa la app, por criterio.
      Sin esto, el reset de contraseña funciona en local y responde `P2021` en
      producción.
- [ ] **Variables de email en el entorno real**: `RESEND_API_KEY`, `EMAIL_FROM` y
      `PASSWORD_RESET_URL`. Son opcionales a propósito —un `required()` impediría
      que arranque el login porque a alguien se le olvidó una contraseña— pero
      `PASSWORD_RESET_URL` cae a `http://localhost:5173/reset-password`, así que un
      despliegue que la olvide entrega emails **válidos** con links muertos. El
      módulo de config avisa por consola en producción (D-023).
- [ ] **Login con Google.** La UI ya no lo ofrece. Requiere un proyecto de Google
      Cloud del usuario. `CLIENT_GOOGLE_ID` y `CLIENT_GOOGLE_SECRET` se eliminaron
      por estar declaradas, ausentes de todo `.env.local` y sin un consumidor
      (D-017); re-agregar cuando la feature exista.
- [ ] **Caché remoto de Turbo** (requiere token).
- [ ] **Rotar el token de GitHub** que se usó durante el desarrollo.

### Decisiones de producto, no técnicas

- [ ] **"Recordarme" real.** La web ya no ofrece el control: la duración la
      decide el servidor (`REFRESH_COOKIE_MAX_AGE_MS`) y el cliente no puede
      cambiarla (D-018). Si se quiere de verdad, el cliente tiene que decirle a la
      API cuánto debe vivir la cookie de refresh, y eso es una postura de
      seguridad de sesión, no un detalle de UI.

### Deuda técnica

- [ ] **`pnpm lint` está roto en todo el repo, y no por el código.** Falla con
      `Error: typescript-eslint does not support TS 7.0.` — un portón de versión
      dentro del parser. **Ningún check de CI está rojo**: `ci.yml` define
      exactamente tres jobs (`build`, `check-types`, `test`) y `lint` no es uno de
      ellos. Los gates confiables hoy son esos tres.
      Salidas, ninguna trivial: esperar a que `typescript-eslint` soporte TS >= 7.1
      (issue typescript-eslint#10940), o apuntar el parser a la API de TS 6 en
      modo side-by-side. **No intentar resolverlo subiendo la versión**: el peer
      declarado es `typescript: ">=4.8.4 <6.1.0"` y el repo está en 7.0.2.
      Ver *Por qué no hay lint en CI* abajo.
- [ ] **Lint solo cubre `apps/web`.** Los cuatro paquetes de backend
      (`@repo/core`, `@repo/security`, `@repo/infrastructure`, `api-gateway`) no
      definen script `lint`, y `@repo/eslint-config` no lo consume nadie. Agregar
      el job tal cual sería un verde que miente: 1 de 5 paquetes.
- [ ] **Caché de Turbo sin `outputs` para `apps/web`** (`turbo.json` conserva
      `.next/**` de la plantilla original, que este repo no usa).
- [ ] **`prisma.config.ts` es un caso latente de la misma clase que D-021**: corre
      `dotenv.config()` al importarse y pasa `process.env.DATABASE_URL` sin
      validar. Hoy ningún test lo importa, así que no falla, pero el día que uno lo
      haga va a tener exactamente el modo de fallo del env en tiempo de import.

### Por qué no hay lint en CI

Se intentó (2026-10-01 y 2026-10-03) y se documenta el resultado porque el nombre
`pnpm lint` sugiere cobertura del repo y no la tiene.

**El hallazgo de fondo**: el workspace usa **un solo TypeScript, 7.0.2** — root,
las tres bibliotecas y `apps/web`. `typescript-eslint` (incluida su última
versión) declara soporte hasta `<6.1.0` y **se niega a arrancar** con TS 7.

Lo que se llegó a probar y descartó:

1. **Un config compartido con el parser de TS + reglas de JS puro.** Descartado:
   `@typescript-eslint/parser@8.69.0` **también** rechaza TS 7. El parser es
   justamente la capa que no soporta la versión. El error lo dice:
   *"Please see ... to run typescript-eslint using the TS 6 API"*.
2. **Usar el TS 6 que tenía `apps/web`.** Descartado: `apps/web` ya declaraba
   `typescript: 7.0.2` al momento de intentarlo, no `~6.0.2`. Esa versión del
   `package.json` era la que mentía, y por eso el parser fallaba igual.
3. **Subir `typescript-eslint` a la última.** No alcanza: el peer declarado sigue
   siendo `<6.1.0`.

Lo que sí funciona hoy: `pnpm build`, `pnpm check-types` y `pnpm test`. Un verde
de esos tres es la señal real; un verde de `pnpm lint` no significa nada.

## Historial de trampas pagadas

Tres de estas trampas se pagaron más de una vez, y cada una está registrada con su
causa raíz en Engram (topics `decisions/D-XXX`) y en `AGENTS.md`:

- **D-007** — un `__tests__` anidado no puede importar nada de afuera de sí mismo.
- **D-013** — `vi.mock` necesita el mismo especificador que el módulo bajo prueba;
  si no coincide, el mock no se aplica en silencio y la suite se conecta a una base real.
- **D-021** — `config/env/index.ts` corre `required()` al importarse, antes de
  cualquier `beforeAll`. Pasó tres veces hasta que se resolvió con un `setupFiles`
  en vez de con otra nota.
- **D-022 / D-026** — nada ejercitaba el camino: los 35 tests de integración no
  corrían nunca, y `prisma:migrate:*` estaba roto sin que nadie lo notara.
