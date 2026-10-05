import express, { type Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DocsInfoPath, DocsPrefix, DocsSpecPath } from "../constants/docs.js";
import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * Documentation disabled.
 *
 * This lives in its own file because `docs.route.ts` reads `DOCS_ENABLED` once,
 * at import time, and Vitest caches modules per file. Setting the variable in a
 * `beforeEach` of the enabled suite would come too late and the assertions would
 * be testing the enabled router while believing they tested the disabled one.
 *
 * The `vi.hoisted` block is the only place the environment can be set early
 * enough, for the same reason `app.http.test.ts` needs it: the env module runs
 * `required()` while it is being imported.
 */
vi.hoisted(() => {
  process.env.NODE_ENV = "production";
  process.env.DOCS_ENABLED = "false";
  process.env.TOKEN_SECRET_KEY = "test-only-token-secret";
  process.env.REFRESH_TOKEN_SECRET_KEY = "test-only-refresh-secret";
  process.env.MONGODB_URI = "mongodb://unused:unused@127.0.0.1:27017/unused";
});

const { routerDocs } = await import("../core/docs/index.js");

function buildDocsApp(): Express {
  const app: Express = express();
  app.use(DocsPrefix, routerDocs);
  return app;
}

describe("documentation when DOCS_ENABLED is false", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer(buildDocsApp());
  });

  afterAll(async () => {
    await server.close();
  });

  // Swagger UI is a browsable inventory of every endpoint, every schema and
  // every error code. Leaving it on in production hands that over for free.
  it("does not serve the raw specification", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}${DocsSpecPath}`);

    expect(response.status).toBe(404);
  });

  it("does not serve the UI", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}/`);

    expect(response.status).toBe(404);
  });

  it("does not redirect to the UI", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}`, { redirect: "manual" });

    expect(response.status).toBe(404);
  });

  // The metadata stays available on purpose: a client generator or a monitoring
  // job needs to know where the spec lives, and that is not the same as being
  // allowed to browse it.
  it("still answers where the specification would be, and says it is off", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}${DocsInfoPath}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { specification: string; ui: { enabled: boolean; path?: string; reason?: string } };
    };
    expect(body.data.specification).toBe(DocsSpecPath);
    expect(body.data.ui.enabled).toBe(false);
    expect(body.data.ui.path).toBeUndefined();
    expect(body.data.ui.reason).toMatch(/DOCS_ENABLED/);
  });
});
