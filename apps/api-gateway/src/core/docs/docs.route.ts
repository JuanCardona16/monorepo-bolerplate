import { Request, Response, Router } from "express";

import { DocsSpecPath } from "../../constants/docs.js";
import { openApiDocument } from "./openapi.document.js";

/**
 * Documentation router.
 *
 * It is mounted at `DocsPrefix` ("/api/docs") as a sibling of
 * `routerApplication`, not inside it: the business API lives under "/api/v1" and
 * every route under that prefix is a resource endpoint that answers with the
 * response envelope of the API. The raw spec is tooling, it has no envelope, and
 * keeping it out means a future v2 of the business API does not invalidate the
 * documentation URL.
 *
 * There is no HTML here on purpose: rendering Swagger UI needs
 * `swagger-ui-express`, which is not a dependency of this package yet. See
 * `docs.route.ts` consumers for the mount, and add the UI once the dependency
 * lands instead of hand-rolling a page that would drift from the document.
 */
const routerDocs: Router = Router();

routerDocs.get(DocsSpecPath, (_req: Request, res: Response) => {
  res.status(200).json(openApiDocument);
});

// Entry point for whoever opens the docs root by hand. Without this the path
// would fall through to the global 404 handler, which is a confusing answer to
// a request that is not a missing resource.
routerDocs.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: openApiDocument.info.title,
      version: openApiDocument.info.version,
      openapi: openApiDocument.openapi,
      specification: DocsSpecPath,
      ui: {
        enabled: false,
        reason: "swagger-ui-express is not installed in this package yet.",
      },
    },
  });
});

export default routerDocs;
