# Plan de implementación: Modular Composition Root por Feature

## 1. Objetivo

Refactorizar el sistema actual de Dependency Injection para adoptar una arquitectura de **Modular Composition Roots**, donde cada módulo/feature del negocio tenga su propio container responsable exclusivamente de construir las dependencias internas de dicho módulo.

La arquitectura objetivo será:

```text
Application
│
├── App Composition Root
│
├── Infrastructure Composition
│
└── Feature Containers
    ├── Authentication
    ├── Users
    ├── Orders
    ├── Payments
    └── otros módulos futuros
```

El objetivo es mantener:

* Dependency Injection manual.
* Clean Architecture.
* Hexagonal Architecture.
* SOLID.
* Dependency Inversion Principle.
* Modular Monolith.
* Separación entre Core/Application e Infrastructure.
* Preparación para una futura extracción de módulos a microservicios.

NO introducir frameworks IoC como:

* InversifyJS
* TSyringe
* Awilix
* NestJS DI
* Otros contenedores automáticos.

---

# 2. Principio arquitectónico

Cada módulo de negocio tendrá un Composition Root propio.

Ejemplo:

```text
Authentication
    │
    └── authentication.container.ts

Users
    │
    └── users.container.ts

Orders
    │
    └── orders.container.ts
```

Cada container conoce únicamente las dependencias necesarias para su propio módulo.

NO crear un container global que exponga indiscriminadamente todas las dependencias.

---

# 3. Arquitectura objetivo

La arquitectura final debe aproximarse a:

```text
                         ┌──────────────────────┐
                         │      main.ts         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ App Composition Root │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
        Infrastructure       Authentication          Users
         Composition            Container           Container
                 │                  │                  │
        ┌────────┼────────┐         │                  │
        ▼        ▼        ▼         ▼                  ▼
      Mongo    Email     Security  Use Cases         Use Cases
```

El `App Composition Root` ensambla la aplicación.

Los containers de cada módulo ensamblan únicamente sus dependencias internas.

---

# 4. Fase 0 — Inspección del proyecto

ANTES de modificar cualquier archivo:

Analizar completamente el repositorio.

Identificar:

```text
- apps/
- packages/
- core/
- infrastructure/
- security/
- shared/
- authentication/
- controllers/
- use cases/
- repositories/
- ports/interfaces/
- database bootstrap
- server bootstrap
- existing containers
```

Localizar específicamente:

```text
AuthContainer
createContainer
getContainer
closeContainer
connectDatabase
disconnectDatabase
AuthController
todos los Authentication Use Cases
todos los Authentication repositories
todos los Authentication ports/interfaces
```

También determinar:

1. Quién inicia MongoDB actualmente.
2. Quién cierra MongoDB.
3. Si MongoDB es compartido por otros módulos.
4. Dónde se inicia HTTP.
5. Dónde se registran las rutas.
6. Si existe actualmente un App Container.
7. Si existe actualmente algún Service Locator.
8. Si existen tests de integración que dependan del lifecycle actual.

NO modificar código durante esta fase.

Primero producir un diagnóstico arquitectónico.

---

# 5. Fase 1 — Definir responsabilidades

Establecer claramente tres niveles.

## Nivel 1 — Infrastructure Composition

Responsable de crear recursos compartidos de infraestructura.

Ejemplos:

```text
MongoDB
Redis
Email Sender
External API Clients
Security adapters
```

No debe contener Use Cases ni Controllers.

Conceptualmente:

```ts
createInfrastructureDependencies()
```

Debe devolver solamente infraestructura que realmente sea compartida.

---

## Nivel 2 — Feature Containers

Cada feature crea sus propias dependencias.

Ejemplo:

```ts
createAuthenticationContainer(...)
```

Authentication será el primer módulo implementado.

Posteriormente:

```ts
createUsersContainer(...)
createOrdersContainer(...)
createPaymentsContainer(...)
```

No crear estos módulos si todavía no existen.

Solo diseñar el patrón.

---

## Nivel 3 — App Composition Root

Debe ensamblar toda la aplicación.

Conceptualmente:

```ts
createAppContainer()
```

Ejemplo:

```ts
const infrastructure = createInfrastructureDependencies();

const authentication = createAuthenticationContainer({
  authRepository,
  refreshTokenRepository,
  passwordHasher,
  refreshTokenHasher,
  idGenerator,
  tokenProvider,
  emailSender,
});

return {
  infrastructure,
  modules: {
    authentication,
  },
};
```

---

# 6. Fase 2 — Diseñar el contrato de los Feature Containers

No crear un framework genérico innecesariamente complejo.

Utilizar interfaces simples.

Ejemplo conceptual:

```ts
export interface AuthenticationContainer {
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

Las implementaciones internas deben permanecer privadas.

NO exponer:

```text
MongoAuthRepository
BcryptPasswordHasher
JwtTokenProvider
ResendEmailSender
```

salvo que otro módulo realmente necesite explícitamente una abstracción compatible.

---

# 7. Fase 3 — Crear Authentication Container

Crear:

```text
authentication.container.ts
```

El container debe construir:

```text
Repositories
    ↓
Security adapters
    ↓
Infrastructure adapters
    ↓
Use Cases
    ↓
Controller
```

Conceptualmente:

```ts
const authRepository =
  new MongoAuthRepository(...);

const refreshTokenRepository =
  new MongoRefreshTokenRepository(...);

const passwordResetTokenRepository =
  new MongoPasswordResetTokenRepository(...);

const passwordHasher =
  new BcryptPasswordHasher(...);

const refreshTokenHasher =
  new Sha256RefreshTokenHasher();

const idGenerator =
  new CryptoIdGenerator();

const tokenProvider =
  new JwtTokenProvider(...);

const emailSender =
  new ResendEmailSender(...);
```

Después construir los Use Cases.

Finalmente:

```ts
const controller =
  new AuthController(...);
```

Retornar únicamente:

```ts
{
  controller,
  useCases,
}
```

---

# 8. Fase 4 — Eliminar el God Container

No crear:

```ts
AppContainer {
  authRepository
  passwordHasher
  tokenProvider
  emailSender
  loginUseCase
  registerUseCase
  ...
}
```

como API pública.

En su lugar:

```ts
AppContainer {
  authentication
}
```

donde:

```ts
authentication = {
  controller,
  useCases
}
```

El App Container no necesita conocer cada implementación interna.

---

# 9. Fase 5 — Dependency Injection explícita

Evitar Service Locator.

NO hacer:

```ts
container.resolve("loginUseCase");
```

NO hacer:

```ts
globalContainer.get(...)
```

NO hacer:

```ts
process.env
```

desde los Use Cases.

Preferir:

```ts
createAuthenticationContainer({
  authRepository,
  refreshTokenRepository,
  passwordHasher,
  refreshTokenHasher,
  idGenerator,
  tokenProvider,
  emailSender,
  config,
});
```

La dependencia debe ser visible.

---

# 10. Fase 6 — Separar configuración

Revisar:

```text
BCRYPT_ROUNDS
EMAIL_FROM
PASSWORD_RESET_URL
RESEND_API_KEY
TOKEN_SECRET_KEY
ACCESS_TOKEN_TTL
```

Los Use Cases no deben importar configuración de entorno.

La configuración debe validarse antes de construir los containers.

Preferir:

```text
process.env
     ↓
configuration
     ↓
validation
     ↓
typed config
     ↓
Composition Root
     ↓
dependencies
```

---

# 11. Fase 7 — Lifecycle de Infrastructure

Determinar si MongoDB es compartido.

Si es compartido:

```text
Application startup
        │
        ▼
connectDatabase()
        │
        ▼
createInfrastructureDependencies()
        │
        ▼
createAuthenticationContainer()
        │
        ▼
createOtherModules()
        │
        ▼
startServer()
```

Al apagar:

```text
shutdown
   │
   ▼
close modules/resources
   │
   ▼
disconnectDatabase()
```

Authentication NO debe desconectar MongoDB si otros módulos lo utilizan.

Por tanto, evitar:

```ts
AuthContainer.close()
    ↓
disconnectDatabase()
```

si MongoDB es global.

---

# 12. Fase 8 — Crear Infrastructure Composition

Crear un mecanismo para construir infraestructura compartida.

Conceptualmente:

```ts
interface InfrastructureDependencies {
  authRepository: AuthRepository;
  refreshTokenRepository: RefreshTokenRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;

  passwordHasher: PasswordHasher;
  refreshTokenHasher: TokenHasher;
  idGenerator: IdGenerator;
  tokenProvider: TokenProvider;
  emailSender: EmailSender;
}
```

IMPORTANTE:

No meter absolutamente todo en este objeto.

Solamente exponer dependencias que realmente deban compartirse o que sean responsabilidad del Composition Root.

Si una dependencia pertenece exclusivamente a Authentication, puede construirse dentro de Authentication.

La decisión debe basarse en las fronteras reales del proyecto.

---

# 13. Fase 9 — App Composition Root

Crear o adaptar:

```text
app.container.ts
```

Conceptualmente:

```ts
export function createAppContainer(
  infrastructure: InfrastructureDependencies,
): AppContainer {
  const authentication =
    createAuthenticationContainer({
      authRepository: infrastructure.authRepository,
      refreshTokenRepository:
        infrastructure.refreshTokenRepository,
      passwordResetTokenRepository:
        infrastructure.passwordResetTokenRepository,
      passwordHasher:
        infrastructure.passwordHasher,
      refreshTokenHasher:
        infrastructure.refreshTokenHasher,
      idGenerator:
        infrastructure.idGenerator,
      tokenProvider:
        infrastructure.tokenProvider,
      emailSender:
        infrastructure.emailSender,
      config: infrastructure.config,
    });

  return {
    authentication,
  };
}
```

No copiar literalmente.

Adaptar al código existente.

---

# 14. Fase 10 — Registro de rutas

Revisar cómo se registra actualmente:

```text
AuthController
Routes
Express/Fastify
```

Preferir:

```ts
registerAuthenticationRoutes(
  app,
  container.authentication.controller,
);
```

No hacer que las rutas creen containers.

No hacer:

```ts
new AuthController(...)
```

desde las rutas.

---

# 15. Fase 11 — Bootstrap

El bootstrap debe tener una responsabilidad clara:

```text
main.ts
   │
   ├── load configuration
   ├── connect infrastructure
   ├── create infrastructure dependencies
   ├── create app container
   ├── create HTTP application
   └── start server
```

Conceptualmente:

```ts
async function bootstrap() {
  const config = loadConfig();

  await connectDatabase(config.database);

  const infrastructure =
    createInfrastructureDependencies(config);

  const container =
    createAppContainer(infrastructure);

  const app =
    createHttpApplication(container);

  await app.listen(...);
}
```

---

# 16. Fase 12 — Shutdown

Implementar shutdown explícito.

Manejar:

```text
SIGINT
SIGTERM
```

Conceptualmente:

```ts
async function shutdown() {
  await application.close();
  await disconnectDatabase();
}
```

Debe ser idempotente.

Si `shutdown()` se ejecuta dos veces, no debe producir errores por recursos ya cerrados.

---

# 17. Fase 13 — Testing

Crear tests específicos para la nueva arquitectura.

## Authentication Container

Verificar:

```text
createAuthenticationContainer()
        ↓
crea correctamente
        ↓
todos los Use Cases
        ↓
Controller
```

## Dependency graph

Verificar que:

```text
LoginUseCase
    ↓
AuthRepository
PasswordHasher
TokenProvider
RefreshTokenRepository
RefreshTokenHasher
IdGenerator
```

sean las dependencias correctas.

## App Container

Verificar que:

```text
createAppContainer()
        ↓
authentication
        ↓
controller
useCases
```

esté correctamente construido.

## Singleton

Si el proyecto necesita singleton, probar inicialización concurrente.

No asumir que un singleton es obligatorio.

Si el App Composition Root se crea una sola vez durante bootstrap, preferir lifecycle explícito en lugar de agregar caching innecesario.

---

# 18. Fase 14 — Tests de aislamiento

Verificar que Core/Application pueda probarse sin:

```text
MongoDB real
Resend real
Redis real
HTTP real
```

Los Use Cases deben poder recibir mocks/fakes:

```ts
const useCase = new LoginUseCase(
  fakeAuthRepository,
  fakePasswordHasher,
  fakeTokenProvider,
  fakeRefreshRepository,
  fakeRefreshHasher,
  fakeIdGenerator,
);
```

Esto debe seguir funcionando.

---

# 19. Fase 15 — Validar dependencias entre módulos

Establecer una regla:

```text
Authentication ──────┐
Users ────────────────┤
Orders ───────────────┼──> Shared/Core abstractions
Payments ─────────────┘
```

Evitar:

```text
Authentication
      ↓
Users internal implementation
```

o:

```text
Users
   ↓
MongoAuthRepository
```

Los módulos deben comunicarse mediante contratos apropiados.

Si existe una dependencia entre módulos, documentarla antes de implementarla.

---

# 20. Fase 16 — Preparación para nuevos módulos

NO crear artificialmente:

```text
Users
Orders
Payments
Products
```

si todavía no existen.

En cambio, documentar el patrón:

```text
createXContainer()
```

Ejemplo:

```ts
export function createUsersContainer(
  dependencies: UsersDependencies,
): UsersContainer {
  // ...
}
```

El objetivo es que Authentication se convierta en el módulo de referencia.

---

# 21. Estructura objetivo

Adaptar la estructura a la estructura real del proyecto.

Una posible estructura:

```text
apps/
└── api/
    └── src/
        ├── composition/
        │   ├── app.container.ts
        │   └── infrastructure.container.ts
        │
        ├── modules/
        │   └── authentication/
        │       ├── authentication.container.ts
        │       ├── controllers/
        │       ├── routes/
        │       └── ...
        │
        ├── config/
        └── main.ts
```

Si el proyecto ya tiene una estructura diferente, NO mover carpetas únicamente por estética.

Mantener la estructura existente si cumple los principios arquitectónicos.

---

# 22. Reglas de dependencias

Establecer explícitamente:

```text
Core
  ↓
Ports / Interfaces

Infrastructure
  ↓
implements Ports

Composition Root
  ↓
conecta ambos

HTTP
  ↓
consume Controllers
```

Nunca:

```text
Core → Infrastructure
```

Nunca:

```text
Use Case → MongoDB
```

Nunca:

```text
Controller → Repository
```

Nunca:

```text
Route → new UseCase()
```

---

# 23. Validaciones obligatorias

Después de cada fase importante ejecutar las validaciones disponibles.

Buscar primero los scripts existentes en:

```text
package.json
turbo.json
```

Después ejecutar, según corresponda:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Y/o:

```bash
pnpm turbo run lint
pnpm turbo run typecheck
pnpm turbo run test
pnpm turbo run build
```

No asumir que todos existen.

---

# 24. Criterios de aceptación

La implementación solamente se considera terminada cuando:

### Arquitectura

* Existe un App Composition Root.
* Authentication tiene su propio Feature Container.
* Infrastructure tiene responsabilidades claramente definidas.
* No existe un God Container.
* No existe Service Locator.
* No se introdujo framework IoC.

### Dependency Injection

* Todas las dependencias son explícitas.
* Los Use Cases reciben sus dependencias por constructor.
* Los Controllers reciben sus Use Cases por constructor.
* Infrastructure implementa interfaces del Core.

### Lifecycle

* MongoDB se conecta una sola vez.
* MongoDB se desconecta una sola vez.
* Authentication no cierra infraestructura global compartida.
* Shutdown es seguro.
* No existen conexiones duplicadas.

### Configuración

* Los Use Cases no acceden a `process.env`.
* La configuración se valida en el Composition Root/configuration layer.

### Testing

* Los Use Cases pueden probarse sin infraestructura real.
* Authentication Container tiene cobertura de construcción.
* App Container puede construirse correctamente.
* Los tests existentes continúan funcionando.

### Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

deben pasar cuando dichos scripts existan.

---

# 25. Documentación

Actualizar la documentación arquitectónica del proyecto.

Crear o actualizar:

```text
docs/architecture/
```

con documentación sobre:

```text
01-overview.md
02-modular-architecture.md
03-dependency-injection.md
04-composition-root.md
05-infrastructure-lifecycle.md
06-feature-containers.md
```

No crear archivos duplicados si ya existen documentos equivalentes.

Documentar especialmente:

## Cómo crear un nuevo módulo

Ejemplo:

```text
1. Crear módulo.
2. Crear ports.
3. Crear Use Cases.
4. Crear adapters.
5. Crear Feature Container.
6. Registrar Feature Container en App Composition Root.
7. Registrar rutas.
8. Agregar tests.
```

---

# 26. Orden de ejecución

El agente DEBE seguir este orden:

```text
FASE 0
Inspección
   ↓
FASE 1
Diseño de responsabilidades
   ↓
FASE 2
Contrato de Feature Containers
   ↓
FASE 3
Authentication Container
   ↓
FASE 4
Infrastructure Composition
   ↓
FASE 5
App Composition Root
   ↓
FASE 6
Lifecycle
   ↓
FASE 7
Routes / HTTP integration
   ↓
FASE 8
Tests
   ↓
FASE 9
Documentation
   ↓
FASE 10
Full validation
```

No saltar directamente a la implementación.

---

# 27. Regla crítica para el agente

NO realizar una reescritura masiva.

Trabajar incrementalmente.

Antes de modificar una parte importante:

1. Explicar qué se encontró.
2. Explicar qué se va a cambiar.
3. Aplicar el cambio.
4. Ejecutar las pruebas relevantes.
5. Corregir cualquier regresión.
6. Continuar.

No cambiar lógica de negocio.

No cambiar contratos públicos sin necesidad.

No introducir abstracciones innecesarias.

No crear un framework arquitectónico sobre el framework arquitectónico.

La solución debe ser sencilla, explícita y mantenible.

---

# 28. Resultado final esperado

El resultado debe permitir que el proyecto evolucione de:

```text
Current

AuthContainer
    ├── Mongo
    ├── Security
    ├── Email
    ├── Use Cases
    └── Controller
```

a:

```text
Target

App Composition Root
│
├── Infrastructure
│
└── Modules
    │
    └── Authentication Container
        │
        ├── Use Cases
        └── Controller
```

y posteriormente:

```text
App Composition Root
│
├── Infrastructure
│
├── Authentication Container
├── Users Container
├── Orders Container
├── Payments Container
└── Future Modules
```

Mantener todos estos módulos dentro del mismo proceso y repositorio mientras sean parte del Monolito Modular.

La arquitectura debe conservar fronteras suficientemente claras para permitir extraer un módulo a un servicio independiente en el futuro si existe una razón técnica o de negocio para hacerlo.

---

# 29. Entrega final del agente

Al terminar, presentar:

## Cambios realizados

Lista de archivos creados/modificados/eliminados.

## Arquitectura

Explicar:

* App Composition Root.
* Infrastructure Composition.
* Authentication Container.
* Lifecycle.
* Dependency flow.

## Decisiones

Explicar cualquier decisión que se aparte del plan.

## Testing

Mostrar:

```text
Lint: PASS/FAIL
Typecheck: PASS/FAIL
Tests: PASS/FAIL
Build: PASS/FAIL
```

## Riesgos/deuda técnica

Enumerar cualquier problema que no haya sido posible resolver.

## Próximo paso

Indicar cómo implementar posteriormente:

```text
UsersContainer
OrdersContainer
PaymentsContainer
```

siguiendo exactamente el patrón establecido por Authentication.
