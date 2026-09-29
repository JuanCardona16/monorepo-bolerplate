import { defineConfig } from "vitest/config";

/**
 * Vitest config for the React 19 + Vite 8 web client.
 *
 * `environment: "jsdom"` because the app renders with `react-dom/client`'s
 * `createRoot` and routes with react-router 7's `createBrowserRouter`, both of
 * which require a real DOM plus the History API. jsdom was chosen over
 * happy-dom because it is a strict superset for the browser surface this stack
 * touches: happy-dom 20.14.5 is missing `matchMedia`, `Element.getAnimations`,
 * `ResizeObserver` and `IntersectionObserver`, all of which jsdom implements.
 *
 * This config intentionally does NOT re-declare the Vite plugins from
 * `vite.config.ts`. Vitest prefers `vitest.config.ts` over `vite.config.ts`, and
 * JSX is handled by the automatic runtime driven by `"jsx": "react-jsx"` in
 * `tsconfig.app.json`, so `@vitejs/plugin-react` (and the Babel React Compiler
 * pass) are not required to transform `.tsx` under test.
 */
export default defineConfig({
  test: {
    name: "web",
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
