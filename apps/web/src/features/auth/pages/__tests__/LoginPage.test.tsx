import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { renderWithProviders } from "../../../../test/renderWithProviders.js";
import { LoginPage } from "../LoginPage.js";

function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderLogin() {
  return renderWithProviders(createElement(LoginPage));
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage rendering", () => {
  it("renders the heading and the form fields with accessible labels", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Welcome back!" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("links to the register page", () => {
    renderLogin();

    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/register");
  });

  it("disables the Google sign-in button as not yet available", () => {
    renderLogin();

    const google = screen.getByRole("button", { name: /log in with google/i });
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute("title", "Coming soon");
  });

  // TK-10: the server now accepts a real session-length choice, so the checkbox
  // is back as an honest control: unchecked (default) means a 24h session,
  // checked means 30 days. The old absence assertion was deliberately replaced,
  // not deleted: the control exists again because the choice exists again.
  it("offers a real remember-me checkbox, unchecked by default", () => {
    renderLogin();

    const checkbox = screen.getByRole("checkbox", { name: /remember me/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("links to the password reset page instead of promising one later", () => {
    // It used to be a `<span title="Coming soon">`. The flow exists now, and a
    // real link is the honest version: it navigates, and it is reachable by
    // keyboard and by assistive technology, which a disabled span was not.
    renderLogin();

    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link).toHaveAttribute("href", "/forgot-password");
  });

  it("renders the forgot-password entry as a link, not a disabled span", () => {
    // The Google sign-in button is legitimately still disabled, so this is scoped
    // to the element that used to be a span next to the password field.
    renderLogin();

    const link = screen.getByRole("link", { name: "Forgot password?" });
    expect(link.tagName).toBe("A");
    expect(link).not.toHaveAttribute("title", "Coming soon");
  });

  it("states the short default instead of promising 30 days to everyone", () => {
    renderLogin();

    expect(screen.getByText(/24 hours/i)).toBeInTheDocument();
  });

  it("does not call the API before the form is submitted", () => {
    renderLogin();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("LoginPage validation", () => {
  it("shows both required errors and makes no request on empty submit", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use native browser validation, since the form sets noValidate", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Log In" }).closest("form")).toHaveAttribute(
      "novalidate",
    );
  });
});

describe("LoginPage submission", () => {
  it("posts the typed credentials to the login endpoint", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { accessToken: "token-1" } }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ email: "user@test.co", password: "Secret123", rememberMe: false }),
    );
  });

  it("sends rememberMe true when the checkbox is checked", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { accessToken: "token-1" } }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("checkbox", { name: /remember me/i }));
    await user.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({ email: "user@test.co", password: "Secret123", rememberMe: true }),
    );
  });

  it("disables the submit button and shows the pending label while in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    resolveFetch?.(stubResponse(200, { success: true, data: { accessToken: "t" } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("surfaces the gateway error message and keeps the user on the form", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(401, {
        success: false,
        error: {
          message: "Invalid credentials.",
          code: "INVALID_CREDENTIALS",
          status: 401,
          timestamp: "2026-09-29T10:00:00.000Z",
        },
      }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent === "Invalid credentials.")).toBe(true);
    expect(screen.getByRole("heading", { name: "Welcome back!" })).toBeInTheDocument();
  });

  it("re-enables the submit button after a failed attempt", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(400, {
        success: false,
        error: { message: "Invalid email.", code: "INVALID_EMAIL", status: 400 },
      }),
    );
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "nope");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Invalid email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeEnabled();
  });

  // This used to assert the ABSENCE of an alert, documenting the bug: a rejected
  // `fetch` is a TypeError, never an ApiError, so the page's
  // `instanceof ApiError` branch rendered nothing and the user got no feedback
  // at all. `apiClient` now normalizes the rejection into an ApiError, so the
  // page can tell them what happened.
  it("explains a network-level failure instead of rendering nothing", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not reach the server/i);
    await waitFor(() => expect(screen.getByRole("button", { name: "Log In" })).toBeEnabled());
  });

  it("keeps the user on the form after a network failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Welcome back!" })).toBeInTheDocument();
  });
});
