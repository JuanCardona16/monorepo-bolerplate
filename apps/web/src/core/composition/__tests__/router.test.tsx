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

    // `collectPaths` joins each child with its parent, so the catch-all reads
    // as `/*` rather than the bare `*` declared in the config.
    expect(paths.sort()).toEqual([
      "/",
      "/*",
      "/forgot-password",
      "/login",
      "/register",
      "/reset-password",
    ]);
  });

  it("nests the routes inside the layout element", () => {
    const root = router.routes[0];

    expect(root?.element).toBeDefined();
    expect(root?.children).toHaveLength(6);
  });

  it("keeps the password reset routes outside the auth guard", () => {
    // Both are reachable by exactly the people who cannot sign in: someone who
    // forgot their password has no access token, so wrapping them in
    // `RequireAuth` would redirect them to a login form they cannot pass. Asserted
    // structurally because a routing bug here is invisible in a render test.
    const root = router.routes[0];
    const children = (root?.children ?? []) as {
      path?: string;
      element?: { type?: unknown } | React.ReactElement;
    }[];

    for (const path of [AppRoutes.FORGOT_PASSWORD, AppRoutes.RESET_PASSWORD]) {
      const route = children.find((child) => child.path === path);
      expect(route).toBeDefined();
      const element = route?.element as React.ReactElement | undefined;
      // `RequireAuth` wraps its children in a Navigate, so a guarded route has
      // a component whose rendered tree contains one. A direct page element
      // does not.
      expect(element).toBeDefined();
      expect((element as { type?: { name?: string } }).type?.name).not.toBe("RequireAuth");
    }
  });

  it("registers a wildcard route as the last child so it cannot shadow a real path", () => {
    // Added because an unknown URL used to render a blank screen: the router had
    // no catch-all at all. It has to stay last in the children array, otherwise
    // React Router matches it first and every path falls through to 404.
    const root = router.routes[0];
    const children = (root?.children ?? []) as { path?: string }[];
    const last = children[children.length - 1];

    expect(last?.path).toBe("*");
  });

  it("has an errorElement on the root route", () => {
    // Without it, a render-time throw showed React Router's bare unstyled
    // default boundary, with no navigation and no way back.
    expect(router.routes[0]?.errorElement).toBeDefined();
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

  it("renders the forgot-password form at its route", async () => {
    await goTo(AppRoutes.FORGOT_PASSWORD);

    renderRouter();

    expect(
      await screen.findByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
  });

  it("renders the reset-password page at its route, even with no token in the URL", async () => {
    // The route must not blow up or bounce to login when the fragment is empty:
    // a link stripped by an email client lands here, and it has to say so.
    await goTo(AppRoutes.RESET_PASSWORD);

    renderRouter();

    expect(await screen.findByRole("heading", { name: "This link is not valid" })).toBeInTheDocument();
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
