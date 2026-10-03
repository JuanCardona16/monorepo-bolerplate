# Tasks

Backlog vivo del repo: solo lo pendiente, organizado por **estado** (quién lo
puede desbloquear), no por dominio — el repo hoy es 100% auth y partir por
dominio sería estructura sin retorno.

Reglas:

- Hecho = se borra el ítem. El historial queda en git, no acá.
- Cada ítem dice **cómo verificar** que está hecho. Sin eso se pudre como se
  pudrió el de `.next/**` (hecho en `a77892d`, listado como pendiente meses).
- Nada duplicado: el porqué vive en Engram (`decisions/D-XXX`), las trampas en
  `docs/traps.md`. Acá solo qué falta y quién lo destraba.
- Lo completado históricamente vive en git (`docs/auth-tareas-pendientes.md`
  hasta `f1a864c`).

> Última revisión 2026-10-03 contra el árbol vigente. La parte HTTP vive en
> `apps/api-gateway`; los paquetes solo contienen lógica de negocio.

## 🔴 Bloqueado — requiere al usuario

Ninguno de estos lo puede cerrar el agente: necesitan credenciales, decisiones o
acciones tuyas. Cada uno dice cómo confirmar que se hizo.

- [ ] **Migración `20260930093000_password_reset_tokens` en Neon.** Aplicada en la
  base local; no se tocó la de la app por criterio. Sin esto, el reset funciona
  en local y responde `P2021` en producción.
  Verificar: `prisma:migrate:status` contra Neon sin migraciones pendientes.
- [ ] **Variables de email en el entorno real**: `RESEND_API_KEY`, `EMAIL_FROM`,
  `PASSWORD_RESET_URL`. Opcionales a propósito (D-023), pero sin
  `PASSWORD_RESET_URL` los emails llevan links muertos a localhost.
  Verificar: pedir un reset en prod y que el link apunte al dominio real.
- [ ] **Login con Google.** Requiere proyecto de Google Cloud tuyo. La UI ya no lo
  ofrece; `CLIENT_GOOGLE_ID/SECRET` se eliminaron (D-017) y se re-agregan cuando
  la feature exista.
  Verificar: botón visible + login completo contra Google.
- [ ] **Caché remoto de Turbo.** Requiere token.
  Verificar: `turbo build` reporta hits remotos en CI.
- [ ] **Rotar el token de GitHub** usado durante el desarrollo.
  Verificar: token viejo revocado, CI verde con el nuevo.

## 🟡 Decisiones de producto, no técnicas

- [ ] **"Recordarme" real.** La web no ofrece el control: la duración la decide el
  servidor y el cliente no puede cambiarla (D-018). Hacerlo de verdad exige que el
  cliente le diga a la API cuánto vive la cookie — postura de seguridad de sesión,
  no detalle de UI.
  Verificar: decisión registrada en Engram; si es sí, issue con el diseño.

## 🟠 Deuda técnica

- [ ] **`pnpm lint` roto: portón de versión del parser** (`typescript-eslint` no
  soporta TS 7.0, tracking #10940). Detalle en Engram `decisions/D-030`. No es
  gate de CI. Salidas: esperar >= 7.1 o parser contra API de TS 6 side-by-side.
  Verificar: `pnpm lint` en verde en `apps/web`.
- [ ] **Lint cubre 1 de 5 paquetes.** Solo `apps/web` define el script; el resto
  lo saltea Turbo en silencio. Agregarlo tal cual sería un verde que miente.
  Verificar: `pnpm lint` corre `eslint .` en los 5 paquetes de código.
- [ ] **`prisma.config.ts` latente (clase D-021)**: corre `dotenv.config()` al
  importarse y pasa `DATABASE_URL` sin validar. Hoy ningún test lo importa.
  Verificar: test que lo importa en entorno sin `.env.local` y falla ruidoso o
  pasa limpio.
