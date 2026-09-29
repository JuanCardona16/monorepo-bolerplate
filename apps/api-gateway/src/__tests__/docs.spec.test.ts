import express, { type Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DocsPrefix, DocsSpecPath } from "../constants/docs.js";
// Imported through the barrel on purpose: it is the entry point `app.ts` will
// use, so exercising it here keeps the export from rotting unnoticed.
import { openApiDocument, routerDocs } from "../core/docs/index.js";
import { startServer, type RunningServer } from "./helpers/startServer.js";

/**
 * The docs router is mounted on a bare app instead of the real one on purpose.
 * `app.ts` builds its middleware stack around `getContainer()`, so importing it
 * would drag the database container into a test about a static document. What
 * matters here is the mount path and the payload, both of which are fully
 * determined by the router plus the prefix constant.
 */
function buildDocsApp(): Express {
  const app: Express = express();
  app.use(DocsPrefix, routerDocs);
  return app;
}

describe("openapi documentation endpoint", () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer(buildDocsApp());
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves the raw specification at the docs root", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}${DocsSpecPath}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as typeof openApiDocument;
    expect(body).toEqual(openApiDocument);
  });

  it("answers the docs root with a discovery payload instead of a 404", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: { specification: string; ui: { enabled: boolean } };
    };
    expect(body.success).toBe(true);
    expect(body.data.specification).toBe(DocsSpecPath);
    expect(body.data.ui.enabled).toBe(false);
  });

  it("sits outside the versioned business prefix", () => {
    expect(DocsPrefix.startsWith("/api/v1")).toBe(false);
  });
});

describe("openapi document", () => {
  const paths = Object.keys(openApiDocument.paths);
  const operationCodes = (path: string, method: "get" | "post") =>
    Object.keys(openApiDocument.paths[path]?.[method]?.responses ?? {});

  it("declares the OpenAPI version and the five auth operations", () => {
    expect(openApiDocument.openapi).toMatch(/^3\./);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
      ]),
    );

    const ids = paths
      .map((path) => openApiDocument.paths[path]?.post?.operationId)
      .filter((id): id is string => typeof id === "string");
    expect(ids).toEqual(
      expect.arrayContaining(["registerUser", "loginUser", "refreshAccessToken", "logoutUser"]),
    );
    expect(openApiDocument.paths["/api/v1/auth/me"]?.get?.operationId).toBe("getCurrentProfile");
  });

  it("documents the error codes the gateway can actually return", () => {
    expect(operationCodes("/api/v1/auth/register", "post")).toEqual(
      expect.arrayContaining(["400", "409"]),
    );
    expect(operationCodes("/api/v1/auth/login", "post")).toEqual(
      expect.arrayContaining(["400", "401", "429"]),
    );
    expect(operationCodes("/api/v1/auth/logout", "post")).toEqual(
      expect.arrayContaining(["401"]),
    );
    expect(operationCodes("/api/v1/auth/me", "get")).toEqual(expect.arrayContaining(["401"]));
  });

  it("references only schema refs that exist in components", () => {
    const declared = Object.keys(openApiDocument.components?.schemas ?? {});

    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== "object" || node === null) {
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") {
          refs.push(value);
          continue;
        }
        walk(value);
      }
    };
    walk(openApiDocument);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const name = ref.replace("#/components/schemas/", "");
      expect(declared).toContain(name);
    }
  });
});
