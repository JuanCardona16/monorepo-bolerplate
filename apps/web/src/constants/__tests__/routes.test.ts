import { describe, expect, it } from "vitest";

import { API_PREFIX, ApiPaths, AppRoutes } from "../routes.js";

/**
 * These constants are the contract between the web client and the gateway, so
 * the suite pins the literal values rather than deriving them from
 * `API_PREFIX`. A silent change here would only surface as a runtime 404.
 */
describe("ApiPaths", () => {
  it("builds every auth path under the v1 prefix", () => {
    expect(API_PREFIX).toBe("/api/v1");
    expect(ApiPaths.LOGIN).toBe("/api/v1/auth/login");
    expect(ApiPaths.REGISTER).toBe("/api/v1/auth/register");
    expect(ApiPaths.REFRESH).toBe("/api/v1/auth/refresh");
    expect(ApiPaths.LOGOUT).toBe("/api/v1/auth/logout");
    expect(ApiPaths.ME).toBe("/api/v1/auth/me");
  });

  it("keeps the refresh path suffix the apiClient 401 guard relies on", () => {
    // `apiClient` skips the refresh-retry loop with
    // `!path.endsWith("/auth/refresh")`. Renaming the path without updating
    // that guard would make a refresh 401 recurse forever.
    expect(ApiPaths.REFRESH.endsWith("/auth/refresh")).toBe(true);
  });
});

describe("AppRoutes", () => {
  it("pins the client-side paths", () => {
    expect(AppRoutes.HOME).toBe("/");
    expect(AppRoutes.LOGIN).toBe("/login");
    expect(AppRoutes.REGISTER).toBe("/register");
  });

  it("does not collide with the API paths", () => {
    const clientPaths = Object.values(AppRoutes);
    const apiPaths = Object.values(ApiPaths);

    for (const client of clientPaths) {
      expect(apiPaths).not.toContain(client);
    }
  });
});
