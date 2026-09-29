import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-gateway",
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.ts"],
  },
});
