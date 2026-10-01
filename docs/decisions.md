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

---

## D-015 — El access log registra lo mínimo, y la IP no

**Decisión.** `createRequestLogger` emite una línea por request en formato Common
Log Format: método, ruta, status, duración. **Nunca** el body, **nunca** el
header `Authorization`, **nunca** el query string. La IP se registra solo con
`ACCESS_LOG_IPS=true`, y el default es `false`.

**Por qué.** Un log que persiste una contraseña es un almacén de credenciales, y
eso no se puede arreglar después. El query string es igual de traicionero:
`?token=`, `?email=`, `?code=` son comunes, y además los query strings terminan en
los access logs de todos los proxies delante de la app. La IP es dato personal
bajo GDPR, y un access log es exactamente el tipo de almacén que la acumula para
siempre sin que nadie lo decida.

**Detalle de diseño.** El middleware usa `req.path` y **nunca**
`req.originalUrl`. No es una preferencia: usar `originalUrl` haría que la
garantía dependa de que nadie escriba la palabra equivocada en el futuro, y una
refactorización podría reintroducir la fuga sin que ningún test lo note.

Se monta **primero** en `app.ts`. Después de `helmet` o del rate limiter
perdería los 429; después de las rutas perdería los 404. Y un request rechazado
es justo el que querés ver.

Escucha `res.on("close")` además de `finish`: un cliente que se desconecta a
medio request nunca emite `finish`, y esos requests abortados son exactamente
los que dicen algo — son un endpoint lento o una red inestable vista desde el
servidor. El guard `logged` evita el doble conteo cuando disparan ambos.

Un `try/catch` alrededor de la escritura: perder una línea de log es
estrictamente mejor que convertir cada request en un 500.

**Aprendido.** Los 12 tests unitarios usan objetos falsos, y eso los hace
**incapaces** de detectar el bug más grave de la implementación (ver D-016). Un
test que controla su propio input no puede sorprender a la implementación.

---

## D-016 — Express reescribe `req.url` dentro de un router montado

**Decisión.** `requestLogger` captura `method`, `path` e `ip` **de inmediato**,
al entrar, y no cuando la respuesta termina.

**Por qué.** Express le saca el path de montaje a `req.url` mientras despacha
dentro de un router montado, y lo restaura después. Como el evento `finish` se
dispara antes de esa restauración, leer `req.path` en ese momento da
`"/login"` en vez de `"/api/v1/auth/login"`.

**Aprendido.** Los 12 tests unitarios pasaban. El bug apareció recién en el test
de integración contra el HTTP real, y lo que se veía en el log era
`- "POST /login" 200 1.3ms -`. Un log lleno de paths relativos al router es
mucho más difícil de usar, y peor: un refactor que mueva una ruta reescribe
silenciosamente todas las líneas históricas.

**La lección general.** Un test con objetos falsos no puede sorprender a la
implementación. Los 12 tests unitarios afirmaban el formato de la línea, la
ausencia de PII, el conteo único, el `try/catch`. Todos pasaban mientras la
línea era inútil. Y la mutación precisa —volver a leer `req.path` al loguear— la
detectan 1 test unitario y 5 de integración: los tests escritos **contra el
comportamiento real** son los que la cazan.

---

## D-017 — Se borra la config que no usa nadie

**Decisión.** Eliminados `RESEND_KEY`, `CLIENT_GOOGLE_ID` y
`CLIENT_GOOGLE_SECRET` de `config/env/index.ts` y del barrel de `config/index.ts`.

**Por qué.** Estaban declarados, **no aparecen en ningún `.env.local`** (ni en el
de la gateway ni en el de la raíz) y **no tenían un solo consumidor** en todo el
repo. El comentario que los acompañaba —"Optional until their features land"— los
delataba: eran sobras de la plantilla del usuario.

Declarar una variable de entorno que nadie lee es una promesa que el código no
cumple. Un lector razonable asume que el reset de contraseña y el login con Google
están cableados, y los descubre rotos recién cuando los necesita.

La UI, en cambio, sí era honesta: los botones deshabilitados con
`title="Coming soon"` no prometen nada. El deshonesto era el env.

**Aprendido.** Antes de borrar, `grep` en **todo** el repo, no en el paquete donde
están declarados. Un `Select-String` sobre `apps/api-gateway/src` habría dado la
misma respuesta de todos modos, pero con el repo entero no queda duda.

---

## D-018 — Un control que no controla nada se quita, no se arregla

**Decisión.** El checkbox "Remember for 30 days" del login pasó a ser texto
estático: *"You'll stay signed in for 30 days."*

**Por qué.** No tenía `name`, ni `onChange`, ni estaba registrado en el form con
react-hook-form. No enviaba nada. La duración la decide el servidor
(`REFRESH_COOKIE_MAX_AGE_MS`), así que **desmarcarlo no podía cambiar nada**:
el usuario desmarcaba, obtenía la misma sesión, y creía haber elegido algo.

El defecto no era la falta de funcionalidad sino **presentar como elección lo que
no es elección**. Un texto estático dice la verdad sin ofrecer un control falso.

**No se "arregló" conectándolo**, porque hacerlo es una decisión de producto que
todavía no se tomó: el cliente tendría que decirle a la API cuánto debe vivir la
cookie de refresh, y eso es una postura de seguridad de sesión, no un detalle de
UI.

**Aprendido.** El test afirma la **ausencia** del checkbox a propósito. Volver a
ponERlo es una regresión, no una feature, y el nombre. Verificado por mutación: reintroducir el checkbox rompe 2 tests.

---

## D-020 — Swagger UI se apaga en producción, y su telemetría queda bloqueada

**Decisiones.** Se agrega `swagger-ui-express@5.0.1` y `@types/swagger-ui-express`,
la UI se monta en `GET /api/docs/`, y `DOCS_ENABLED` queda **OFF en producción**
por default. `OPENAPI_SERVER_URL` configura el `servers` que usa "Try it out".
La metadata de discovery se movió a `GET /api/docs/info`.

**Por qué la UI apagada en producción.** Swagger UI es un inventario navegable y
completo de cada endpoint, cada schema y cada código de error. En un despliegue
público eso es reconocimiento regalado. Y el **spec crudo sigue el mismo flag**:
un documento JSON que describe toda la superficie le sirve igual al atacante que
la página renderizada.

**Por qué `/info` aparte del root.** Un humano que escribe `/api/docs` quiere una
página navegable, no un JSON. Un job que quiere JSON no debería tener que aceptar
HTML. `/info` responde **siempre**, incluso con la documentación apagada: saber
*dónde* está el spec no es lo mismo que poder navegarlo.

### La telemetría

`swagger-ui-express` arrastra `@scarf/scarf` (vía `swagger-ui-dist`), cuyo
postinstall **le reporta a scarf.sh que este proyecto instaló el paquete**. Este
repo no reporta instalaciones a terceros, así que se agregó
`"@scarf/scarf": false` a `allowBuilds` en `pnpm-workspace.yaml`.

Detalle que importa: **`pnpm add` corrió ese postinstall sin que disparara el
chequeo de `strictDepBuilds`**, porque el paquete no estaba en la lista. La lista
hay que revisarla cada vez que se agrega una dependencia; no confiar en que el
install la cubra.

### El bug que casi se va

`swaggerUi.setup()` renderiza **solo el HTML**. Los assets estáticos los sirve
`swaggerUi.serve`, que es un middleware aparte. Sin él, la página carga y **cada
uno de sus propios assets responde `200` con la página HTML otra vez**: pantalla
en blanco en el navegador, mientras cualquier chequeo de status code reporta
verde. Lo detectó un test que asserta el `content-type` del CSS.

### Un comentario que escribí y era falso

Escribí que el spec tenía que registrarse **antes** de la UI "porque Express
matchea en orden y el handler de la UI responde todo lo que queda bajo el mount".
Lo verifiqué por mutación y **no era cierto**: `get("/")` matchea solo la raíz
del mount, así que no puede tapar a un `get("/openapi.json")` hermano. Lo que sí
era cierto es el `use`: **`use("/", handler)` matchea TODAS las rutas** bajo el
mount, y un handler de UI montado así también responde `/openapi.json` con HTML
y un 200. Corregí el comentario para decir la causa real.

**Aprendido.** La explicación obvia y la correcta se parecen mucho. La primera
sonaba razonable y era falsa; un test que la contradiga vale más que un
comentario bien escrito. Y el hecho de que la mutación "obvia" pasara sin
detectar nada fue la señal de que el comentario, no el código, estaba mal.

---

## D-021 — La tercera vez que caía la misma trampa, se quita la trampa

**Decisión.** `apps/api-gateway/src/test/setupEnv.ts`, registrado como
`setupFiles` en `vitest.config.ts`, define el env de test para **todas** las
suites del paquete.

**Por qué.** Esta era la tercera suite que pasaba local y fallaba en CI con
`Missing required environment variable: TOKEN_SECRET_KEY`. La causa es siempre la
misma: importar algo que llega a `config/env/index.ts`, cuyo `required()` corre
**al importarse**, antes de que un `beforeAll` o un `vi.stubEnv` puedan ejecutarse.
Localmente lo tapaba el `.env.local` del desarrollador.

Había escrito la trampa en `AGENTS.md` **dos veces**. La tercera vez que caí,
documentarla otra vez dejó de ser una solución: el repo estaba produciendo el
mismo bug de forma repetible.

**Un setup file corre antes de que se importe cualquier módulo de test.** Eso
elimina la clase de bug, no el síntoma: ninguna suite nueva puede olvidarlo.

**Aprendido.**

1. **Un recordatorio que hay que repetir no es un control.** Cuando una regla
   aparece dos veces en la documentación y igual se cumple mal, la respuesta
   correcta es cambiar la estructura, no escribir la regla una tercera vez.
2. **Verificar la paridad con CI moviendo `.env.local` aside.** Un run local en
   verde no prueba nada sobre CI, y esa es exactamente la razón por la que el
   bug arrived tres veces: la única señal útil era simular el entorno de CI, y
   nadie lo hacía.
3. El `DATABASE_URL` del setup apunta a un puerto cerrado **a propósito**: si
   alguna suite intenta conectarse de verdad, tiene que fallar ruidosamente en
   vez de alcanzar en silencio una base que casualmente esté levantada.

### El `delete` estaba exactamente al revés

La primera versión hacía `delete process.env.ACCESS_LOG_IPS`. Parece la forma
limpia de "no dejar que la variable del shell moleste", y es **lo contrario**.

`dotenv` **no** sobreescribe una variable que ya está en `process.env` (verificado
empíricamente contra dotenv 18.0.4). Entonces `delete` no desactiva nada:
**libera el nombre**, y después `config/env/index.ts` corre `dotenv.config()` y
re-inyecta `ACCESS_LOG_IPS=true` desde `.env.local`. Reproducido: con un
`.env.local` que la define, el test de access log falla con
`expected '::ffff:127.0.0.1 - "GET…' to match /^- "GET/`.

La corrección es `= "false"`: con el valor presente, dotenv lo respeta.

**Y otra cobertura perdida de paso:** el setup fijaba `DOCS_ENABLED = "true"`, con
lo cual **ninguna suite** ejercitaba la rama
`DOCS_ENABLED === undefined && NODE_ENV !== "production"` — que es justamente el
default que la variable documenta. El comentario del test de docs seguía
afirmando lo contrario. Ahora la variable se deja sin setear a propósito, y un
test afirma que lo está, para que volver a pinearla falle.

---

## D-022 — 35 tests invisibles: `turbo run test` filtraba `DATABASE_URL`

**Decisión.** La task `test` de `turbo.json` declara `env: ["DATABASE_URL"]` e
`inputs: ["$TURBO_DEFAULT$", ".env*"]`.

**Por qué.** Los 35 tests de integración de `@repo/infrastructure` se saltan con
`describe.skipIf(!process.env.DATABASE_URL)`. Como Turbo filtra las variables no
declaradas, `DATABASE_URL` **nunca llegaba a la task**, ni siquiera en local con
la base andando. No era un problema de CI: era que esos tests eran
**inalcanzables por el comando normal**, siempre.

Es el peor tipo de falso verde: no falla, **desaparece**. Un mapper o un
repositorio roto llegaba a `main` con CI verde y con un `pnpm test` verde en la
máquina del desarrollador.

Con el fix: `@repo/infrastructure` pasa de `63 passed | 35 skipped` a **98 passed**.

**Aprendido.** Correr los tests de un paquete directo (`pnpm --filter X exec
vitest run`) **sí** ve la variable. Eso es exactamente por lo que el problema
era invisible: el comando de debugging funciona y el comando del día a día no. Un
camino que funciona solo en debugging es un camino que nadie va a extrañar.

Además, `inputs: [".env*"]` en `test` cierra un agujero aparte: sin eso, un
resultado cacheado se reutiliza después de que `.env.local` cambie, y `pnpm
test` puede devolver un verde construido contra un entorno que ya no existe.
`build` ya lo declaraba; `test` no.

---

## D-023 — Opcional no puede significar silencioso

**Decisión.** `RESEND_API_KEY`, `PASSWORD_RESET_URL` y `EMAIL_FROM` quedan
opcionales (un `required()` impediría que arranque el login porque a alguien se
le olvidó una contraseña), pero `config/env/index.ts` **avisa por consola** de
cada una que falte, **solo en producción**.

**Por qué.** `PASSWORD_RESET_URL` cae a `http://localhost:5173/reset-password`. Un
despliegue en producción que olvide la variable entrega emails de reset
**válidos** con un link a localhost: el envío funciona, el link está muerto, y
nada en ningún lado lo reporta. Peor: el use case traga **todos** los errores del
sender a propósito (D-005 y el razonamiento de enumeración de abajo), así que
tampoco el adaptador va a quejarse.

**"No debe romper el arranque" y "no debe ser silencioso" son dos requisitos
distintos, y solo el segundo estaba cumplido.**

**Aprendido.** Tragarse errores para proteger una garantía de seguridad es
correcto, pero crea una zona ciega: la misma decisión que impide que un bug del
adaptador se convierta en un oráculo de enumeración también impide que una mala
configuración se note. La salida no es aflojar el `catch`, es poner la señal **en
el borde del módulo de configuración**, que es el único lugar que sabe qué se
faltó.

## D-024 — `forgot` traga TODOS los errores del sender, no solo los previstos

**Decisión.** `RequestPasswordResetUseCase` envuelve el `send` en un `catch`
vacío, sin filtrar por tipo.

**Por qué.** Re-lanzar un error inesperado respondería **500 para una cuenta real
y 200 para una desconocida**: exactamente el oráculo de enumeración que la clase
existe para impedir. El silencio quedaría dependiente de que nunca pase nada
inesperado, y eso no se puede garantizar. El costo —que el fallo del proveedor no
se ve en el use case— lo paga el adaptador, que es la única capa que sabe qué se
rompió, y registra sin el token.

**El token viaja en el fragment de la URL** (`#token=...`), no en la query: los
browsers nunca transmiten el fragment, así que no puede llegar al access log, al
log de un proxy inverso, ni al `Referer` de la página que el usuario visite
después.

---

## D-025 — Un test sobre un hook no prueba qué hace el hook

**Aprendido.** Dos de las primeras pruebas del adaptador de email afirmaban que
el token no se registraba, pero lo hacían sobre el callback `onFailure` inyectado,
no sobre `console.error`. Esas aserciones pasan para **cualquier** implementación
que registre por el hook, así que un `console.error(message.text)` real, al lado,
se colaba sin que nada fallara.

Peor: al corregir la prueba, se descubrió un error propio dentro de ella —
afirmaba sobre `console.error` **mientras inyectaba un stub**, lo que reemplaza el
logger real, con lo que la prueba no afirmaba nada. La corrección fue construir el
sender sin el override y espiar el sumidero verdadero.

Misma clase que D-016: **una prueba que controla su propio input no puede
sorprender a la implementación**. Espiar el sink real, no el puerto que la
implementación eligió usar.

---

## D-019 — Un `fetch` que rechaza se normaliza en el cliente, no en cada página

**Decisión.** `apiClient.request` envuelve el `fetch` en un `try/catch` y
convierte un rechazo crudo en `new ApiError("NETWORK_ERROR", 0, mensaje)`.

**Por qué.** Todas las páginas renderizan su error con
`mutation.error instanceof ApiError`. Un `fetch` que rechaza (sin internet, DNS
caído, TLS, CORS) lanza un `TypeError`, que **nunca** es un `ApiError`: la
condición daba `false`, la página no renderizaba nada, y el usuario se quedaba
frente a un botón que volvio a su estado normal sin explicación.

El fix va en el cliente y no en las páginas por una razón concreta: el defecto
está en la frontera, no en la vista. Arreglarlo en cada página serían N cambios
y ninguno sería la raíz. `RegisterPage` tenía exactamente el mismo bug y quedó
arreglado sin tocarlo.

`status: 0` es el centinela convencional de "no hubo respuesta HTTP", distinto de
cualquier status que el servidor pudiera haber enviado.

**El `AbortError` se deja pasar sin tocar**, a propósito: una cancelación es
deliberada, no un fallo. Convertirla en "revisá tu conexión" sería una mentira,
y además haría que la cancelación fuera indistinguible del fallo para cualquier
cosa que reintente.

**Aprendido.** Dos tests fijaban el comportamiento **equivocado**, y
documentarlo fue lo que hizo el bug visible:

- `LoginPage > shows no error message when the request fails at the network
  level` afirmaba la **ausencia** de alerta, con un comentario que decía
  explícitamente *"Reported, not fixed: the fix belongs in production code"*.
- `apiClient > surfaces a network failure as a raw TypeError, not an ApiError`
  **fijaba el bug como si fuera el contrato**.

Un test que documenta un bug sin marcarlo comoKnown-broken es una bomba de
reloj: el dia que se arregla, el test falla y parece que rompiste algo, cuando
lo unico que paso es que el codigo mejoro. Ambos tienen ahora el nombre
descriptivo de lo que **debería** pasar, y una referencia a por que antes no
pasaba.



**Decisión.** `@testing-library/*` y cualquier otra dependencia nueva se piden
antes.

**Por qué.** Cambia la superficie del repositorio de forma permanente. Durante este
trabajo se agregaron 4 devDependencies para testear React, y se decidió contra
`swagger-ui-express` justamente por esta regla, dejando el spec como JSON plano.

---

## D-026 — CI con base de datos: el service container y el guard que lo hace honesto

**Decisión.** El job `test` de `ci.yml` levanta `postgres:17-alpine` como service
container, aplica `prisma:migrate:deploy` antes de los tests, y las tres suites de
repositorio **lanzan** en vez de saltarse cuando `CI=true` y no hay
`DATABASE_URL`. La task `test` de `turbo.json` quedó con `cache: false`.

**Por qué el guard.** Agregar la base al runner sin tocar el guard habría sido una
mejora a medias. `process.env.DATABASE_URL ? describe : describe.skip` sigue siendo
un skip silencioso: si el container no levanta, si la variable se filtra, o si
alguien revierte el `env` de `turbo.json`, los 35 tests vuelven a reportarse como
skipped y el build queda verde. El mismo falso verde, con mejor infraestructura
alrededor.

La asimetría es intencional: **local sin base = skip aceptable** (el desarrollador
puede no tener Postgres), **CI sin base = error**. En CI la ausencia de la base ya
no es un estado normal: es la señal de que algo se rompió.

**Por qué `cache: false`.** La task depende de una base viva y ninguna clave de
cache puede ver su contenido: el historial de migraciones aplicado, las filas que
dejó una corrida anterior, un servidor que arrancó con otro schema. Un `"98
passed"` reproducido es una afirmación sobre una base que ya no existe — el mismo
falso verde que saltarse las suites, pero más difícil de ver porque nada parece
estar mal. Va en `turbo.json` y no como `TURBO_FORCE` en el workflow porque eso
también apagaría el caché de `build`, que es la parte cara.

**Por qué las migraciones antes de los tests.** Sin ellas las suites corren y cada
query falla con `P2021 "table does not exist"`, que se lee como un repositorio
roto y no como una migración faltante.

**Por qué `postgres:17-alpine` y no `latest`.** Un salto de versión mayor puede
cambiar collation o rigurosidad y poner en rojo un build por motivos que no tienen
nada que ver con el código. La base local de desarrollo es Postgres 17.

**Aprendido.** Un gate que puede fallar en silencio no es un gate. La pregunta
útil no es "¿el test corrió?" sino **"¿qué pasa si no corre?"**, y la respuesta
tenía que ser distinta en local y en CI. Y el orden importa: primero definir cómo
falla, después agregar la infraestructura. Al revés, la infraestructura nueva se
convierte en otro camino donde el silencio puede aparecer.

---

## D-027 — `prisma:migrate:*` estaba roto: faltaba `--config`

**Bug encontrado de paso**, no buscado. Los tres scripts `prisma:migrate:*` de
`@repo/infrastructure` pasaban `--schema` pero no `--config`, y fallaban siempre
con `The datasource.url property is required in your Prisma config file`.

`prisma generate` sí funciona sin `--config` (no necesita el datasource), así que
el `postinstall` de CI nunca lo detectó. Y `.github/workflows/ci.yml` solo corría
`pnpm test`, así que el comando roto era invisible para todos.

Al agregar el paso `Apply migrations` al workflow, el build habría fallado en el
primer push por un comando que llevaba tiempo roto.

**Aprendido.** La asimetría `generate` funciona / `migrate` no es la misma clase de
bug que los 35 tests, un nivel más abajo: **nada ejercitaba el camino**. El único
comando de migración que el repo ejecutaba automáticamente es el `postinstall`, y ese
no pasa por `--config`. Un script que nadie corre no está roto de forma visible:
está roto de forma invisible, que es peor, porque lo descubre el que acaba de
agregar el paso que lo usa.
