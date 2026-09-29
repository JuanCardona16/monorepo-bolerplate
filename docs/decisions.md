# Decision log

Decisiones tomadas durante el desarrollo, con el motivo. El objetivo es que un
lector (o un agente en una sesión futura) entienda **por qué** el código es como
es, y no repita los errores que ya costaron tiempo.

Cada entrada registra también lo que se aprendió al hacerlo mal.

---

## D-001 — `Email` normaliza en el dominio, no en la base

**Decisión.** `Email` hace `trim().toLowerCase()` antes de validar. Una segunda
capa, un índice funcional `UNIQUE(lower(email))`, refuerza la restricción en la base.

**Por qué.** La columna `email` es `TEXT` con un btree plano, que compara byte a
byte. Con el valor crudo, `User@x.com` y `user@x.com` eran dos cuentas distintas
del mismo mailbox: alguien podía registrarse dos veces cambiando mayúsculas.

**Aprendido.** El arreglo tiene que estar en el dominio, no solo en la base. Si
solo se normaliza en SQL, el `findByEmail` recibe el valor crudo y la búsqueda
falla. Y las dos capas tienen que quedar sincronizadas: quitar la normalización
sin quitar el índice rompe los inserts.

---

## D-002 — El replay de refresh revoca todas las sesiones, y eso no se toca

**Decisión.** Cuando `RefreshTokenUseCase` detecta un refresh token ya revocado,
llama `revokeAllForUser` y mata todas las sesiones del usuario.

**Por qué.** Es la respuesta correcta ante un token robado: si alguien reenvía un
token que ya se usó, lo más probable es que tenga una copia robada, y revocar solo
ese token dejaría al atacante con una sesión válida.

**Aprendido.** El bug era de otro lado y mucho más sutil. El servidor estaba bien;
lo roto era que **el cliente fabricaba falsos replays**: `apiClient` no
deduplicaba el refresh en vuelo, y `main.tsx` monta `StrictMode`, que dispara el
`useEffect` de `Bootstrap` dos veces en desarrollo. Ambas requests salían con la
misma cookie antes del `Set-Cookie` de la primera, y la segunda mataba la sesión
que la primera acababa de crear. La lección: cuando el síntoma es "el servidor se
porta mal", verificar el comportamiento real contra el servidor antes de culpar al
servidor.

---

## D-003 — `SameSite=lax` por defecto, configurable

**Decisión.** La cookie de refresh usa `SameSite=lax` (antes `strict`), configurable
con `REFRESH_COOKIE_SAME_SITE`.

**Por qué.** `strict` nunca manda la cookie en una request cross-site, lo que rompe
el refresh en cuanto la API no es same-site con la web. `lax` sigue bloqueando los
POST cross-site de los que depende CSRF, y es el default del browser.

**Aprendido.** Una auditoría afirmó que `strict` rompe el flujo "si la web queda en
`app.midominio.com` y la API en `api.midominio.com`". Eso es **incorrecto**: dos
subdominios del mismo dominio registrable son same-site, y `strict` funciona. La
configuración se cambió por ser el default más seguro y portable, no por ese
razonamiento. Las auditorías hay que verificarlas, no copiarlas.

---

## D-004 — `trust proxy` es configuración, con default 0

**Decisión.** `TRUST_PROXY_HOPS`, default `0`. Solo se setea si es mayor a cero.

**Por qué.** El rate limit usa la IP del cliente. Sin `trust proxy`, detrás de un
reverse proxy todas las requests llegan con la dirección del proxy, el presupuesto
global de 200/15 min se comparte entre todos los usuarios, y un minuto de tráfico
mata a todo el mundo. El default es 0 porque confiar en un proxy que no controlás
permite que un cliente falsifique `X-Forwarded-For` y esquive el límite.

---

## D-005 — Cambiar roles es reemplazo total, y revoca las sesiones

**Decisión.** `ChangeUserRolesUseCase` reemplaza el conjunto de roles completo y
después revoca todas las sesiones del usuario afectado.

**Por qué.** Un merge haría imposible quitar un rol, y un rol que se puede dar
pero nunca quitar no es un sistema de permisos. Y los refresh tokens llevan una
copia de los roles: sin revocar, un usuario degradado conserva sus privilegios
hasta que el token expira solo.

**Aprendido.** El primer test que escribí falló y encontró un bug real en mi
propio código: validaba con `Role` pero guardaba el string crudo, así que
`"  ADMIN  "` se persistía con los espacios y `hasRole("admin")` no lo encontraba.
La normalización tiene que aplicarse **al valor que se guarda**, no solo al que se
valida.

---

## D-006 — El anónimo recibe 401, nunca 403

**Decisión.** `requireRole` responde 401 si no hay usuario autenticado, y 403 solo
si el usuario existe pero no tiene el rol.

**Por qué.** Un 403 para un anónimo confirma que la ruta existe. El 401 no revela
nada.

**Aprendido.** Por eso `requireRole` tiene que correr **después** de
`createAuthorize`: lee `req.user`, que `authorize` es quien escribe.

---

## D-007 — Un `__tests__` anidado no puede importar nada de afuera

**Decisión.** En los paquetes con `tsconfig.json` excluyendo `src/**/__tests__/**`,
los tests que necesitan importar de `src/` van en un `__tests__` de nivel superior.

**Por qué.** Vitest resuelve módulos a través del tsconfig. Con el directorio
excluido, un import como `../../../constants/index.js` falla con
`Cannot find module '/constants/index.js'` (con barra inicial, lo que hace el error
muy confuso).

**Aprendido.** Cuesta tres intentos de_paths relativa. Peor: "arreglé" una ruta que
ya estaba bien, empeorándola. Antes de cambiar una ruta de import, **verificar que
el archivo exista y contar los niveles**.

---

## D-008 — `prisma migrate deploy` sobre la base de la app necesita `--config`

**Decisión.** Para migrar la base que usa la gateway hay que exportar su URL **y**
pasar `--config ./src/persistence/postgresSql/config/prisma.config.ts`.

**Por qué.** `prisma.config.ts` lee el `.env.local` de la **raíz** del workspace,
que apunta al Postgres local de los tests de integración. La app usa el
`.env.local` de `apps/api-gateway`, que apunta a Neon. Con solo
`$env:DATABASE_URL` el comando falla con `The datasource.url property is required`.

**Aprendido.** Antes de ejecutar una migración contra una base, correr el
preflight: buscar duplicados con `group by lower(email) having count(*) > 1`. Un
`CREATE UNIQUE INDEX` sobre una columna con duplicados falla y deja la migración a
medias.

---

## D-009 — Antes de tocar datos reales: respaldo, y limpiar lo que uno ensucia

**Decisión.** Toda operación sobre una base con datos reales va precedida de un
`\copy` de respaldo, y termina limpiando las filas que la prueba dejó.

**Por qué.** Un `CREATE UNIQUE INDEX` falla si hay duplicados, y una prueba E2E
deja basura en la base de producción.

**Aprendido.** Nueve usuarios de prueba míos quedaron en Neon tras las pruebas
(`e2e-*`, `race-*`, `cascade-*`, `fix-*`, `smoke-*`). Y al limpiar uno, borré por
email en minúsculas una fila guardada en mayúsculas: el `DELETE` devolvió 0 sin
avisar y yo casi lo reporté como limpio. **Siempre verificar el conteo después de
limpiar.**

---

## D-010 — Verificar por mutación, no confiar en que un test existe

**Decisión.** Cuando un test cubre un bug, se reintroduce el bug para comprobar
que el test falla.

**Por qué.** Un test que nunca falla no prueba nada. Se hizo tres veces: el
`prototype hole` de `statusForCode` (6 tests lo detectan), la deduplicación del
refresh (2 tests), y el guard de admin (2 tests).

**Aprendido.** Dos veces el "fallo" era en realidad un error de la prueba: un
regex que no matcheaba el import real, y una ruta relativa mal contada. **Antes de
concluir que el código está mal, confirmar que la prueba corrió como creés que
corrió.**

---

## D-012 — El primer admin se promueve con un script, no con una ruta

**Decisión.** `pnpm --filter @repo/infrastructure prisma:promote-admin -- <email>`
(agrega `admin`, conserva los roles existentes, revoca los refresh tokens
activos). `--remove` revierte. Es un script, no un endpoint.

**Por qué.** `PUT /auth/users/:uuid/roles` exige `requireRole("admin")`, o sea
que nadie puede otorgar el rol que no tiene. Sin una vía que **no** pase por la
API, el primer admin no puede existir y el sistema de permisos queda inservible.
La alternativa —un endpoint que otorga `admin` sin ya ser admin— es un camino de
escalada de privilegios, no una funcionalidad.

**Aprendido.** El caso del `email` con espacios y mayúsculas lo cubrió la
normalización de `Email`: `new Email(raw).value`. Para los roles hace falta un
`Set` y no un `push`: correr el script dos veces no debe duplicar el rol, y eso
lo garantiza el `Set`.

---

## D-013 — `vi.mock` necesita el mismo especificador que el módulo bajo prueba

**Decisión.** En `scripts/__tests__/promoteAdmin.test.ts`, el mock del cliente
Prisma se registra como `vi.mock("../../client.js")`, no `vi.mock("../client.js")`.

**Por qué.** El especificador se resuelve **desde el módulo que lo importa**, no
desde el test. Escribirlo desde la ubicación del test hace que Vitest busque otro
archivo, el mock **no se aplica en silencio**, y la suite termina
**conectándose a una base de datos real**. Passing los 2 tests que pasaban y
fallando los 8 restantes fue la señal.

**Aprendido.** Un mock que no se aplica no falla: se degrada a producción. Vale
la pena afirmarlo en el propio test, porque el síntoma (un error de conexión de
Postgres en un test unitario) apunta en la dirección completamente opuesta a la
causa.

---

## D-014 — Prisma `update` recibe un objeto, no dos argumentos

**Aprendido.** `prisma.model.update({ where, data, select })` es **un** argumento.
Escribí las aserciones como `calls[1].data` —copiando la forma de un método que
toma `(where, data)`— y las 5 afirmaciones dieron `undefined` en silencio.
Además faltaba `vi.clearAllMocks()` en el `beforeEach`, que hacía fallar el
`not.toHaveBeenCalled()` por llamadas de tests anteriores.



**Decisión.** `@testing-library/*` y cualquier otra dependencia nueva se piden
antes.

**Por qué.** Cambia la superficie del repositorio de forma permanente. Durante este
trabajo se agregaron 4 devDependencies para testear React, y se decidió contra
`swagger-ui-express` justamente por esta regla, dejando el spec como JSON plano.
