# Tasks

Backlog vivo del repo: solo lo pendiente, organizado por **estado** (quién lo
puede desbloquear), no por dominio — el repo hoy es 100% auth y partir por
dominio sería estructura sin retorno.

Reglas:

- Cada ítem tiene ID `TK-NN`: secuencial global, **inmutable** (no cambia si se
  mueve de sección), **nunca reutilizado**. Próximo ID = `max+1`.
- Hecho = se borra el ítem y el commit dice `cierra TK-NN`. El done-log es
  `git log --grep=TK-NN`, no este archivo.
- Cada ítem dice **cómo verificar** que está hecho. Sin eso se pudre como se
  pudrió el de `.next/**` (hecho en `a77892d`, listado como pendiente meses).
- Nada duplicado: el porqué vive en Engram (`decisions/D-XXX`), las trampas en
  `docs/traps.md`. Acá solo qué falta y quién lo destraba.
- Lo completado históricamente vive en git (`docs/auth-tareas-pendientes.md`
  hasta `f1a864c`).

> Última revisión 2026-10-05 contra el árbol vigente (mongo + composition root,
> sesión verificada e2e). La parte HTTP vive en `apps/api-gateway`; los paquetes
> solo contienen lógica de negocio.

## 🟢 Listo para hacer — aprobado y desbloqueado

_(vacío — TK-10 verificado y cerrado abajo)_

## 🟠 Deuda técnica

- [ ] **TK-07 — `pnpm lint` roto: portón de versión del parser** (`typescript-eslint` no
  soporta TS 7.0, tracking #10940). Detalle en Engram `decisions/D-030`. No es
  gate de CI. Salidas: esperar >= 7.1 o parser contra API de TS 6 side-by-side.
  Verificar: `pnpm lint` en verde en `apps/web`.
- [ ] **TK-08 — Lint cubre 1 de 5 paquetes.** Solo `apps/web` define el script; el resto
  lo saltea Turbo en silencio. Agregarlo tal cual sería un verde que miente.
  Verificar: `pnpm lint` corre `eslint .` en los 5 paquetes de código.

## 🔵 Futuras — diferidas por el usuario

No están en el camino actual; cuando se activen vuelven a su sección por estado
(conservando su ID, que nunca cambia).

- [ ] **TK-02 — Variables de email en el entorno real**: `RESEND_API_KEY`, `EMAIL_FROM`,
  `PASSWORD_RESET_URL`. Opcionales a propósito (D-023), pero sin
  `PASSWORD_RESET_URL` los emails llevan links muertos a localhost.
  Verificar: pedir un reset en prod y que el link apunte al dominio real.
- [ ] **TK-03 — Login con Google.** Requiere proyecto de Google Cloud tuyo. La UI ya no lo
  ofrece; `CLIENT_GOOGLE_ID/SECRET` se eliminaron (D-017) y se re-agregan cuando
  la feature exista.
  Verificar: botón visible + login completo contra Google.
- [ ] **TK-04 — Caché remoto de Turbo.** Diferido: es optimización, nada lo requiere.
  Estado: cableado listo en rama `feature/TK-04-turbo-remote-ci` (PR #33 cerrado sin
  mergear, reabrible). Falta token Vercel con escritura en Remote Cache Artifact.
  Verificar: `turbo build` reporta hits remotos en CI.
- [ ] **TK-15 — Sacar `getContainer()` del import-time (P3, con trigger).** Diferido:
  activar SOLO si el arranque duele, aparece un import circular o el costo de
  construir el grafo a import-time se vuelve medible. Hoy el boot construye una
  vez, rápido y sin I/O. Alcance cuando se active: lookup por request + `getContainer()`
  eager en `boot()` (fail-fast), mismo seam de mocks.
  Verificar: `pnpm build`, `check-types` y `test` en verde + `setupEnv.ts` intacto
  (D-021 vive en `config/env`, no lo mata este cambio).
