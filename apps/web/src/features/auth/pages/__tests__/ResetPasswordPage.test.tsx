import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { renderWithProviders } from "../../../../test/renderWithProviders.js";
import { ResetPasswordPage } from "../ResetPasswordPage.js";

const RAW_TOKEN = "raw-token-abc";

function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderAtToken(token: string | null) {
  window.location.hash = token === null ? "" : `#token=${token}`;
  return renderWithProviders(createElement(ResetPasswordPage), { route: "/reset-password" });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("ResetPasswordPage token handling", () => {
  it("reads the token from the URL fragment", () => {
    // The fragment is the whole reason the link works: a browser never sends it
    // to the server, so the token stays out of the API access log, out of every
    // proxy log in front of the app, and out of the Referer of the next page.
    renderAtToken(RAW_TOKEN);

    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("asks for a new link instead of showing a form when the token is missing", () => {
    // Opening `/reset-password` directly, or a link whose token was stripped by
    // an email client. There is nothing to submit, so the form would be a dead
    // end that looks like it works.
    renderAtToken(null);

    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("sends the token in the body, never in the URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(stubResponse(200, { success: true, data: { uuid: "u1" } }));
    renderAtToken(RAW_TOKEN);

    await user.type(screen.getByLabelText("New password"), "Str0ngPassw0rd");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(RAW_TOKEN);
    expect(url).toContain("/api/v1/auth/reset-password");
    expect(JSON.parse(init.body as string)).toEqual({
      token: RAW_TOKEN,
      password: "Str0ngPassw0rd",
    });
  });
});

describe("ResetPasswordPage submission", () => {
  it("marks the field as a new password", () => {
    renderAtToken(RAW_TOKEN);

    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("blocks submission with an empty password and makes no request", async () => {
    const user = userEvent.setup();
    renderAtToken(RAW_TOKEN);

    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an invalid or expired token", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(401, {
        success: false,
        error: {
          message: "Invalid or expired reset token.",
          code: "INVALID_RESET_TOKEN",
          status: 401,
        },
      }),
    );
    renderAtToken(RAW_TOKEN);

    await user.type(screen.getByLabelText("New password"), "Str0ngPassw0rd");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Invalid or expired reset token.")).toBeInTheDocument();
  });

  it("surfaces a weak password from the gateway", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      stubResponse(400, {
        success: false,
        error: {
          message: "Password must be at least 8 characters long and include an uppercase letter.",
          code: "WEAK_PASSWORD",
          status: 400,
        },
      }),
    );
    renderAtToken(RAW_TOKEN);

    await user.type(screen.getByLabelText("New password"), "Str0ngPassw0rd");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText(/at least 8 characters/)).toBeInTheDocument();
  });

  it("explains a network-level failure instead of rendering nothing", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAtToken(RAW_TOKEN);

    await user.type(screen.getByLabelText("New password"), "Str0ngPassw0rd");
    await user.click(screen.getByRole("button", { name: "Update password" }));

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
    renderAtToken(RAW_TOKEN);

    await user.type(screen.getByLabelText("New password"), "Str0ngPassw0rd");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    const pending = await screen.findByRole("button", { name: "Updating…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    resolveFetch?.(stubResponse(200, { success: true, data: { uuid: "u1" } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
