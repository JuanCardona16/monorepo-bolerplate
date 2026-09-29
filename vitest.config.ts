import { defineConfig } from "vitest/config";

/**
 * Root Vitest configuration.
 *
 * Vitest 4 removed `vitest.workspace.ts`; workspace definitions now live in
 * `test.projects`. Each entry points at a package that owns its own
 * `vitest.config.ts`.
 *
 * `packages/typescript-config` and `packages/eslint-config` are config-only
 * packages with no scripts and are therefore intentionally excluded.
 *
 * Each project owns its environment: the four Node packages use
 * `environment: "node"`, while `apps/web` uses a DOM environment because it
 * renders with react-dom. Do NOT set a root-level `environment` expecting
 * projects to inherit it — a project loaded from its own config file is
 * standalone.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/core",
      "packages/security",
      "packages/infrastructure",
      "apps/api-gateway",
      "apps/web",
    ],
    environment: "node",
    globals: false,
  },
});
