import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * Admin-only route coverage.
 *
 * These tests assert the three-way split that matters for a permission boundary:
 * anonymous is 401 (and must not learn the route exists), an authenticated
 * non-admin is 403, and an admin is 200. A guard that answers 403 to an
 * anonymous caller leaks the route's existence.
 *
 * `vi.hoisted` is the only place the env can be set early enough: the env module
 * runs `required()` while it is imported, and a plain statement at the top of a
 * test file executes *after* the imports. Without this, the suite only passed
 * locally because a developer `.env.local` happened to define the variables.
 */
const hoisted = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
  process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
  process.env.MONGODB_URI = "mongodb://unused:unused@127.0.0.1:27017/unused";

  return {
    changeUserRolesUseCase: {
      execute: vi.fn(async (input: { targetUserUuid: string; roles: string[] }) => ({
        uuid: input.targetUserUuid,
        email: "target@example.com",
        roles: new Set(input.roles),
      })),
    },
  };
});

const h = hoisted;

vi.mock("../core/di/container.js", async () => {
  const actual =
    await vi.importActual<typeof import("../core/di/container.js")>(
      "../core/di/container.js"
    );
  const { createAuthorize } = await import(
    "../core/middleware/auth/authorize.js"
  );
  return {
    ...actual,
    getContainer: () => ({
      authController,
      authorize: createAuthorize(tokenProvider),
      ...deps,
    }),
  };
});

import { AuthController } from "../features/authentication/controllers/auth.controller.js";
import { JwtTokenProvider } from "@repo/security";

const SECRET = "test-only-secret-not-used-anywhere-else";
const tokenProvider = new JwtTokenProvider(SECRET, "15m");

const notFound = vi.fn(async () => {
  throw Object.assign(new Error("not found"), { status: 404 });
});
const authController = new AuthController(
  notFound as never,
  notFound as never,
  notFound as never,
  notFound as never,
  notFound as never,
  hoisted.changeUserRolesUseCase as never,
);
const deps = { changeUserRolesUseCase: hoisted.changeUserRolesUseCase };

const ROLES_URL = "/api/v1/auth/users/target-uuid/roles";

describe("PUT /api/v1/auth/users/:uuid/roles", () => {
  let server: RunningServer;
  let application: unknown;

  beforeAll(async () => {
    const mod = await import("../core/app.js");
    application = mod.default;
    server = await startServer(application as never);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    hoisted.changeUserRolesUseCase.execute.mockClear();
  });

  async function callAs(roles: string[] | null): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (roles) {
      const token = await tokenProvider.generate({ userUuid: "admin-uuid", roles });
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${server.baseUrl}${ROLES_URL}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ roles: ["admin"] }),
    });
  }

  it("answers 401 without an Authorization header", async () => {
    const response = await callAs(null);

    expect(response.status).toBe(401);
    expect(h.changeUserRolesUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 401 for a non-Bearer scheme", async () => {
    const response = await fetch(`${server.baseUrl}${ROLES_URL}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Basic abc" },
      body: JSON.stringify({ roles: ["admin"] }),
    });

    expect(response.status).toBe(401);
    expect(h.changeUserRolesUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 403 for an authenticated caller without the admin role", async () => {
    const response = await callAs(["user"]);

    expect(response.status).toBe(403);
    expect(h.changeUserRolesUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 403 when the token carries no roles at all", async () => {
    const response = await callAs([]);

    expect(response.status).toBe(403);
  });

  it("matches the admin role regardless of casing in the token", async () => {
    const response = await callAs(["ADMIN"]);

    expect(response.status).toBe(200);
  });

  it("answers 200 for an admin and forwards the uuid and roles", async () => {
    const response = await callAs(["admin"]);
    const body = (await response.json()) as { data?: { roles?: string[] } };

    expect(response.status).toBe(200);
    expect(h.changeUserRolesUseCase.execute).toHaveBeenCalledWith({
      targetUserUuid: "target-uuid",
      roles: ["admin"],
    });
    expect(body.data?.roles).toEqual(["admin"]);
  });

  it("answers 400 when the roles array is missing", async () => {
    const token = await tokenProvider.generate({ userUuid: "admin-uuid", roles: ["admin"] });
    const response = await fetch(`${server.baseUrl}${ROLES_URL}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(h.changeUserRolesUseCase.execute).not.toHaveBeenCalled();
  });

  it("answers 400 when a role is an empty string", async () => {
    const token = await tokenProvider.generate({ userUuid: "admin-uuid", roles: ["admin"] });
    const response = await fetch(`${server.baseUrl}${ROLES_URL}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roles: ["admin", ""] }),
    });

    expect(response.status).toBe(400);
  });
});
