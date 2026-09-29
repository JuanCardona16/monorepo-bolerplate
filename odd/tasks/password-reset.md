# Password reset

> Creado 2026-09-29. Feature abierta. Rama de trabajo separada de la de Swagger UI.

## Objetivo

Hoy un usuario que pierde su contraseña **no tiene ninguna vía de recuperación**.
`POST /auth/login` es la única puerta. Es el hueco de seguridad real que queda en
la feature de autenticación.

## Problema

Un usuario que olvida su contraseña solo puede abrir un ticket. En una app real
eso es una fuga de cuentas abandonada y una fuente de tickets de soporte. No es
un detalle de UX: es el motivo por el que la autenticación se considera
incompleta.

## Alcance

- Solicitar el reset por email.
- Confirmar el reset con un token de un solo uso.
- Revocar **todas** las sesiones del usuario al cambiar la contraseña.
- Envío del email detrás de un puerto, con un adaptador HTTP sin dependencia nueva.

## Fuera de alcance

- Google login (PR aparte: necesita OAuth y un proyecto de Google Cloud).
- "Recordarme" real (decisión de producto del usuario, no técnica).
- Verificación de email en el registro. Hoy el registro no valida que el email
  exista; agregar eso cambia el contrato de `register` y es otra decisión.

## Decisiones de diseño

1. **`forgot` nunca revela si la cuenta existe.** Responde siempre igual, con o
   sin usuario. Revelarlo convierte el endpoint en un enumerador de cuentas.
2. **Token de un solo uso, con expiración.** Se hashea antes de guardarse: una
   filtración de la tabla no debe permitir resetear la cuenta de nadie.
3. **Cambiar la contraseña revoca todas las sesiones.** Sin esto, un atacante con
   una sesión robada sobrevive al reset que hizo la víctima. Es el mismo motivo
   por el que `ChangeUserRolesUseCase` revoca al degradar un rol (D-005).
4. **El adaptador de email no usa SDK.** La API de Resend es un POST HTTP. Una
   dependencia más para eso sería Contrary al criterio del repo.
5. **Si el proveedor de email falla, el token NO se invalida.** El usuario puede
   reintentar. Prefiero un token huérfano a un usuario al que se le dice "te
   enviamos un email" y nunca llegó.

## Tareas

- [ ] T1. `PasswordResetToken` entity + `InvalidResetTokenError` en core
- [ ] T2. Puertos `PasswordResetTokenRepository` y `EmailSender` en core
- [ ] T3. `RequestPasswordResetUseCase` (en silencio, siempre mismo resultado)
- [ ] T4. `ConfirmPasswordResetUseCase` (valida, hashea, revoca sesiones)
- [ ] T5. Exports en el barrel de core
- [ ] T6. Migración Prisma + modelo `password_reset_tokens`
- [ ] T7. Adaptador Prisma del repositorio
- [ ] T8. Adaptador de email por HTTP (Resend, sin SDK)
- [ ] T9. Rutas del gateway + Zod + rate limit + códigos de error
- [ ] T10. Wiring en el contenedor DI
- [ ] T11. `ForgotPasswordPage` y `ResetPasswordPage` en web
- [ ] T12. Tests de dominio, de gateway y de web
- [ ] T13. Verificación: build, check-types, test, y mutación de cada guarda

## Comandos

```sh
pnpm build && pnpm check-types && pnpm test
pnpm --filter @repo/infrastructure prisma:generate
```

## Criterios de aceptación

- [ ] `forgot` responde idéntico para email existente e inexistente
- [ ] El token se guarda hasheado, nunca en claro
- [ ] Un token usado no se puede reutilizar
- [ ] Un token expirado se rechaza
- [ ] Confirmar el reset revoca todas las sesiones del usuario
- [ ] Cambiar a una contraseña débil lanza `WeakPasswordError` y no persiste nada
- [ ] Si el envío de email falla, el token sigue siendo usable
- [ ] 100% de los checks verdes

## Nota de despliegue

Requiere una migración nueva. **No aplicar a la base de la app sin autorización
expresa del usuario** (mismo criterio que con el índice funcional). Para Neon hay
que exportar la URL de `apps/api-gateway/.env.local` **y** pasar `--config`
explícito: ver la trampa de `prisma.config.ts` en `AGENTS.md`.
