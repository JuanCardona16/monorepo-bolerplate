import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { useLogin } from "../hooks";
import type { LoginInput } from "../types";

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
    <div className="page">
      <section className="auth-card" aria-labelledby="login-title">
        <h1 id="login-title">Welcome back</h1>
        <p className="sub">Sign in to continue to your account.</p>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register("email", { required: "Email is required." })}
            />
            {errors.email && (
              <p className="form-error" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              {...register("password", { required: "Password is required." })}
            />
            {errors.password && (
              <p className="form-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
          {mutation.error instanceof ApiError && (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          )}
        </form>
        <p className="sub" style={{ marginTop: "1.5rem", marginBottom: 0 }}>
          No account yet? <Link to={AppRoutes.REGISTER}>Create one</Link>
        </p>
      </section>
    </div>
  );
}
