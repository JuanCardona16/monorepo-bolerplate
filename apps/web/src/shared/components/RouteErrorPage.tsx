import { Link, isRouteErrorResponse, useNavigate, useRouteError } from "react-router";

/**
 * Rendered by React Router when a route component throws, or when a loader or
 * the data router itself fails. Without it, the default boundary shows a bare
 * unstyled stack trace with no navigation, so a transient failure traps the user
 * on a dead screen with no way back.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let detail = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText || ""}`.trim();
    detail =
      typeof error.data === "string" && error.data
        ? error.data
        : "The page you requested could not be loaded.";
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-coal px-6 text-center">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="text-sm text-smoke">{detail}</p>
      <button
        type="button"
        onClick={() => void navigate("/")}
        className="cursor-pointer rounded-full bg-smoke px-4 py-2 text-sm font-semibold text-ink transition-opacity duration-150 hover:opacity-80"
      >
        Go home
      </button>
    </main>
  );
}

/** Catch-all for unknown paths, so a bad URL is a styled page and not a blank one. */
export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-coal px-6 text-center">
      <h1 className="text-2xl font-bold text-white">404</h1>
      <p className="text-sm text-smoke">This page does not exist.</p>
      <Link
        to="/"
        className="rounded-full bg-smoke px-4 py-2 text-sm font-semibold text-ink no-underline transition-opacity duration-150 hover:opacity-80"
      >
        Go home
      </Link>
    </main>
  );
}
