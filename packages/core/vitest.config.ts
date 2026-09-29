import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/core",
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.ts"],
  },
});
