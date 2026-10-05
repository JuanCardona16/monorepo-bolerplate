# Plan de refactorización: Auth Composition Root + Dependency Injection

## Contexto

Estoy trabajando en un monorepo basado en Turborepo con una arquitectura de Monolito Modular, siguiendo principios de Clean Architecture / Hexagonal Architecture, SOLID y Dependency Inversion.

El módulo de autenticación actualmente utiliza un `AuthContainer` que construye manualmente sus dependencias:

* Repositories de MongoDB
* PasswordHasher con bcrypt
* RefreshTokenHasher con SHA-256
* ID Generator
* JWT Token Provider
* Email Sender con Resend
* Use Cases
* AuthController
* Lifecycle de conexión/desconexión de MongoDB

Actualmente existe una implementación similar a:

```ts
let cached: AuthContainer | null = null;

export function getContainer(): AuthContainer {
  if (!cached) {
    cached = createContainer();
  }

  return cached;
}

export async function closeContainer(): Promise<void> {
  if (cached) {
    await cached.close();
    cached = null;
  }
}
```

Y `createContainer()` construye manualmente todas las dependencias.

## Objetivo principal

Refactorizar el sistema de Dependency Injection del módulo de autenticación para obtener un Composition Root robusto, explícito, testeable y preparado para escalar a otros módulos, manteniendo DI manual.

NO introducir todavía frameworks como:

* InversifyJS
* TSyringe
* Awilix
* NestJS DI
* Otros contenedores IoC

La intención es mantener Dependency Injection manual y explícita.

---

# Principios que deben respetarse

1. El dominio/core NO debe depender de infraestructura.
2. Application/Core debe depender de interfaces/ports.
3. Infrastructure implementa dichas interfaces.
4. La construcción de dependencias debe ocurrir únicamente en el Composition Root.
5. Los Use Cases no deben crear sus propias dependencias.
6. Los Controllers no deben crear Use Cases.
7. Los repositories concretos no deben ser conocidos por el Core.
8. MongoDB debe ser un detalle de Infrastructure.
9. Resend debe ser un detalle de Infrastructure.
10. JWT debe ser un detalle de Infrastructure/Security.
11. bcrypt debe ser un detalle de Infrastructure/Security.
12. El lifecycle de infraestructura debe estar correctamente gestionado.
13. Evitar estado global mutable innecesario.
14. Evitar God Containers.
15. Mantener la solución preparada para que otros módulos puedan adoptar el mismo patrón.

---

# Fase 0 — Inspección obligatoria

ANTES de modificar cualquier archivo:

1. Analizar la estructura actual del monorepo.
2. Localizar:

   * `AuthContainer`
   * `createContainer`
   * `getContainer`
   * `closeContainer`
   * `connectDatabase`
   * `disconnectDatabase`
   * `AuthController`
   * Todos los Use Cases de Authentication
   * Todos los repositories de Authentication
   * Interfaces/ports utilizadas por los Use Cases
3. Revisar `package.json` de los paquetes involucrados.
4. Revisar aliases de TypeScript.
5. Revisar exports de los packages.
6. Revisar cómo se inicializa actualmente la aplicación.
7. Revisar dónde se conecta actualmente MongoDB.
8. Revisar tests existentes.
9. Detectar si existe otro Composition Root o Container global.

NO modificar código durante esta fase.

Primero generar internamente un diagnóstico de la arquitectura actual.

---

# Fase 1 — Diseñar el nuevo lifecycle

Determinar quién es responsable de:

```text
connectDatabase()
disconnectDatabase()
```

La decisión debe seguir esta regla:

El Composition Root de la aplicación debe controlar el lifecycle de infraestructura.

El módulo Authentication puede exponer sus dependencias, pero no debería iniciar y cerrar globalmente toda la infraestructura de la aplicación si MongoDB es compartido por otros módulos.

Por lo tanto:

## Preferencia

Si MongoDB es compartido por múltiples módulos:

```text
Application Startup
        │
        ├── connectDatabase()
        │
        ├── createAuthModule()
        ├── createUserModule()
        ├── createOtherModule()
        │
        └── Application
```

Y al apagar:

```text
Application Shutdown
        │
        ├── close Auth module
        ├── close other resources
        └── disconnectDatabase()
```

No permitir que `AuthContainer.close()` desconecte MongoDB si otros módulos pueden seguir utilizándolo.

Si el análisis del proyecto demuestra que MongoDB pertenece exclusivamente al módulo Authentication, documentar esa decisión y mantener el lifecycle dentro del módulo.

---

# Fase 2 — Crear un Auth Composition Root limpio

Refactorizar el container actual para que tenga una responsabilidad clara:

Construir el grafo de dependencias de Authentication.

El resultado debería conceptualmente ser:

```text
createAuthContainer()
        │
        ├── repositories
        ├── security services
        ├── infrastructure services
        ├── use cases
        └── controller
```

Mantener Dependency Injection manual.

Ejemplo conceptual:

```ts
export function createAuthContainer(
  dependencies: AuthInfrastructureDependencies,
): AuthContainer {
  const authRepository = new MongoAuthRepository(
    dependencies.models.authUser,
  );

  const refreshTokenRepository =
    new MongoRefreshTokenRepository(
      dependencies.models.refreshToken,
    );

  const passwordHasher =
    new BcryptPasswordHasher(
      dependencies.config.bcryptRounds,
    );

  // ...

  return {
    controller: authController,
    useCases: {
      login: loginUseCase,
      register: registerUseCase,
      refresh: refreshUseCase,
      logout: logoutUseCase,
      getProfile: getProfileUseCase,
      changeUserRoles: changeUserRolesUseCase,
      requestPasswordReset: requestPasswordResetUseCase,
      confirmPasswordReset: confirmPasswordResetUseCase,
    },
  };
}
```

No copiar exactamente este código si la arquitectura existente requiere otra estructura.

Adaptarlo al proyecto real.

---

# Fase 3 — Separar configuración de infraestructura

Evitar que el Composition Root dependa directamente de variables de entorno dispersas.

Actualmente existen valores como:

```ts
BCRYPT_ROUNDS
EMAIL_FROM
PASSWORD_RESET_URL
RESEND_API_KEY
TOKEN_SECRET_KEY
ACCESS_TOKEN_TTL
```

Evaluar si ya existe un sistema centralizado de configuración.

Si existe:

```text
config
 ├── database
 ├── authentication
 ├── email
 └── security
```

utilizarlo.

Si no existe, crear una configuración tipada apropiada.

El Composition Root debería recibir configuración ya validada.

Evitar que cada Use Case lea directamente `process.env`.

---

# Fase 4 — Mejorar el Singleton

El sistema actual utiliza:

```ts
let cached: AuthContainer | null = null;
```

Evaluar si realmente se necesita caching.

Para un backend HTTP tradicional, el container normalmente puede existir durante toda la vida del proceso.

Si se mantiene un singleton lazy, utilizar una implementación segura para inicialización asíncrona.

Preferir conceptualmente:

```ts
let containerPromise: Promise<AuthContainer> | null = null;

export function getContainer(): Promise<AuthContainer> {
  if (!containerPromise) {
    containerPromise = createContainer();
  }

  return containerPromise;
}
```

Esto evita inicializaciones duplicadas cuando existen llamadas concurrentes.

NO implementar esto automáticamente si el análisis demuestra que el Composition Root superior ya controla el lifecycle.

En ese caso, eliminar el singleton del módulo y dejar que `app.ts`/`server.ts` sea responsable del ciclo de vida.

---

# Fase 5 — Evitar God Container

No permitir que Authentication termine exponiendo indiscriminadamente todas sus implementaciones internas.

Evitar esto:

```ts
{
  authRepository,
  refreshTokenRepository,
  passwordHasher,
  refreshTokenHasher,
  idGenerator,
  emailSender,
  tokenProvider,
  loginUseCase,
  registerUseCase,
  ...
}
```

cuando esas dependencias no son necesarias fuera del Composition Root.

Preferir una API pequeña:

```ts
interface AuthContainer {
  controller: AuthController;

  useCases: {
    login: LoginUseCase;
    register: RegisterUserUseCase;
    refresh: RefreshTokenUseCase;
    logout: LogoutUseCase;
    getProfile: GetProfileUseCase;
    changeUserRoles: ChangeUserRolesUseCase;
    requestPasswordReset: RequestPasswordResetUseCase;
    confirmPasswordReset: ConfirmPasswordResetUseCase;
  };
}
```

Las implementaciones internas deben permanecer privadas siempre que sea posible.

---

# Fase 6 — Preparar un patrón modular reutilizable

Diseñar Authentication como referencia para los demás módulos.

Objetivo:

```text
modules/
├── authentication/
│   ├── container/
│   ├── controllers/
│   ├── use-cases/
│   └── ...
│
├── users/
│   ├── container/
│   └── ...
│
├── products/
│   ├── container/
│   └── ...
│
└── ...
```

No crear todos esos módulos si no existen.

Solamente dejar Authentication correctamente estructurado para que el patrón pueda repetirse.

---

# Fase 7 — Composition Root de la aplicación

Si la arquitectura actual lo permite, crear un Composition Root superior:

```text
apps/api
└── src
    ├── app
    │   └── container.ts
    │
    ├── infrastructure
    │   └── ...
    │
    └── main.ts
```

Conceptualmente:

```ts
async function bootstrap() {
  await connectDatabase();

  const auth = createAuthContainer({
    config,
    models,
  });

  const app = createApplication({
    auth,
  });

  return app;
}
```

La aplicación debe ser responsable de ensamblar módulos.

Esto permitirá posteriormente:

```text
Application Container
        │
        ├── Authentication Container
        ├── Users Container
        ├── Products Container
        └── ...
```

No convertirlo en un contenedor IoC automático.

---

# Fase 8 — Lifecycle

Implementar un lifecycle explícito.

Conceptualmente:

```ts
const application = await createApplication();

await application.start();

process.on("SIGTERM", async () => {
  await application.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await application.close();
  process.exit(0);
});
```

El shutdown debe ser idempotente.

Es decir:

```ts
await application.close();
await application.close();
```

no debería provocar errores ni intentar cerrar dos veces recursos ya cerrados.

---

# Fase 9 — Tests

Crear o actualizar pruebas para comprobar:

## Dependency Injection

Verificar que:

* LoginUseCase recibe las dependencias correctas.
* RegisterUserUseCase recibe las dependencias correctas.
* RefreshTokenUseCase recibe las dependencias correctas.
* Password reset recibe las dependencias correctas.

## Container

Verificar que:

```ts
createAuthContainer(...)
```

crea correctamente el grafo.

## Singleton/lifecycle

Si se mantiene singleton:

```ts
const a = await getContainer();
const b = await getContainer();

expect(a).toBe(b);
```

Verificar también que llamadas concurrentes no creen dos containers.

## Shutdown

Verificar que:

```ts
await closeContainer();
```

libera correctamente los recursos que sean responsabilidad del container.

## No coupling

Los tests del Core no deben necesitar MongoDB real, Resend real ni variables de entorno reales.

---

# Fase 10 — Validaciones

Después del refactor ejecutar:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Si alguno de estos scripts no existe, identificar los scripts reales definidos en los `package.json` y ejecutar los equivalentes.

También verificar:

```bash
pnpm turbo run lint
pnpm turbo run typecheck
pnpm turbo run test
pnpm turbo run build
```

si esos tasks existen en `turbo.json`.

---

# Restricciones importantes

NO:

* Introducir un framework de Dependency Injection.
* Introducir un Service Locator.
* Crear variables globales adicionales innecesarias.
* Hacer que los Use Cases lean `process.env`.
* Hacer que los Use Cases importen MongoDB.
* Hacer que Controllers creen Use Cases.
* Hacer que Infrastructure dependa de Controllers.
* Hacer que Core dependa de Infrastructure.
* Desconectar MongoDB desde Authentication si MongoDB es compartido.
* Romper APIs públicas existentes sin justificarlo.
* Cambiar comportamiento funcional de Authentication.
* Cambiar contratos de los Use Cases sin necesidad.
* Modificar lógica de negocio durante este refactor.

El objetivo es mejorar la arquitectura y el lifecycle, NO reescribir Authentication.

---

# Criterios de aceptación

El trabajo se considera terminado únicamente cuando:

1. El Core no tiene dependencias directas de MongoDB.
2. El Core no tiene dependencias directas de Resend.
3. El Core no tiene dependencias directas de bcrypt.
4. El Core no tiene dependencias directas de JWT.
5. Todas las implementaciones concretas se ensamblan en el Composition Root.
6. La configuración está centralizada y tipada.
7. El lifecycle de MongoDB está claramente definido.
8. No existe doble inicialización de infraestructura.
9. El shutdown es seguro.
10. Authentication no controla recursos globales que pertenezcan a toda la aplicación.
11. El container no expone implementaciones internas innecesariamente.
12. El patrón puede reutilizarse para otros módulos.
13. Los tests existentes siguen funcionando.
14. `lint` pasa.
15. `typecheck` pasa.
16. `test` pasa.
17. `build` pasa.
18. No se introdujo un framework IoC.

---

# Documentación obligatoria

Después de terminar, crear o actualizar documentación explicando:

## Architecture

* Qué es el Composition Root.
* Quién construye las dependencias.
* Quién controla el lifecycle.
* Cómo se registra un nuevo Use Case.
* Cómo se agrega una nueva implementación de Infrastructure.
* Cómo crear un nuevo módulo siguiendo el patrón.

## Dependency Injection

Documentar:

```text
Interface/Port
      ↑
      │ implements
Infrastructure Adapter
      ↑
      │ injected by
Composition Root
      ↓
Use Case
```

## Lifecycle

Documentar:

```text
bootstrap
   ↓
connect infrastructure
   ↓
create modules
   ↓
create application
   ↓
start server
   ↓
shutdown
   ↓
close modules/resources
   ↓
disconnect infrastructure
```

---

# Resultado esperado

La arquitectura final debe aproximarse conceptualmente a:

```text
                    ┌─────────────────────┐
                    │    apps/api         │
                    │ Composition Root    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Auth Module       User Module      Other Modules
              │
              ▼
       ┌──────────────┐
       │ Controllers  │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  Use Cases   │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ Ports/       │
       │ Interfaces   │
       └──────┬───────┘
              │
       ┌──────┴─────────────┐
       ▼                    ▼
 Mongo Adapters       Security/Email
       │                    │
       └────────┬───────────┘
                ▼
          Infrastructure
```

---

# Forma de ejecución

Trabajar de forma incremental.

Antes de cada cambio importante:

1. Identificar archivos afectados.
2. Explicar brevemente qué problema resuelve.
3. Aplicar el cambio.
4. Ejecutar las validaciones correspondientes.
5. Corregir errores antes de continuar.

No hacer una reescritura masiva sin validaciones intermedias.

Al finalizar entregar un resumen con:

* Archivos creados.
* Archivos modificados.
* Archivos eliminados.
* Decisiones arquitectónicas.
* Problemas encontrados.
* Tests ejecutados.
* Resultado de lint.
* Resultado de typecheck.
* Resultado de tests.
* Resultado de build.
* Deuda técnica restante.
* Recomendaciones para aplicar el mismo patrón a otros módulos.
