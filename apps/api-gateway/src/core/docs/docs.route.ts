import { NextFunction, Request, Response, Router } from "express";
import swaggerUi from "swagger-ui-express";

import { DocsInfoPath, DocsPrefix, DocsSpecPath } from "../../constants/docs.js";
import { DOCS_ENABLED, OPENAPI_SERVER_URL } from "../../config/env/index.js";
import { openApiDocument } from "./openapi.document.js";

/**
 * Documentation router.
 *
 * Mounted at `DocsPrefix` ("/api/docs") as a sibling of `routerApplication`, not
 * inside it: the business API lives under "/api/v1" and every route under that
 * prefix is a resource endpoint that answers with the API response envelope. The
 * raw spec and the UI are tooling, they have no envelope, and keeping them out
 * means a future v2 of the business API does not invalidate the docs URL.
 *
 * `DOCS_ENABLED` defaults to off in production. Swagger UI is a complete,
 * browsable inventory of every endpoint, every schema and every error code: on a
 * public deployment that is reconnaissance handed over for free, and it is not
 * something to enable by accident. The raw spec follows the same flag, because a
 * JSON document describing the whole surface is just as useful to an attacker as
 * the rendered one.
 */
const routerDocs: Router = Router();

// Machine-readable metadata, always available. Registered first and OUTSIDE the
// `DOCS_ENABLED` gate on purpose: a client generator or a monitoring job needs to
// know where the spec lives, and that is not the same as being allowed to browse
// it.
routerDocs.get(DocsInfoPath, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: openApiDocument.info.title,
      version: openApiDocument.info.version,
      openapi: openApiDocument.openapi,
      specification: DocsSpecPath,
      ui: {
        enabled: DOCS_ENABLED,
        path: DOCS_ENABLED ? DocsPrefix : undefined,
        reason: DOCS_ENABLED
          ? undefined
          : "Documentation is disabled. Set DOCS_ENABLED=true to expose the spec and the UI.",
      },
    },
  });
});

if (DOCS_ENABLED) {
  // Mounted with `get(DocsSpecPath)`, never with `use("/", handler)`.
  //
  // `use` matches EVERY path under the mount, so a UI handler registered that
  // way also answers `/openapi.json` — and it did: the spec endpoint returned
  // the UI's HTML with a 200, so every status-code check passed while the spec
  // was unreadable. `get` matches one path, which is what is wanted here.
  //
  // The mount order relative to the UI is NOT what matters: `get("/")` matches
  // only the mount root, so it cannot shadow a sibling `get("/openapi.json")`.
  // That was verified by mutation, because the opposite is the natural guess.
  routerDocs.get(DocsSpecPath, (_req: Request, res: Response) => {
    res.status(200).json(openApiDocument);
  });

  // Served from the object built in `openapi.document.ts`, so the rendered page
  // and the JSON can never disagree.
  //
  // The document is passed POSITIONALLY. `swaggerDocument` is the option name of
  // the standalone `swagger-ui` JavaScript API, not of `swagger-ui-express`:
  // passing it as an option matches a different overload and fails to typecheck.
  const ui = swaggerUi.setup(
    { ...openApiDocument, servers: [{ url: OPENAPI_SERVER_URL }] },
    { customSiteTitle: `${openApiDocument.info.title} ${openApiDocument.info.version}` },
  );

  // A human who types "/api/docs" wants the UI, not a JSON discovery payload, so
  // that is what the bare path answers with. The trailing slash matters:
  // swagger-ui-express emits relative asset URLs, and without it the browser
  // resolves them against "/api" and every one of them 404s.
  //
  // `originalUrl`, not `url`: once mounted, a request for "/api/docs" and one for
  // "/api/docs/" both arrive with `req.url === "/"`, so they cannot be told apart
  // here. `originalUrl` is not rewritten by the mount, so it can.
  routerDocs.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl === DocsPrefix) {
      res.redirect(302, `${DocsPrefix}/`);
      return;
    }
    ui(req, res, next);
  });

  // `swaggerUi.serve` is what serves `swagger-ui.css`, `swagger-ui-bundle.js` and
  // the favicons. `setup()` alone renders ONLY the HTML, so without this the page
  // loads and every one of its own assets answers 200 with the HTML page again: a
  // blank screen in the browser, while a status-code-only check reports green.
  routerDocs.use("/", swaggerUi.serve);
  routerDocs.get("/", ui);
}

export default routerDocs;
