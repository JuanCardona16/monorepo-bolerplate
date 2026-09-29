import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { PasswordField } from "../../../shared/components/PasswordField";
import { AuthShell } from "../../../shared/components/AuthShell";
import { useLogin } from "../hooks";
import type { LoginInput } from "../types";

function SparkMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-ink">
      <path d="M12 2c.7 4.8 2.6 7.6 5 9-.4.3-.8.7-1 1.2-.2.4-.3.9-.3 1.4 0 .3 0 .6.1.9-2.3 1.4-3.9 4-4.5 7.5-.6-3.5-2.2-6.1-4.5-7.5.1-.3.1-.6.1-.9 0-.5-.1-1-.3-1.4-.2-.5-.6-.9-1-1.2 2.4-1.4 4.3-4.2 5-9z" />
      <path d="M19 3c.3 2.3 1.2 3.6 2.4 4.3-.2.1-.4.3-.5.6-.1.2-.1.4-.1.7 0 .1 0 .3.1.4-1.1.7-1.9 1.9-2.2 3.6-.3-1.7-1.1-2.9-2.2-3.6 0-.1.1-.3.1-.4 0-.3-.1-.5-.2-.7-.1-.2-.3-.4-.5-.6C16.6 6.6 17.5 5.3 19 3z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5.1 3.8-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.4 6.6l3.8 2.9c.9-2.9 3.6-4.8 6.8-4.8z" />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>();
  const mutation = useLogin();

  const onSubmit = (data: LoginInput) => {
    mutation.mutate(data, {
      onSuccess: () => navigate(AppRoutes.HOME),
    });
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <SparkMark />
        </div>
        <h1 className="text-center text-3xl font-bold text-ink">Welcome back!</h1>
        <p className="mb-8 mt-1 text-center text-sm text-muted">Please enter your details</p>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <div className="mb-5">
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="login-email"
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
          <PasswordField
            id="login-password"
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            register={register("password", { required: "Password is required." })}
            error={errors.password?.message}
          />
          <div className="mb-6 flex items-center justify-between text-sm">
            {/*
              This used to be a checkbox. It had no `name`, no `onChange` and was
              not registered with the form, so it submitted nothing: the refresh
              cookie's lifetime is decided entirely by the server
              (`REFRESH_COOKIE_MAX_AGE_MS`). Rendering a control that cannot be
              changed is worse than not offering the choice at all — a user who
              unticks it gets the same session and believes they chose something.

              If a real "remember me" is wanted, it needs a server-side decision
              first: the client would have to tell the API how long the refresh
              cookie should live, which is a session-security posture and not a
              UI detail.
            */}
            <p className="text-muted">You&rsquo;ll stay signed in for 30 days.</p>
            <span className="cursor-not-allowed text-muted" title="Coming soon">
              Forgot password?
            </span>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            className="h-12 w-full cursor-pointer rounded-full bg-ink text-base font-semibold text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {mutation.isPending ? "Signing in…" : "Log In"}
          </button>
          {mutation.error instanceof ApiError && (
            <p className="mt-3 text-center text-sm text-red-600" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button
            type="button"
            disabled
            title="Coming soon"
            className="mt-3 flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-smoke text-base font-semibold text-ink opacity-80"
          >
            <GoogleMark />
            Log in with Google
          </button>
        </form>
        <p className="mt-10 text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link to={AppRoutes.REGISTER} className="font-semibold text-ink">
            Sign Up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
