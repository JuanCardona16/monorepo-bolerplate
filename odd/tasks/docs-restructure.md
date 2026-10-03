# Docs restructure — AGENTS.md + docs/ + README.md

## Objetivo
Reorganizar la documentación: AGENTS.md como reglas de comportamiento del agente,
docs/ como documentación viva del proyecto (overview, architecture), y README.md
como vista pública. Cerrar la queja "estamos trabajando mal": el agente se desvía
porque AGENTS.md mezcla referencia técnica con reglas de conducta sin jerarquía.

## Problema
- AGENTS.md (133 líneas) mezcla setup, comandos, verificación, layout, convenciones
  y estilo del gateway sin orden de lectura ni reglas de comportamiento explícitas.
- README.md es el starter de Turborepo (habla de `web` Next.js y `@repo/ui` que no
  existen). Falso en público.
- docs/ tiene decisions.md (D-001..D-030) y auth-tareas-pendientes.md, pero falta
  overview (qué es el proyecto) y architecture (cómo navegarlo, responsabilidades,
  diagrama).

## Alcance autorizado
- Reescribir AGENTS.md (reorganizar + reglas de comportamiento).
- Crear docs/overview.md y docs/architecture.md.
- Reescribir README.md público.
- NO tocar código, configs, ni decisions.md / auth-tareas-pendientes.md
  (se referencian, no se reescriben).

## Checklist
- [x] T1: AGENTS.md reorganizado con reglas de comportamiento (usuario: autonomía vs pregunta)
- [x] T2: docs/overview.md — qué es, stack, dependencias, cómo correrlo
- [x] T3: docs/architecture.md — responsabilidades por carpeta, navegación, diagrama
- [x] T4: README.md público reescrito
- [x] T5: Verificación — toda afirmación cruzada contra manifests/src (cero invento)
- [x] T6: docs/traps.md — catálogo de trampas por área; AGENTS.md adelgazado a índice
- [x] T7: decisiones D-001..D-030 migradas a Engram (proyecto `monorepo-bolerplate`,
  topics `decisions/D-XXX`, obs #329..#357); archivo decisions.md eliminado;
  referencias actualizadas en AGENTS/overview/architecture/traps/README/auth-tareas.
  Nota: `.engram/config.json` necesitó `project_name` además de `project`
  (el MCP pedía `project_name`; los repos viejos solo tienen `project`).
- [x] T8: `docs/auth-tareas-pendientes.md` → `docs/tasks.md` (vía `git mv`, historial
  preservado). Solo lo pendiente vivo (10 ítems por estado: bloqueado/producto/deuda),
  cada uno con cómo verificarlo. Salió lo completado (a git), lo duplicado (D-030,
  traps.md) y lo muerto (`.next/**`, hecho en `a77892d`). Categorizar por dominio
  descartado: repo 100% auth, el eje real es quién desbloquea.

## Decisiones pendientes
- Reglas de comportamiento exactas que el usuario espera (1 pregunta hecha, esperando respuesta).
- Nombres: docs/overview.md + docs/architecture.md en minúsculas como pidió.
- Tercer archivo propuesto: docs/traps.md (trampas pagadas, extraídas de AGENTS.md
  Verification) — proponer, no crear sin autorización. Por qué: AGENTS.md hoy entierra
  ~20 trampas entre comandos y gates; el agente no las encuentra cuando las necesita.
  traps.md las haría consultables sin inflar AGENTS.md.

## Evidencia base (verificado 2026-10-03, rama docs/lint-blocked-by-ts7, árbol limpio)
- pnpm@12.5.1, node>=24, turbo ^2.10.12, TS 7.0.2, vitest 4.1.10, 646 tests.
- CI: 3 jobs (build, check-types, test) + postgres:17-alpine. Lint no es gate.
- Remote `main`, PRs con merge commit, commits en español sin atribución IA.
- Stack: Express 5 (api-gateway) + React 19/Vite 8/Tailwind 4 (web) + Prisma 7.10/pg.
