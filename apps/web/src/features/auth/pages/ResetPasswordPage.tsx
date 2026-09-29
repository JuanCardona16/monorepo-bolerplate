import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { PasswordField } from "../../../shared/components/PasswordField";
import { AuthShell } from "../../../shared/components/AuthShell";
import { useResetPassword } from "../hooks";
import type { ResetPasswordInput } from "../types";

/**
 * Reads the token from the URL **fragment**.
 *
 * The link in the email is `<web>/reset-password#token=...`. A fragment is
 * never sent to the server by the browser, so the token cannot appear in the
 * API access log, in a reverse proxy's log, or in the `Referer` header of the
 * next page the user opens. A query string would put a live password-reset
 * credential into every one of those.
 */
function readTokenFromFragment(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("token") ?? "";
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = useMemo(
    () => readTokenFromFragment(typeof window === "undefined" ? "" : window.location.hash),
    [],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Omit<ResetPasswordInput, "token">>();
  const mutation = useResetPassword();

  const onSubmit = (data: Omit<ResetPasswordInput, "token">) => {
    mutation.mutate(
      { ...data, token },
      {
        onSuccess: () => navigate(AppRoutes.LOGIN),
      },
    );
  };

  if (!token) {
    // Reached by opening `/reset-password` directly, or by a link whose token
    // was stripped. Asking for a new one is the only useful action, and the
    // form cannot be shown without a credential to submit.
    return (
      <AuthShell>
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold text-ink">This link is not valid</h1>
          <p className="mt-3 text-sm text-muted">
            The reset link is missing its token. It may have been truncated by
            your email client, or already used.
          </p>
          <Link
            to={AppRoutes.FORGOT_PASSWORD}
            className="mt-8 inline-block text-sm font-semibold text-ink"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold text-ink">Choose a new password</h1>
        <p className="mb-8 mt-1 text-center text-sm text-muted">
          This link works once and expires in an hour.
        </p>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <PasswordField
            id="reset-password"
            label="New password"
            autoComplete="new-password"
            placeholder="8+ chars, upper, lower and number"
            register={register("password", {
              required: "Password is required.",
              minLength: { value: 8, message: "Password must be at least 8 characters." },
            })}
            error={errors.password?.message}
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            className="h-12 w-full cursor-pointer rounded-full bg-ink text-base font-semibold text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {mutation.isPending ? "Updating…" : "Update password"}
          </button>
          {mutation.error instanceof ApiError && (
            <p className="mt-3 text-center text-sm text-red-600" role="alert">
              {mutation.error.message}
            </p>
          )}
        </form>
        <p className="mt-10 text-center text-sm text-muted">
          Changed your mind?{" "}
          <Link to={AppRoutes.LOGIN} className="font-semibold text-ink">
            Sign In
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
