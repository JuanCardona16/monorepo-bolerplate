import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Bootstrap } from "./core/composition/Bootstrap";
import { router } from "./core/composition/router";
import { queryClient } from "./core/providers/queryClient";
import "./index.css";

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
