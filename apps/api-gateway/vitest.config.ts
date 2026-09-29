import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-gateway",
    environment: "node",
    globals: false,
    // Runs before any test module is imported, so `config/env/index.ts` finds
    // its variables during its own import. Three suites in a row failed on CI
    // only because they read `required()` before anything set them.
    setupFiles: ["./src/test/setupEnv.ts"],
    include: ["src/**/*.{test,spec}.ts"],
  },
});
