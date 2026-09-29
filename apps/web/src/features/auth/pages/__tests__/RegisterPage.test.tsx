import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { renderWithProviders } from "../../../../test/renderWithProviders.js";
import { RegisterPage } from "../RegisterPage.js";

function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RegisterPage rendering", () => {
  it("renders the heading and both fields", () => {
    renderWithProviders(createElement(RegisterPage));

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("marks the password field as a new password and links back to login", () => {
    renderWithProviders(createElement(RegisterPage));

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
  });
});

describe("RegisterPage validation", () => {
  it("blocks submission when both fields are empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(createElement(RegisterPage));

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the 8 character minimum on the password", async () => {
    const user = userEvent.setup();
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a password of exactly 8 characters", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(stubResponse(201, { success: true, data: { uuid: "u1" } }));
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "12345678");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("RegisterPage submission", () => {
  it("posts the credentials to the register endpoint", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(stubResponse(201, { success: true, data: { uuid: "u1" } }));
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "new@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/register");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "new@test.co", password: "Secret123" }));
  });

  it("shows the creating label and disables the button while in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "new@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    const pending = await screen.findByRole("button", { name: "Creating…" });
    expect(pending).toBeDisabled();

    resolveFetch?.(stubResponse(201, { success: true, data: { uuid: "u1" } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("surfaces a duplicate-user error from the gateway", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(409, {
        success: false,
        error: {
          message: "User already exists.",
          code: "USER_ALREADY_EXISTS",
          status: 409,
          timestamp: "2026-09-29T10:00:00.000Z",
        },
      }),
    );
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "dup@test.co");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByText("User already exists.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeEnabled();
  });

  it("surfaces a weak-password error from the gateway", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(400, {
        success: false,
        error: { message: "Password is too weak.", code: "WEAK_PASSWORD", status: 400 },
      }),
    );
    renderWithProviders(createElement(RegisterPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.type(screen.getByLabelText("Password"), "12345678");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByText("Password is too weak.")).toBeInTheDocument();
  });
});
