# Auth con refresh con estado — tareas

> Objetivo: completar la autenticación con refresh tokens con estado (rotación + persistencia, revocables).
> Problema: `RefreshTokenUseCase` vacío, sin modelo de refresh, sin adapter de persistencia.
> Alcance autorizado (usuario, 2026-09-27): paquetes con lógica de negocio + preparar api-gateway. Solo lectura/entendimiento en gateway por ahora.
> Modo: inline sin subagentes (decisión del usuario 2026-09-27 — delegación no disponible por bloqueo free tier; desvío registrado, no silencioso).
> TDD: deshabilitado — el árbol vigente no tiene runner (sin vitest, sin script `test`; verificado por glob + `package.json`). Verificación por tarea: `pnpm --filter <pkg> build` (`tsup` + `tsc`) y `codegraph explore` del área tocada.
> Delivery: git inicializado el 2026-09-27 (rama `main`, identidad local `JuanCardona`). Commit inicial `e37c737` (54 archivos, incluye T1). De acá en más rige 1 commit por unidad de trabajo. Estrategia: `ask-on-risk` (defecto).
> Decisiones: refresh **con estado** (rotación, detección de reuso con revocación en cascada); errores tipados en inglés (T2).

## Checklist

- [x] **T1** Modelar refresh con estado en `core` — entidad `RefreshToken`, puerto `RefreshTokenRepository`, puerto `RefreshTokenHasher`, DTOs, `RefreshTokenUseCase` funcional, `LoginUseCase` emite el par access+refresh. Ruta: inline (sin subagentes por decisión). Aceptación: `pnpm --filter @repo/core build` en verde (verificado 2026-09-27, exit 0).
- [ ] **T2** Errores de dominio tipados en inglés + migrar `Login/Register/Refresh` y VOs.
- [ ] **T3** Comportamiento en `AuthUser` (roles), VO de rol, `findByUuid`/`update` en repositorio.
- [ ] **T4** Puerto de UUID + DTO en Register + `implements` explícito en Bcrypt.
- [ ] **T5** Adapter Prisma de `AuthRepository` + `RefreshTokenRepository` + mappers en `infrastructure`.
- [ ] **T6** Decidir submódulos vacíos de infra (`mongodb/cache/external/messaging/shared/config`), bug `exports["./messaging"]`, superficies `index.ts`.

## Progreso

- 2026-09-27: creado el documento (6 tareas). Codegraph verificado: `status` (26 archivos/100 nodos, al día) + `explore` (blast radius + fuente textual). En curso: T1.
- 2026-09-27: **T1 cerrada**. 5 archivos nuevos + 4 editados. `tsup` y `tsc` en verde (exit 0). Codegraph `sync`: 9 archivos, 57 nodos; `explore` confirma el cableado (Login y Refresh usan ambos puertos). Decisiones T1: el refresh guarda snapshot de roles (evita `findByUuid` hasta T3); TTL 30d como constante (`REFRESH_TOKEN_TTL_MS`); reuso de token revocado → revocación en cascada; código nuevo en inglés (T2 migra lo viejo). Sin tests (sin runner) y sin commits (sin git).
