import {
  AdminRoutes,
  ApiPrefix,
  ApiPrefixAuthRoutes,
  PrivateRoutes,
  PublicRoutes,
} from "../../constants/index.js";
import type {
  OpenApiDocument,
  OpenApiPathItem,
  OpenApiResponse,
  OpenApiSchema,
  OpenApiSecurityRequirement,
} from "./openapi.types.js";

const authBase = `${ApiPrefix}${ApiPrefixAuthRoutes}`;

const jsonContent = (schema: OpenApiSchema) => ({
  "application/json": { schema },
});

const registerPath = `${authBase}${PublicRoutes.REGISTER}`;
const loginPath = `${authBase}${PublicRoutes.LOGIN}`;
const forgotPasswordPath = `${authBase}${PublicRoutes.FORGOT_PASSWORD}`;
const resetPasswordPath = `${authBase}${PublicRoutes.RESET_PASSWORD}`;
const refreshPath = `${authBase}${PublicRoutes.REFRESH}`;
const logoutPath = `${authBase}${PublicRoutes.LOGOUT}`;
const mePath = `${authBase}${PrivateRoutes.ME}`;
const changeRolesPath = `${authBase}${PrivateRoutes.USERS}${AdminRoutes.CHANGE_USER_ROLES}`;

/**
 * Every non-2xx response leaves through `GlobalHandleError`, which wraps the
 * payload in the same envelope for all of them. One shared schema, referenced
 * five times, so a change to the envelope cannot be applied to only some codes.
 */
const errorResponse = (description: string): OpenApiResponse => ({
  description,
  content: jsonContent({ $ref: "#/components/schemas/ErrorResponse" }),
});

const unauthorizedResponse = errorResponse("Missing, expired or invalid access token.");

const bearerRequirement: OpenApiSecurityRequirement = { bearerAuth: [] };

const paths: Record<string, OpenApiPathItem> = {
  [changeRolesPath]: {
    put: {
      operationId: "changeUserRoles",
      summary: "Replace the role set of a user (admin only).",
      description:
        "Full replace, not a merge: the user ends up holding exactly the roles in `roles`. Every session of the target is revoked, because refresh tokens carry a snapshot of the roles and a demoted user would otherwise keep their old privileges until the token expires on its own.",
      tags: ["Administration"],
      security: [bearerRequirement],
      parameters: [
        {
          name: "uuid",
          in: "path",
          required: true,
          description: "Identifier of the user whose roles are being replaced.",
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: jsonContent({ $ref: "#/components/schemas/ChangeRolesRequest" }),
      },
      responses: {
        "200": {
          description: "Roles replaced.",
          content: jsonContent({ $ref: "#/components/schemas/ProfileResponse" }),
        },
        "400": errorResponse("Malformed body, blank role, invalid email or weak password."),
        "401": unauthorizedResponse,
        "403": errorResponse("The caller does not hold the admin role."),
      },
    },
  },

  [registerPath]: {
    post: {
      operationId: "registerUser",
      summary: "Register a new user.",
      description:
        "Creates an account with the `user` role. The email is normalized to lower case before it is validated and stored.",
      tags: ["Authentication"],
      security: [],
      requestBody: {
        required: true,
        content: jsonContent({ $ref: "#/components/schemas/RegisterRequest" }),
      },
      responses: {
        "201": {
          description: "User created.",
          content: jsonContent({ $ref: "#/components/schemas/RegisterResponse" }),
        },
        "400": errorResponse("Invalid email, weak password or malformed body."),
        "409": errorResponse("The email is already registered."),
        "429": errorResponse("Rate limit exceeded."),
      },
    },
  },

  [loginPath]: {
    post: {
      operationId: "loginUser",
      summary: "Exchange credentials for an access token.",
      description:
        "Returns a short lived access token in the body and sets the refresh token in an httpOnly cookie. This route has a dedicated rate limit on top of the global one.",
      tags: ["Authentication"],
      security: [],
      requestBody: {
        required: true,
        content: jsonContent({ $ref: "#/components/schemas/LoginRequest" }),
      },
      responses: {
        "200": {
          description: "Authenticated.",
          headers: {
            "Set-Cookie": {
              description: "httpOnly refresh token cookie.",
              schema: { type: "string" },
            },
          },
          content: jsonContent({ $ref: "#/components/schemas/TokenResponse" }),
        },
        "400": errorResponse("Invalid email or malformed body."),
        "401": errorResponse("Unknown email or wrong password."),
        "429": errorResponse("Too many login attempts."),
      },
    },
  },

  [refreshPath]: {
    post: {
      operationId: "refreshAccessToken",
      summary: "Rotate the access token using the refresh cookie.",
      description:
        "Reads the httpOnly refresh cookie, issues a new access token and rotates the cookie. A rejected token clears the cookie so the client stops replaying it.",
      tags: ["Authentication"],
      security: [],
      responses: {
        "200": {
          description: "Token refreshed.",
          headers: {
            "Set-Cookie": {
              description: "Rotated httpOnly refresh token cookie.",
              schema: { type: "string" },
            },
          },
          content: jsonContent({ $ref: "#/components/schemas/TokenResponse" }),
        },
        "401": errorResponse("Missing, expired, revoked or replayed refresh token."),
      },
    },
  },

  [logoutPath]: {
    post: {
      operationId: "logoutUser",
      summary: "Revoke the current session.",
      description:
        "Revokes every refresh token of the authenticated user and clears the refresh cookie. Requires a valid access token.",
      tags: ["Authentication"],
      security: [bearerRequirement],
      responses: {
        "204": { description: "Session revoked, refresh cookie cleared." },
        "401": unauthorizedResponse,
        "429": errorResponse("Rate limit exceeded."),
      },
    },
  },

  [forgotPasswordPath]: {
    post: {
      operationId: "requestPasswordReset",
      summary: "Ask for a password reset link.",
      description:
        "Always answers 202 with the same body, whether or not the address is registered. Revealing that difference would turn this route into an account enumeration oracle. The response is a 202 and not a 200: the work is queued behind a third-party email provider, and 202 says that honestly. A failed delivery is swallowed for the same reason, so the provider being down cannot be used to probe for accounts either.",
      tags: ["Authentication"],
      security: [],
      requestBody: {
        required: true,
        content: jsonContent({ $ref: "#/components/schemas/ForgotPasswordRequest" }),
      },
      responses: {
        "202": {
          description:
            "Accepted. Whether an email was actually sent is deliberately not disclosed.",
          content: jsonContent({ $ref: "#/components/schemas/GenericMessageResponse" }),
        },
        "400": errorResponse("Malformed body or invalid email."),
        "429": errorResponse("Too many reset requests from this address."),
      },
    },
  },

  [resetPasswordPath]: {
    post: {
      operationId: "confirmPasswordReset",
      summary: "Set a new password with a reset token.",
      description:
        "The token is single use and expires after one hour. Confirming revokes every session of the account: refresh tokens are live sessions, so a reset that left them standing would lock the door while a stolen session kept the key. Consuming a token also burns any other outstanding one, so the oldest email in the inbox stops working. If the email provider fails on the previous call, the token stays valid and the user can simply ask again.",
      tags: ["Authentication"],
      security: [],
      requestBody: {
        required: true,
        content: jsonContent({ $ref: "#/components/schemas/ResetPasswordRequest" }),
      },
      responses: {
        "200": {
          description: "Password changed and every session revoked.",
          content: jsonContent({ $ref: "#/components/schemas/RegisterResponse" }),
        },
        "400": errorResponse("Malformed body or weak password."),
        "401": errorResponse("Unknown, already used or expired reset token."),
        "429": errorResponse("Too many attempts from this address."),
      },
    },
  },

  [mePath]: {
    get: {
      operationId: "getCurrentProfile",
      summary: "Read the authenticated user profile.",
      tags: ["Authentication"],
      security: [bearerRequirement],
      responses: {
        "200": {
          description: "Current profile.",
          content: jsonContent({ $ref: "#/components/schemas/ProfileResponse" }),
        },
        "401": unauthorizedResponse,
        "429": errorResponse("Rate limit exceeded."),
      },
    },
  },
};

const schemas: Record<string, OpenApiSchema> = {
  RegisterRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", example: "user@example.com" },
      password: { type: "string", format: "password", minLength: 8 },
    },
  },
  ForgotPasswordRequest: {
    type: "object",
    required: ["email"],
    properties: {
      email: { type: "string", format: "email", example: "user@example.com" },
    },
  },
  ResetPasswordRequest: {
    type: "object",
    required: ["token", "password"],
    properties: {
      token: {
        type: "string",
        minLength: 1,
        description:
          "The raw token from the email link. Single use, expires after one hour. The strength rules are not duplicated here on purpose: they live in the domain.",
      },
      password: {
        type: "string",
        format: "password",
        minLength: 1,
        description:
          "At least 8 characters with an uppercase letter, a lowercase letter and a number. Enforced by the domain, not by this schema.",
      },
    },
  },
  GenericMessageResponse: {
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
    },
  },
  ChangeRolesRequest: {
    type: "object",
    required: ["roles"],
    description:
      "The complete intended role set. Required on purpose: omitting `roles` is a different mistake from sending an empty array.",
    properties: {
      roles: {
        type: "array",
        maxItems: 50,
        items: { type: "string", minLength: 1 },
        example: ["user", "admin"],
      },
    },
  },
  LoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", example: "user@example.com" },
      password: { type: "string", format: "password", minLength: 1 },
    },
  },
  RegisterResponse: {
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        required: ["uuid"],
        properties: { uuid: { type: "string", format: "uuid" } },
      },
    },
  },
  TokenResponse: {
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        required: ["accessToken"],
        properties: { accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" } },
      },
    },
  },
  ProfileResponse: {
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        required: ["uuid", "email", "roles"],
        properties: {
          uuid: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          roles: { type: "array", items: { type: "string" }, example: ["user"] },
        },
      },
    },
  },
  ErrorResponse: {
    type: "object",
    required: ["success", "error"],
    properties: {
      success: { type: "boolean", example: false },
      error: {
        type: "object",
        required: ["message", "code", "status", "timestamp"],
        properties: {
          message: { type: "string", example: "Invalid credentials." },
          code: { type: "string", example: "INVALID_CREDENTIALS" },
          status: { type: "integer", example: 401 },
          timestamp: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

export const openApiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "API Gateway",
    version: "1.0.0",
    description:
      "REST API of the API gateway. Every error response uses the same envelope, produced by the global error handler.",
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    {
      name: "Authentication",
      description: "Registration, session lifecycle and profile.",
    },
    {
      name: "Administration",
      description: "Privileged operations. Every route here requires the admin role.",
    },
  ],
  paths,
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token returned by login and refresh.",
      },
    },
  },
  security: [bearerRequirement],
};
