import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router";

/**
 * Query client used by component tests. Retries are disabled so a rejected
 * request surfaces immediately instead of after the default backoff, and
 * `gcTime: 0` keeps each test's cache from leaking into the next one.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

interface RenderWithProvidersOptions {
  route?: string;
  client?: QueryClient;
}

/**
 * Wraps a component in the two providers every auth screen needs:
 * `QueryClientProvider` for react-query and `MemoryRouter` for react-router's
 * `Link`/`useNavigate`. The production `queryClient` is deliberately not reused
 * because it is a module singleton shared across the whole test file.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", client = createTestQueryClient() }: RenderWithProvidersOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
