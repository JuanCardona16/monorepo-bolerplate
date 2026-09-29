import express, { type Express, type RequestHandler } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { startServer, type RunningServer } from "../../../../__tests__/helpers/startServer.js";
import { GlobalHandleError } from "../../../errors/GlobalHandleError.js";
import { HttpError } from "../../../errors/HttpError.js";
import { validateWithZod } from "../validateWithZod.js";

const schema = z.object({ email: z.string().email(), password: z.string().min(8) });

let server: RunningServer;

interface ErrorBody {
  success: boolean;
  error: { message: string; code: string; status: number; timestamp: string };
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";

  const app: Express = express();
  app.use(express.json());
  app.post("/submit", validateWithZod(schema, "body") as RequestHandler, (_req, res) => {
    res.status(200).json({ success: true });
  });
  app.use(GlobalHandleError);

  server = await startServer(app);
});

afterAll(async () => {
  await server?.close();
});

async function post(body: unknown): Promise<{ status: number; body: ErrorBody }> {
  const response = await fetch(`${server.baseUrl}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as ErrorBody };
}

describe("validateWithZod", () => {
  it("passes a valid payload through to the handler", async () => {
    const { status, body } = await post({ email: "user@example.com", password: "Password1" });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("short circuits the handler on an invalid payload", async () => {
    const { status } = await post({ email: "nope", password: "short" });

    expect(status).toBe(400);
  });

  it("raises a VALIDATION_ERROR with status 400", async () => {
    const { body } = await post({ email: "nope", password: "Password1" });

    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.status).toBe(400);
  });

  it("joins every Zod message into a single readable string", async () => {
    const { body } = await post({ email: "nope", password: "short" });

    expect(body.error.message).toBe(
      "Invalid email, String must contain at least 8 character(s)",
    );
  });

  it("validates the query string when asked to", async () => {
    const scoped = express();
    scoped.get("/search", validateWithZod(schema, "query") as RequestHandler, (_req, res) => {
      res.status(200).json({ success: true });
    });
    scoped.use(GlobalHandleError);
    const queryServer = await startServer(scoped);

    try {
      const ok = await fetch(`${queryServer.baseUrl}/search?email=user@example.com&password=Password1`);
      const bad = await fetch(`${queryServer.baseUrl}/search?email=nope&password=Password1`);

      expect(ok.status).toBe(200);
      expect(bad.status).toBe(400);
    } finally {
      await queryServer.close();
    }
  });

  it("builds an HttpError, not a bare ZodError, so the status map can read it", () => {
    const errors: unknown[] = [];
    const next = (error?: unknown) => {
      errors.push(error);
    };

    validateWithZod(schema, "body")(
      { body: { email: "nope" } } as never,
      {} as never,
      next as never,
    );

    expect(errors[0]).toBeInstanceOf(HttpError);
    expect((errors[0] as HttpError).status).toBe(400);
    expect((errors[0] as HttpError).code).toBe("VALIDATION_ERROR");
  });

  it("forwards a non-Zod throw untouched so it reaches the global handler", () => {
    const throwing = z.object({}).transform(() => {
      throw new TypeError("not a zod problem");
    });
    const errors: unknown[] = [];
    const next = (error?: unknown) => {
      errors.push(error);
    };

    validateWithZod(throwing, "body")({ body: {} } as never, {} as never, next as never);

    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it("calls next with no argument when the payload is valid", () => {
    const calls: unknown[] = [];
    const next = (error?: unknown) => {
      calls.push(error);
    };

    validateWithZod(schema, "body")(
      { body: { email: "user@example.com", password: "Password1" } } as never,
      {} as never,
      next as never,
    );

    expect(calls).toEqual([undefined]);
  });
});
