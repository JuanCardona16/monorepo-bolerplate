# Web estilo gateway — tareas

> Objetivo: rearmar `apps/web` (scaffold Vite oficial) con las capas de la api-gateway, misma auth contra el gateway.
> Alcance autorizado (usuario, 2026-09-27): reimplementar la lógica con arquitectura espejo.
> Modo: inline sin subagentes. TDD deshabilitado. Verificación: `tsc -b`, `vite build`, smoke con proxy.
> Decisiones: capas `config/constants/core/features/infrastructure/shared` (core = núcleo app); se respeta el scaffold (TS 6.0.2, eslint flat, react compiler, scripts `tsc -b`) sin pelear con la herramienta; `tsup.config` no se repone (dormant antes, scaffold limpio ahora — sincerado); RHF nativo sin zod (sin duplicar resolvers); proxy `/api`→3001 + puerto 5173.

## Checklist

- [x] **R1** Deps (router 7.18.4, query 5.104.0, zustand 5.0.15, RHF 7.89.0) + `vite.config` (proxy/puerto) + limpieza defaults (App.*, assets).
- [x] **R2** Capas base: `config/env`, `constants/`, `core/errors|providers`, `infrastructure/http`, `shared/`.
- [x] **R3** `features/auth`: store, hooks, páginas, rutas.
- [x] **R4** Verificación: install + `tsc -b` + `vite build` + smoke. Commit por unidad.

## Progreso

- 2026-09-27: creado el documento (4 tareas). Scaffold verificado: react 19.2.8, vite 8.3, plugin-react 6.1.1, TS 6.0.2, eslint flat + react compiler.
- 2026-09-27: **R1–R4 cerradas**. Lecciones: scaffold exige imports SIN extensión (tsc `.ts` explícito falla igual que `.js` en Vite/rolldown — extensionless satisface a ambos); profundidades `../` escritas un nivel corto (lo reveló `--traceResolution`); enum prohibido por `erasableSyntaxOnly` → const object; `import type` por `verbatimModuleSyntax`. Bugs propios: sin `Bearer` (logout 401), navegación post-registro frágil. Smoke: vite 200 + login por proxy 200. Sin huérfanos.
