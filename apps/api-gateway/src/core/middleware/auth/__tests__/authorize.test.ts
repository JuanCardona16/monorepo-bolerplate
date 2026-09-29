import type { TokenPayload, TokenProvider } from "@repo/core/authentication";
import express, { type Express } from "express";
import { describe, expect, it, vi } from "vitest";

import { startServer, type RunningServer } from "../../../../__tests__/helpers/startServer.js";
import { GlobalHandleError } from "../../../errors/GlobalHandleError.js";
import { HttpError } from "../../../errors/HttpError.js";
import { createAuthorize, type AuthenticatedRequest } from "../authorize.js";

const PAYLOAD: TokenPayload = { userUuid: "user-uuid-1", roles: ["admin", "user"] };

/** A TokenProvider whose `verify` outcome the test decides. */
function tokenProvider(verify: (token: string) => Promise<TokenPayload | null>): TokenProvider {
  return {
    generate: () => Promise.resolve("generated-token"),
    verify,
  };
}

/** Mounts `authorize` in front of a route that echoes `req.user`. */
async function appWith(provider: TokenProvider): Promise<RunningServer> {
  const app: Express = express();
  app.get("/private", createAuthorize(provider), (req, res) => {
    res.status(200).json({ success: true, data: (req as AuthenticatedRequest).user });
  });
  app.use(GlobalHandleError);
  return startServer(app);
}

interface ErrorBody {
  success: boolean;
  error: { message: string; code: string; status: number; timestamp: string };
}

async function get(
  server: RunningServer,
  headers: Record<string, string>,
): Promise<{ status: number; body: ErrorBody | { success: boolean; data: unknown } }> {
  const response = await fetch(`${server.baseUrl}/private`, { headers });
  return { status: response.status, body: (await response.json()) as never };
}

describe("createAuthorize", () => {
  describe("rejections", () => {
    it("answers 401 when the Authorization header is missing", async () => {
      const server = await appWith(tokenProvider(() => Promise.resolve(PAYLOAD)));

      try {
        const { status, body } = await get(server, {});

        expect(status).toBe(401);
        expect((body as ErrorBody).error.code).toBe("UNAUTHORIZED");
        expect((body as ErrorBody).error.status).toBe(401);
      } finally {
        await server.close();
      }
    });

    it("answers 401 when the header carries no token after the scheme", async () => {
      const server = await appWith(tokenProvider(() => Promise.resolve(PAYLOAD)));

      try {
        const { status, body } = await get(server, { Authorization: "Bearer" });

        expect(status).toBe(401);
        expect((body as ErrorBody).error.code).toBe("UNAUTHORIZED");
      } finally {
        await server.close();
      }
    });

    it("answers 401 when the token provider rejects the token", async () => {
      const verify = vi.fn(() => Promise.resolve(null));
      const server = await appWith(tokenProvider(verify));

      try {
        const { status, body } = await get(server, { Authorization: "Bearer bad-token" });

        expect(status).toBe(401);
        expect((body as ErrorBody).error.code).toBe("UNAUTHORIZED");
        expect(verify).toHaveBeenCalledWith("bad-token");
      } finally {
        await server.close();
      }
    });

    it("forwards a throwing token provider to the global handler instead of swallowing it", async () => {
      const server = await appWith(
        tokenProvider(() => Promise.reject(new Error("jwt malformed"))),
      );

      try {
        const { status, body } = await get(server, { Authorization: "Bearer broken" });

        expect(status).toBe(500);
        expect((body as ErrorBody).error.code).toBe("INTERNAL_ERROR");
      } finally {
        await server.close();
      }
    });

    it("raises HttpError(401, UNAUTHORIZED) so the status is decided in one place", async () => {
      const errors: unknown[] = [];
      const next = (error?: unknown) => {
        errors.push(error);
      };

      await createAuthorize(tokenProvider(() => Promise.resolve(PAYLOAD)))(
        { headers: {} } as never,
        {} as never,
        next as never,
      );

      expect(errors[0]).toBeInstanceOf(HttpError);
      expect((errors[0] as HttpError).status).toBe(401);
      expect((errors[0] as HttpError).code).toBe("UNAUTHORIZED");
      expect((errors[0] as HttpError).message).toBe("Not authorized.");
    });
  });

  describe("acceptance", () => {
    it("lets a valid token through and attaches the user to the request", async () => {
      const server = await appWith(tokenProvider(() => Promise.resolve(PAYLOAD)));

      try {
        const { status, body } = await get(server, { Authorization: "Bearer good-token" });

        expect(status).toBe(200);
        // The payload's `userUuid` is renamed to `uuid` on the request context.
        expect(body).toEqual({
          success: true,
          data: { uuid: PAYLOAD.userUuid, roles: PAYLOAD.roles },
        });
      } finally {
        await server.close();
      }
    });

    it("never leaks the access token into the request context", async () => {
      const seen: unknown[] = [];
      const provider = tokenProvider(() => Promise.resolve(PAYLOAD));
      const app: Express = express();
      app.get("/private", createAuthorize(provider), (req, res) => {
        seen.push((req as AuthenticatedRequest).user);
        res.status(200).json({ success: true });
      });
      const server = await startServer(app);

      try {
        await fetch(`${server.baseUrl}/private`, { headers: { Authorization: "Bearer good-token" } });

        expect(seen[0]).not.toHaveProperty("token");
        expect(seen[0]).not.toHaveProperty("accessToken");
      } finally {
        await server.close();
      }
    });

    it("aliases the provider's roles array instead of copying it", async () => {
      // Documents current behaviour: `roles: payload.roles` keeps the same
      // reference, so mutating the request context also mutates the payload the
      // TokenProvider handed over. Harmless today (each verify is a fresh
      // decode), but it means the array is not defensively isolated.
      const provider = tokenProvider(() => Promise.resolve(PAYLOAD));
      const app: Express = express();
      app.get("/private", createAuthorize(provider), (req, res) => {
        (req as AuthenticatedRequest).user?.roles.push("mutated");
        res.status(200).json({ success: true });
      });
      const server = await startServer(app);

      try {
        await fetch(`${server.baseUrl}/private`, { headers: { Authorization: "Bearer good-token" } });

        expect(PAYLOAD.roles).toEqual(["admin", "user", "mutated"]);
      } finally {
        await server.close();
        PAYLOAD.roles.splice(0, PAYLOAD.roles.length, "admin", "user");
      }
    });

    it("calls next with no argument when the token is accepted", async () => {
      const calls: unknown[] = [];
      const next = (error?: unknown) => {
        calls.push(error);
      };

      await createAuthorize(tokenProvider(() => Promise.resolve(PAYLOAD)))(
        { headers: { authorization: "Bearer good-token" } } as never,
        {} as never,
        next as never,
      );

      expect(calls).toEqual([undefined]);
    });

    it("reads the second whitespace separated segment regardless of the scheme", async () => {
      // Documents current behaviour: the scheme is not checked for being "Bearer".
      const verify = vi.fn(() => Promise.resolve(PAYLOAD));
      const provider = tokenProvider(verify);
      const app: Express = express();
      app.get("/private", createAuthorize(provider), (_req, res) => {
        res.status(200).json({ success: true });
      });
      const server = await startServer(app);

      try {
        const response = await fetch(`${server.baseUrl}/private`, {
          headers: { Authorization: "Basic good-token" },
        });

        expect(response.status).toBe(200);
        expect(verify).toHaveBeenCalledWith("good-token");
      } finally {
        await server.close();
      }
    });
  });
});
