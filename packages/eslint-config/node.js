import globals from "globals";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "./base.js";

/**
 * Shared flat config for backend Node.js + TypeScript packages
 * (`core`, `security`, `infrastructure`, `api-gateway`).
 *
 * `apps/web` keeps its own Vite config; this one is packages-only.
 * Non-type-checked rules on purpose: no project service, so no
 * per-package `tsconfig` wiring and fast runs.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  ...baseConfig,
  // Scoped to TS files by typescript-eslint itself, so it wins over the
  // unscoped babel parser from base for `**/*.ts`.
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ["dist/**", "coverage/**"],
  },
];
