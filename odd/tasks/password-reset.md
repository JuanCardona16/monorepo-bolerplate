# Password reset

> Creado 2026-09-29. **Cerrado**: 13 tareas y 7 criterios de aceptacion verdes.
> `646 tests`. Rama `feat/password-reset`.

## Objetivo

Un usuario que pierde su contrasena no tenia ninguna via de recuperacion:
`POST /auth/login` era la unica puerta. Es el hueco de seguridad real que
quedaba en la feature de autenticacion.

## Problema

Un usuario que olvida su contrasena solo puede abrir un ticket. En una app real
eso es una fuga de cuentas abandonada y una fuente constante de tickets de
soporte. No es un detalle de UX: es el motivo por el que la autenticacion se
considera incompleta.

## Alcance

- Solicitar el reset por email.
- Confirmar el reset con un token de un solo uso.
- Revocar **todas** las sesiones del usuario al cambiar la contrasena.
- Envio del email detras de un puerto, con adaptador HTTP sin dependencia nueva.

## Fuera de alcance

- Google login (PR aparte: necesita OAuth y un proyecto de Google Cloud).
- "Recordarme" real (decision de producto del usuario, no tecnica).
- Verificacion de email en el registro. Hoy el registro no valida que el email
  exista; agregar eso cambia el contrato de `register` y es otra decision.

## Decisiones de diseno

1. **`forgot` nunca revela si la cuenta existe.** Responde siempre igual, con o
   sin usuario. Revelarlo convierte el endpoint en un enumerador de cuentas.
2. **Token de un solo uso, con expiracion (1 hora).** Se hashea antes de
   guardarse: una filtracion de la tabla no debe permitir resetear la cuenta de
   nadie.
3. **Cambiar la contrasena revoca todas las sesiones.** Sin esto, un atacante con
   una sesion robada sobrevive al reset que hizo la victima. Es el mismo motivo
   por el que `ChangeUserRolesUseCase` revoca al degradar un rol (D-005).
4. **El adaptador de email no usa SDK.** La API de Resend es un POST HTTP. Una
   dependencia mas para eso seria contrario al criterio del repo.
5. **Si el proveedor de email falla, el token NO se invalida.** El usuario puede
   reintentar. Prefiero un token huerfano a un usuario al que se le dice "te
   enviamos un email" y nunca llego.
6. **El token viaja en el fragment de la URL** (`#token=`), no en la query: los
   browsers nunca transmiten el fragment, asi que no llega al access log, al log
   de un proxy, ni al `Referer` de la siguiente pagina.
7. **El `catch` del sender no filtra por tipo.** Re-lanzar un error inesperado
   responderia 500 para una cuenta real y 200 para una desconocida, convirtiendo
   cualquier bug del adaptador en un oraculo de enumeracion. Ver D-024.

## Tareas

- [x] T1. `PasswordResetToken` entity + `InvalidResetTokenError` en core
- [x] T2. Puertos `PasswordResetTokenRepository` y `EmailSender` en core
- [x] T3. `RequestPasswordResetUseCase` (silencioso, siempre mismo resultado)
- [x] T4. `ConfirmPasswordResetUseCase` (valida, hashea, revoca sesiones)
- [x] T5. Exports en el barrel de core
- [x] T6. Migracion Prisma + modelo `password_reset_tokens`
- [x] T7. Adaptador Prisma del repositorio
- [x] T8. Adaptador de email por HTTP (Resend, sin SDK)
- [x] T9. Rutas del gateway + Zod + rate limit + codigos de error
- [x] T10. Wiring en el contenedor DI
- [x] T11. `ForgotPasswordPage` y `ResetPasswordPage` en web
- [x] T12. Tests de dominio, de gateway y de web
- [x] T13. Verificacion: build, check-types, test, y mutacion de cada guarda

## Criterios de aceptacion

- [x] `forgot` responde identico para email existente e inexistente
- [x] El token se guarda hasheado, nunca en claro
- [x] Un token usado no se puede reutilizar
- [x] Un token expirado se rechaza
- [x] Confirmar el reset revoca todas las sesiones del usuario
- [x] Cambiar a una contrasena debil lanza `WeakPasswordError` y no persiste nada
- [x] Si el envio de email falla, el token sigue siendo usable
- [x] 100% de los checks verdes

## Verificacion

El gate se corrio **dos veces**, a proposito:

- **Sin `DATABASE_URL`** (paridad con CI): los 35 tests de integracion se saltan.
- **Con `DATABASE_URL`**: los 35 corren, y fallan si la migracion no esta
  aplicada. Correr solo la primera modalidad es como se dejo pasar el bug.

Las 13 guardas de seguridad se verificaron por mutacion (reintroducir cada una y
confirmar que un test falla). Dos de las primeras pruebas del adaptador de email
**no** detectaban la filtracion del token: afirmaban sobre el hook `onFailure` en
vez de sobre `console.error`, asi que cualquier implementacion que registrara
por ahi pasaba, y un `console.error` real al lado se colaba. Misma clase de error
que D-016 (D-025).

## Notas de despliegue

- **La migracion se aplico SOLO a la base local de tests.** Neon, que es la base
  que usa la app, queda pendiente de autorizacion explicita del usuario.
- `PASSWORD_RESET_URL` cae a `http://localhost:5173/reset-password` si no se
  setea. Un despliegue que la olvide entrega emails validos con links muertos.
  El modulo de config avisa por consola en produccion (D-023).
- `RESEND_API_KEY` y `EMAIL_FROM` tambien son opcionales, por el mismo motivo:
  una feature opcional no debe impedir que arranque el login.
