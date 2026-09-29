import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// `RouterProvider` is imported from the same `react-router` entry point the
// application components use. Importing it from `react-router/dom` instead
// resolves to a separate module instance whose router context `Layout` never
// sees, which fails every render with "useNavigate() may be used only in the
// context of a <Router> component".
import { RouterProvider } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppRoutes } from "../../../constants/index.js";
import { useAuthStore } from "../../../features/auth/stores/auth.js";
import { createTestQueryClient } from "../../../test/renderWithProviders.js";
import { router } from "../router.js";

/**
 * `router` is a module-level singleton created by `createBrowserRouter`, and it
 * captured the location once at import time. `window.history.pushState` after
 * that does not move the router, so each case drives it through
 * `router.navigate` and awaits the transition.
 */
async function goTo(path: string): Promise<void> {
  await router.navigate(path);
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ accessToken: null });
});

/** Collects the declared path of every route, ignoring pathless layout routes. */
function collectPaths(
  routes: { path?: string; children?: unknown[] }[],
  parentPath = "",
): string[] {
  const paths: string[] = [];
  for (const route of routes) {
    if (route.path) {
      const fullPath = `${parentPath}/${route.path}`.replace(/\/{2,}/g, "/");
      paths.push(fullPath);
    }
    if (Array.isArray(route.children)) {
      paths.push(
        ...collectPaths(route.children as Parameters<typeof collectPaths>[0], parentPath),
      );
    }
  }
  return paths;
}

describe("router configuration", () => {
  it("mounts every application route under a single layout", () => {
    const paths = collectPaths(router.routes as Parameters<typeof collectPaths>[0]);

    expect(paths.sort()).toEqual(["/", "/login", "/register"]);
  });

  it("nests the routes inside the layout element", () => {
    const root = router.routes[0];

    expect(root?.element).toBeDefined();
    expect(root?.children).toHaveLength(3);
  });

  it("registers no wildcard or catch-all route", () => {
    const paths = collectPaths(router.routes as Parameters<typeof collectPaths>[0]);

    for (const path of paths) {
      expect(path).not.toBe("*");
    }
  });
});

describe("router navigation with RouterProvider", () => {
  function renderRouter() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  it("redirects the home route to login when signed out", async () => {
    await goTo(AppRoutes.HOME);

    renderRouter();

    expect(await screen.findByRole("heading", { name: "Welcome back!" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(AppRoutes.LOGIN);
  });

  it("renders the login form at the login route", async () => {
    await goTo(AppRoutes.LOGIN);

    renderRouter();

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign Up" })).toBeInTheDocument();
  });

  it("renders the register form at the register route", async () => {
    await goTo(AppRoutes.REGISTER);

    renderRouter();

    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign In" })).toBeInTheDocument();
  });

  it("keeps the authenticated user on the home route", async () => {
    useAuthStore.setState({ accessToken: "token-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { uuid: "u1", email: "user@test.co", roles: ["admin"] },
        }),
      }),
    );
    await goTo(AppRoutes.HOME);

    renderRouter();

    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe(AppRoutes.HOME));
  });
});
