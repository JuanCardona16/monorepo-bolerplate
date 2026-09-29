import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library does not auto-clean when `globals: false`, because it
// cannot detect a global after hook. Registering it here means every suite gets
// unmounted components between tests, so state never leaks from one test into
// the next.
afterEach(() => {
  cleanup();
});
