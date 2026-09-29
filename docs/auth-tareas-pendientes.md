# Auth — Tareas pendientes

> Revisado el 2026-09-29 contra el árbol vigente (`main` @ `264940a`).
> La parte HTTP vive en `apps/api-gateway`; los paquetes solo contienen lógica de negocio.
> Decisión registrada: **refresh tokens con estado** (rotación + persistencia, revocables).
>
> Este archivo estaba desactualizado: listaba como pendientes adapters Prisma, errores
> tipados y DI que ya existen. Cada ítem de abajo se verificó contra el código.

## Paquetes (lógica de negocio)

- [x] Refresh con estado en `packages/core`: entidad/VO, métodos en `AuthRepository` y DTOs.
- [x] Refresh incluido en `LoginOutputDTO` + DTOs de register/refresh.
- [x] Errores de dominio tipados (`InvalidCredentialsError`, `UserAlreadyExistsError`, `WeakPasswordError`, `InvalidRefreshTokenError`, `InvalidEmailError`, `InvalidRoleError`), con `code` para que la gateway mapee a HTTP.
- [x] Comportamiento en `AuthUser` (`assignRole`, cambio de hash) y roles tipados.
- [x] `findByUuid` / `update` en `AuthRepository`.
- [x] Generación de UUID inyectada como puerto en `RegisterUserUseCase`.
- [x] `RegisterUserUseCase` unificado a DTO, igual que `LoginUseCase`.
- [x] `implements PasswordHasher` en `BcryptPasswordHasher` (los cuatro adapters de `security` lo declaran: `BcryptPasswordHasher`, `JwtTokenProvider`, `Sha256RefreshTokenHasher`, `CryptoIdGenerator`).
- [x] Adapters Prisma + mappers en `packages/infrastructure`: `repositories/PrismaAuthRepository.ts`, `repositories/PrismaRefreshTokenRepository.ts`, `mappers/AuthUserMapper.ts`, `mappers/RefreshTokenMapper.ts`.
- [x] Superficie pública definida: `core` exporta `.` y `./authentication`; `infrastructure` exporta `.` y `./persistence/postgresSql`. El bug de `exports["./messaging"]` que apuntaba a `dist/external` ya no existe.
- [x] Cobertura de tests del dominio de auth: 87 tests en `packages/core/src/authentication/domain/__tests__/`, verdes en CI.

### Pendiente real en paquetes

- [ ] **Migraciones de Prisma.** El schema existe y el cliente genera, pero no hay SQL de migración aplicado. Sin base de datos no hay forma de correr esto end-to-end.

## Api-gateway

- [x] Rutas `POST /auth/register|login|refresh` + logout con revocación.
- [x] Validación de borde, middleware Bearer con `TokenProvider.verify`, mapeo de errores tipados a HTTP en `GlobalHandleError`.
- [x] Raíz de composición DI (`core/di/container.ts`) con adapter Prisma + Bcrypt + JWT leyendo secrets del env.
- [x] `GET /me` autorizado con `GetProfileUseCase`.

### Pendiente real en gateway

- [ ] **`assign` / `update` de usuarios.** Requieren RBAC de admin. No se construyeron a propósito; falta la decisión de permisos.
- [ ] Rate limit en login. Sigue abierto.
- [ ] Logs sin PII. Sigue abierto.
- [ ] Refresh token: el DTO lo devuelve en el body. El template del usuario usa cookies HttpOnly. La decisión de transporte quedó sin tomar.
- [ ] Setup de Swagger, `helmet`.

## Deuda técnica conocida

- [ ] `apps/web` y `apps/api-gateway` corren con `--passWithNoTests`: reportan verde con cero tests. Quitar la flag cuando aterrice el primer test real de cada app.
- [ ] El job de CI `check-types` solo ejecuta 1 task (solo `apps/web` define ese script). Agregar `check-types` a las tres librerías para que el nombre refleje el alcance real.
- [ ] `pnpm lint` en CI: deliberadamente fuera de alcance hasta que la base de lint esté limpia.
- [ ] Caché remoto de Turbo sin configurar (requiere token).
- [ ] `docs/` y `AGENTS.md` se actualizan junto al código, no después. Este archivo es la prueba de que eso no estaba pasando.
