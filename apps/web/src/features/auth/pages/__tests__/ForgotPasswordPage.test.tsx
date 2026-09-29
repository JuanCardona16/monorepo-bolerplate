import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { renderWithProviders } from "../../../../test/renderWithProviders.js";
import { ForgotPasswordPage } from "../ForgotPasswordPage.js";

const SILENT_MESSAGE =
  "If an account exists for that address, a password reset link is on its way.";

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

describe("ForgotPasswordPage rendering", () => {
  it("renders the heading, the field and a way back to sign in", () => {
    renderWithProviders(createElement(ForgotPasswordPage));

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
  });

  it("does not call the API before the form is submitted", () => {
    renderWithProviders(createElement(ForgotPasswordPage));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ForgotPasswordPage submission", () => {
  it("posts the address to the forgot-password endpoint", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(202, { success: true, data: { message: SILENT_MESSAGE } }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/forgot-password");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "user@test.co" }));
  });

  it("shows the message the server sent, whatever the address was", async () => {
    // The UI cannot leak what the API refuses to. Rendering the server's own
    // wording is the only version that cannot imply a difference the response
    // does not contain.
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(202, { success: true, data: { message: SILENT_MESSAGE } }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "nobody@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(SILENT_MESSAGE);
  });

  it("never states that an email was sent", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(202, {
        success: true,
        data: { message: "If an account exists for that address, a reset link is on its way." },
      }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    const status = await screen.findByRole("status");
    expect(status.textContent?.toLowerCase()).not.toContain("we sent");
    expect(status.textContent?.toLowerCase()).not.toContain("email sent");
  });

  it("replaces the form once confirmed, so the address cannot be resubmitted", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(202, { success: true, data: { message: SILENT_MESSAGE } }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: "Send reset link" })).not.toBeInTheDocument();
  });

  it("surfaces a rate-limit rejection and keeps the user on the form", async () => {
    // A 429 is the one case that must not be swallowed: the request genuinely
    // did not happen, and pretending otherwise would have the user waiting for
    // an email that was never sent.
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(429, {
        success: false,
        error: {
          message: "Too many attempts. Try again later.",
          code: "RATE_LIMITED",
          status: 429,
        },
      }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Too many attempts. Try again later.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("surfaces an invalid address from the gateway", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(400, {
        success: false,
        error: { message: "Invalid email.", code: "INVALID_EMAIL", status: 400 },
      }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "nope");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Invalid email.")).toBeInTheDocument();
  });

  it("blocks submission without an address and makes no request", async () => {
    const user = userEvent.setup();
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a network-level failure instead of rendering nothing", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("disables the button and shows the pending label while in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderWithProviders(createElement(ForgotPasswordPage));

    await user.type(screen.getByLabelText("Email"), "user@test.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    const pending = await screen.findByRole("button", { name: "Sending…" });
    expect(pending).toBeDisabled();

    resolveFetch?.(stubResponse(202, { success: true, data: { message: SILENT_MESSAGE } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
