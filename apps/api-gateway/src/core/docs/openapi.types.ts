/**
 * Minimal, hand-written subset of the OpenAPI 3.1 object model.
 *
 * The spec is declared as a plain typed object instead of being generated from
 * JSDoc annotations on the route modules. Annotations would have to live in the
 * route files themselves, which makes the documentation part of the routing
 * layer and couples it to whoever happens to own those files. A separate module
 * keeps the contract in one readable place and type-checked: a typo in a path or
 * a missing response code is a compile error, not something a reviewer has to
 * notice by eye.
 *
 * Only the keywords this gateway actually uses are modelled. Unknown keywords
 * are not allowed, which is deliberate: it stops the document from silently
 * drifting into a shape nothing renders.
 */

export type OpenApiHttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type OpenApiSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiTag {
  name: string;
  description?: string;
}

export interface OpenApiSchema {
  /** Pointer to a schema in `components.schemas`, e.g. `#/components/schemas/ErrorResponse`. */
  $ref?: string;
  type?: OpenApiSchemaType;
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: Array<string | number | boolean>;
  example?: unknown;
  additionalProperties?: boolean | OpenApiSchema;
  minLength?: number;
  maxItems?: number;
  nullable?: boolean;
}

export interface OpenApiMediaType {
  schema: OpenApiSchema;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenApiMediaType>;
}

export interface OpenApiHeader {
  description?: string;
  schema: OpenApiSchema;
}

export interface OpenApiResponse {
  description: string;
  headers?: Record<string, OpenApiHeader>;
  content?: Record<string, OpenApiMediaType>;
}

/** Maps a security scheme name to the scopes it requires. An empty array means "no scopes". */
export interface OpenApiSecurityRequirement {
  [schemeName: string]: string[];
}

export interface OpenApiSecurityScheme {
  type: "http";
  scheme: "bearer";
  bearerFormat?: string;
  description?: string;
}

export type OpenApiParameterLocation = "query" | "header" | "path" | "cookie";

export interface OpenApiParameter {
  name: string;
  in: OpenApiParameterLocation;
  description?: string;
  required?: boolean;
  schema: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  /** Per-operation override of the document level security. An empty array marks a public operation. */
  security?: OpenApiSecurityRequirement[];
}

export type OpenApiPathItem = Partial<Record<OpenApiHttpMethod, OpenApiOperation>>;

export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

export interface OpenApiDocument {
  openapi: string;
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  tags?: OpenApiTag[];
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  security?: OpenApiSecurityRequirement[];
}
