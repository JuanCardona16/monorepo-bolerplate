import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { AuthShell } from "../../../shared/components/AuthShell";
import { useForgotPassword } from "../hooks";
import type { ForgotPasswordInput } from "../types";

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>();
  const mutation = useForgotPassword();
  // Held locally rather than read off the mutation, because the confirmation is
  // the same message the server sent whether or not an account exists. The
  // server is the one that must not leak it, so the page must not invent its
  // own wording that would imply a difference.
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const onSubmit = (data: ForgotPasswordInput) => {
    mutation.mutate(data, {
      onSuccess: (result) => setConfirmation(result.message),
    });
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold text-ink">Reset your password</h1>
        <p className="mb-8 mt-1 text-center text-sm text-muted">
          Enter your email and we&apos;ll send you a link.
        </p>

        {confirmation ? (
          <div role="status" className="text-center">
            <p className="text-sm text-ink">{confirmation}</p>
            <p className="mt-4 text-sm text-muted">
              Didn&apos;t get it? Check your spam folder, or try again in a few minutes.
            </p>
            <Link
              to={AppRoutes.LOGIN}
              className="mt-8 inline-block text-sm font-semibold text-ink"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
            <div className="mb-5">
              <label htmlFor="forgot-email" className="mb-1 block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                {...register("email", { required: "Email is required." })}
                className="w-full border-b border-line bg-transparent pb-2 text-base text-ink outline-none placeholder:text-muted focus:border-ink"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
              className="h-12 w-full cursor-pointer rounded-full bg-ink text-base font-semibold text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
            >
              {mutation.isPending ? "Sending…" : "Send reset link"}
            </button>
            {mutation.error instanceof ApiError && (
              <p className="mt-3 text-center text-sm text-red-600" role="alert">
                {mutation.error.message}
              </p>
            )}
            <p className="mt-10 text-center text-sm text-muted">
              Remembered it?{" "}
              <Link to={AppRoutes.LOGIN} className="font-semibold text-ink">
                Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
