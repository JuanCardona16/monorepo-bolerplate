# Auth — Tareas pendientes

> Estado: revisión del 2026-09-27 sobre el árbol vigente. La parte HTTP vivirá en `apps/api-gateway`; los paquetes solo contienen lógica de negocio.
> Decisión registrada: **refresh tokens con estado** (rotación + persistencia, revocables).

## Paquetes (lógica de negocio)

- [ ] Modelar el refresh con estado en `packages/core`: entidad/VO de refresh token, métodos en `AuthRepository` (guardar, buscar, revocar/rotar) y DTOs de refresh. Hoy `RefreshTokenUseCase.ts` está vacío aunque el barrel lo exporta.
- [ ] Incluir el refresh en `LoginOutputDTO` (hoy solo trae `accessToken`) y crear los DTOs de register/refresh.
- [ ] Reemplazar los `Error` genéricos por errores de dominio tipados (`InvalidCredentials`, `UserAlreadyExists`, etc.) para que la gateway pueda mapear a 401/409/400. Mensajes y artefactos en inglés.
- [ ] Darle comportamiento a `AuthUser` (`assignRole`, cambio de hash) y tipar los roles (hoy strings sueltos con `"user"` hardcodeado en `RegisterUserUseCase`).
- [ ] Agregar `findByUuid`/`update` a `AuthRepository` (gestión de usuarios y revocación de sesiones).
- [ ] Inyectar la generación de UUID como puerto en `RegisterUserUseCase` (hoy usa `crypto.randomUUID()` directo).
- [ ] Unificar `RegisterUserUseCase` a DTO como `LoginUseCase` (hoy recibe strings sueltos).
- [ ] Declarar `implements PasswordHasher` en `BcryptPasswordHasher` (como ya hace `JwtTokenProvider` con `TokenProvider`).
- [ ] Implementar el adapter Prisma de `AuthRepository` + mappers dominio↔Prisma en `packages/infrastructure` (hoy `repositories/` y `mappers/` están vacíos y sin esto nada corre end-to-end).
- [ ] Decidir `mongodb/`, `cache/`, `external/`, `messaging/`, `shared/` y `config/` de infrastructure: implementar o eliminar. El `exports["./messaging"]` apunta a `dist/external` (bug).
- [ ] Definir la superficie pública de `core/src/index.ts` e `infrastructure/src/index.ts` (hoy vacíos).

## Api-gateway (cuando se encare)

- [ ] Rutas `POST /auth/register|login|refresh` (+ logout con revocación).
- [ ] Validación de protocolo en el borde, middleware Bearer con `TokenProvider.verify`, mapeo de errores tipados a HTTP.
- [ ] Raíz de composición DI (adapter Prisma + Bcrypt + JWT con secrets desde env), rate limit en login, logs sin PII.
