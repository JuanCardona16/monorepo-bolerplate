import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./app/queryClient.js";
import { router } from "./app/router.js";
import { useAuthStore } from "./stores/auth.js";
import "./index.css";

function Bootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void useAuthStore
      .getState()
      .refresh()
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <p>Loading…</p>;
  }
  return <>{children}</>;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Bootstrap>
        <RouterProvider router={router} />
      </Bootstrap>
    </QueryClientProvider>
  </StrictMode>,
);
