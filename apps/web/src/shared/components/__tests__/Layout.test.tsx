import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { renderWithProviders } from "../../../test/renderWithProviders.js";
import { useAuthStore } from "../../../features/auth/stores/auth.js";
import { Layout, RequireAuth } from "../Layout.js";

let fetchMock: ReturnType<typeof vi.fn>;

function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderLayout() {
  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<p>Outlet content</p>} />
        <Route path="/login" element={<p>Login screen</p>} />
      </Route>
    </Routes>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useAuthStore.setState({ accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ accessToken: null });
});

describe("Layout navigation", () => {
  it("renders the main navigation with a home link", () => {
    renderLayout();

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auth App" })).toHaveAttribute("href", "/");
  });

  it("renders the nested route through the Outlet", () => {
    renderLayout();

    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });

  it("shows login and register links when signed out", () => {
    renderLayout();

    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  it("shows a logout button instead of the links when a token is present", () => {
    useAuthStore.setState({ accessToken: "token-1" });

    renderLayout();

    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).not.toBeInTheDocument();
  });
});

describe("Layout logout", () => {
  it("posts to the logout endpoint, clears the token and shows the signed-out nav", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ accessToken: "token-1" });
    fetchMock.mockResolvedValue(stubResponse(204));

    renderLayout();

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    // Logout navigates to /login, so the outlet swaps to the login screen and
    // the nav drops the Logout button in favour of the signed-out links.
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  // The catch block is intentional: a dead refresh cookie must not strand the
  // user in a signed-in shell.
  it("clears the token locally even when the logout call fails", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ accessToken: "token-1" });
    fetchMock.mockResolvedValue(
      stubResponse(401, {
        success: false,
        error: { message: "Nope.", code: "UNAUTHORIZED", status: 401 },
      }),
    );

    renderLayout();

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });
});

describe("RequireAuth", () => {
  it("redirects to the login page when there is no token", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <p>Secret</p>
            </RequireAuth>
          }
        />
      </Routes>,
    );

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("renders the protected children when a token is present", () => {
    useAuthStore.setState({ accessToken: "token-1" });

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <p>Secret</p>
            </RequireAuth>
          }
        />
      </Routes>,
    );

    expect(screen.getByText("Secret")).toBeInTheDocument();
  });
});
