import { useEffect, useState } from "react";
import { useAuthStore } from "../../features/auth/stores/auth";
import { configureApi } from "../../infrastructure/http/apiClient";

export function Bootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = useAuthStore.getState();
    configureApi({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onRefreshed: (accessToken) => store.setAccessToken(accessToken),
      onUnauthorized: () => store.clear(),
    });
    void store
      .refresh()
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <p>Loading…</p>;
  }
  return <>{children}</>;
}
