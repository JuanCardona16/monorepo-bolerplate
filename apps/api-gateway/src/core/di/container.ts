import { disconnectDatabase } from "@repo/infrastructure/persistence/mongo";

import {
  createAuthenticationContainer,
  type AuthenticationContainer,
} from "./authentication.js";
import { createAuthInfrastructure } from "./infrastructure.js";

/**
 * App Composition Root (fino): ensambla infraestructura + módulos y owns el
 * lifecycle de cierre. Hoy el único módulo es Authentication; cuando haya un
 * segundo, se suma acá (`users: createUsersContainer(...)`) y el lifecycle de
 * MongoDB sube al arranque de la aplicación (ver nota en `createContainer`).
 *
 * DI manual y explícita, sin frameworks. Sin Service Locator: dependencias por
 * constructor, nunca `container.get("x")`.
 */
export interface AppContainer {
  authentication: AuthenticationContainer;
  close: () => Promise<void>;
}

export function createContainer(): AppContainer {
  const authentication = createAuthenticationContainer(createAuthInfrastructure());

  return {
    authentication,
    // MongoDB pertenece exclusivamente a auth hoy (único consumidor). Si un
    // segundo módulo lo usa, este `close` deja de desconectar y el arranque
    // (`core/index.ts`) pasa a ownear connect/disconnect.
    close: () => disconnectDatabase(),
  };
}

let cached: AppContainer | null = null;

export function getContainer(): AppContainer {
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
