import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../features/auth/stores/auth";
import { configureApi } from "../../infrastructure/http/apiClient";

/**
 * How long to wait for the silent refresh before rendering the app anyway.
 * Without it, an unreachable API leaves the user staring at "Loading…" forever,
 * with no diagnostics and no way forward.
 */
const REFRESH_TIMEOUT_MS = 5_000;

export function Bootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // `useRef` rather than a module-level flag: it survives StrictMode's double
  // mount without suppressing the refresh in a later genuine remount, where a
  // refresh IS still needed.
  const started = useRef(false);

  useEffect(() => {
    const store = useAuthStore.getState();
    configureApi({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onRefreshed: (accessToken) => store.setAccessToken(accessToken),
      onUnauthorized: () => store.clear(),
    });

    // React's StrictMode mounts effects twice in development. Both mounts would
    // fire POST /auth/refresh with the same cookie before either response sets
    // the new one, and the rotating-cookie server treats the second as a replay
    // and revokes every session for that user. Refreshing once is the fix.
    if (started.current) {
      return;
    }
    started.current = true;

    // The timeout races the refresh instead of aborting it: `store.refresh()`
    // takes no AbortSignal, so an abort would be a no-op pretending to work. The
    // in-flight request is left to finish on its own and still populates the
    // store; the app simply stops waiting for it. Unblocking the UI is what
    // matters here, not cancelling the network call.
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), REFRESH_TIMEOUT_MS);
    });

    void Promise.race([store.refresh().catch(() => false), timeout]).then(() =>
      setReady(true),
    );
  }, []);

  if (!ready) {
    return <p>Loading…</p>;
  }
  return <>{children}</>;
}
