import express, { type Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DocsInfoPath, DocsPrefix, DocsSpecPath } from "../constants/docs.js";
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
 *
 * `DOCS_ENABLED` is deliberately left UNSET here, so this suite exercises the
 * documented default: documentation is ON outside production. `setupEnv.ts` used
 * to pin it to "true", which silently removed the `undefined` branch from the
 * repo's coverage while this very comment still claimed it was covered.
 *
 * The disabled case needs its own file: the router
 * reads the flag once, at import time, and a module cannot be re-imported with a
 * different environment in the same process.
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

  it("serves the raw specification", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}${DocsSpecPath}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as typeof openApiDocument;
    expect(body).toEqual(openApiDocument);
  });

  it("serves the Swagger UI at the docs root, because that is what a human types", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}/`, { redirect: "manual" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("swagger-ui");
  });

  it("redirects the bare path to the trailing-slash form", async () => {
    // Without the slash, swagger-ui-express emits relative asset URLs that the
    // browser resolves against "/api" instead of "/api/docs/", and every one of
    // them 404s. The redirect is what makes the UI usable at all.
    const response = await fetch(`${server.baseUrl}${DocsPrefix}`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${DocsPrefix}/`);
  });

  it("serves the UI's own assets, so the page is not a broken shell", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}/swagger-ui.css`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
  });

  it("answers the info path with a discovery payload instead of a 404", async () => {
    const response = await fetch(`${server.baseUrl}${DocsPrefix}${DocsInfoPath}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: { specification: string; ui: { enabled: boolean; path?: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.specification).toBe(DocsSpecPath);
    expect(body.data.ui.enabled).toBe(true);
    expect(body.data.ui.path).toBe(DocsPrefix);
  });

  it("sits outside the versioned business prefix", () => {
    expect(DocsPrefix.startsWith("/api/v1")).toBe(false);
  });

  // The default is a documented contract, not an implementation detail: a
  // developer with a fresh clone and no `.env.local` must still get the docs.
  // Asserting it explicitly keeps the value from being "covered" only by
  // accident, the way it was when the setup file pinned it to "true".
  it("leaves DOCS_ENABLED unset so the suite pins the default, not a value", () => {
    expect(process.env.DOCS_ENABLED).toBeUndefined();
    expect(process.env.NODE_ENV).toBe("test");
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

  it("documents both password reset operations as public", () => {
    // A reset route documented as requiring a bearer token would be unusable
    // for the only people who need it: they have no access token.
    expect(openApiDocument.paths["/api/v1/auth/forgot-password"]?.post?.operationId).toBe(
      "requestPasswordReset",
    );
    expect(openApiDocument.paths["/api/v1/auth/reset-password"]?.post?.operationId).toBe(
      "confirmPasswordReset",
    );

    for (const path of ["/api/v1/auth/forgot-password", "/api/v1/auth/reset-password"]) {
      expect(openApiDocument.paths[path]?.post?.security).toEqual([]);
    }
  });

  it("documents the silent 202 and the reset failure codes", () => {
    // The 202 is the contract that makes `forgot` safe: one response, whatever
    // the address was. If it ever became a 200 with a per-case body, the
    // enumeration guarantee would be gone and nothing would say so.
    expect(operationCodes("/api/v1/auth/forgot-password", "post")).toEqual(
      expect.arrayContaining(["202", "400", "429"]),
    );
    expect(operationCodes("/api/v1/auth/reset-password", "post")).toEqual(
      expect.arrayContaining(["200", "400", "401", "429"]),
    );
  });

  it("does not document a 429 only, forgetting the real outcomes", () => {
    // Cheap guard against a path entry that documents the limiter and nothing
    // else, which is what a route added in a hurry tends to look like.
    const forgot = operationCodes("/api/v1/auth/forgot-password", "post");
    const reset = operationCodes("/api/v1/auth/reset-password", "post");

    expect(forgot.length).toBeGreaterThan(2);
    expect(reset.length).toBeGreaterThan(2);
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
