/**
 * Mount path for the documentation router.
 *
 * Kept outside `ApiPrefix` ("/api/v1") on purpose: the business API is versioned
 * and everything under it is a resource endpoint, while the documentation is
 * tooling. Mixing them means a future breaking version of the API would also
 * invalidate the URL clients use to read the docs.
 */
export const DocsPrefix: string = "/api/docs";

/** Path, relative to `DocsPrefix`, of the raw OpenAPI document. */
export const DocsSpecPath: string = "/openapi.json";

/**
 * Path, relative to `DocsPrefix`, of the machine-readable metadata payload.
 *
 * Distinct from the root, which serves the Swagger UI when it is enabled: a
 * human who types "/api/docs" wants a browsable page, and a job that wants JSON
 * should not have to accept HTML.
 */
export const DocsInfoPath: string = "/info";
