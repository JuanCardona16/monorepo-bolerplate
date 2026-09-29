import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

import { renderWithProviders } from "../../../../test/renderWithProviders.js";
import { configureApi } from "../../../../infrastructure/http/apiClient.js";
import { useAuthStore } from "../../stores/auth.js";
import { ProfilePage } from "../ProfilePage.js";

function stubResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderProfile() {
  return renderWithProviders(createElement(ProfilePage));
}

beforeEach(() => {
  // `useProfile` is gated on a non-null token, so an authenticated session has
  // to be seeded into the store before rendering.
  useAuthStore.setState({ accessToken: "token-1" });
  // `apiClient` keeps module-level accessors with no reset hook, so they are
  // forced back to the unwired defaults before each test.
  configureApi({
    getAccessToken: () => null,
    onRefreshed: () => undefined,
    onUnauthorized: () => undefined,
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ accessToken: null });
});

describe("ProfilePage", () => {
  it("shows a loading status while the profile request is in flight", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderProfile();

    expect(screen.getByRole("status")).toHaveTextContent("Loading profile…");

    resolveFetch?.(stubResponse(200, { success: true, data: { uuid: "u1", email: "a@b.co", roles: [] } }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your profile" })).toBeInTheDocument());
  });

  it("fetches the current user from the me endpoint", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { uuid: "u1", email: "a@b.co", roles: [] } }),
    );

    renderProfile();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/auth/me");
  });

  // The Bearer header does NOT come from the store: `apiClient` reads the token
  // through the accessor that `Bootstrap` installs via `configureApi`. A store
  // token on its own is invisible to the HTTP layer, so this suite reproduces
  // the production wiring explicitly.
  it("sends no Authorization header while the apiClient accessors are unwired", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { uuid: "u1", email: "a@b.co", roles: [] } }),
    );

    renderProfile();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("attaches the Bearer token once the accessors are wired to the store", async () => {
    configureApi({ getAccessToken: () => useAuthStore.getState().accessToken });
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { uuid: "u1", email: "a@b.co", roles: [] } }),
    );

    renderProfile();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-1" });
  });

  it("renders the email and the joined roles", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(200, {
        success: true,
        data: { uuid: "u1", email: "user@test.co", roles: ["admin", "user"] },
      }),
    );

    renderProfile();

    const heading = await screen.findByRole("heading", { name: "Your profile" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("user@test.co")).toBeInTheDocument();
    expect(screen.getByText("admin, user")).toBeInTheDocument();
  });

  it("renders an empty roles list without throwing", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(200, { success: true, data: { uuid: "u1", email: "u@test.co", roles: [] } }),
    );

    renderProfile();

    await screen.findByRole("heading", { name: "Your profile" });
    const definitionList = screen.getByRole("heading", { name: "Your profile" }).closest("section");
    expect(definitionList).toHaveTextContent("Roles");
    expect(definitionList?.querySelectorAll("dd")[1]).toHaveTextContent("");
  });

  it("shows a failure message when the request is rejected", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(500, {
        success: false,
        error: { message: "Boom.", code: "INTERNAL", status: 500 },
      }),
    );

    renderProfile();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load profile.");
    expect(screen.queryByRole("heading", { name: "Your profile" })).not.toBeInTheDocument();
  });

  it("stays in the loading state when there is no access token", async () => {
    useAuthStore.setState({ accessToken: null });

    renderProfile();

    expect(screen.getByRole("status")).toHaveTextContent("Loading profile…");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
