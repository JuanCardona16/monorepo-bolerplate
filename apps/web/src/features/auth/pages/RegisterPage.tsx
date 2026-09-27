import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { useRegister } from "../hooks";
import type { RegisterInput } from "../types";

export function RegisterPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>();
  const mutation = useRegister();

  const onSubmit = (data: RegisterInput) => {
    mutation.mutate(data, {
      onSuccess: () => navigate(AppRoutes.LOGIN),
    });
  };

  return (
    <div className="page">
      <section className="auth-card" aria-labelledby="register-title">
        <h1 id="register-title">Create your account</h1>
        <p className="sub">One account for everything in this workspace.</p>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <div className="field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
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
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="8+ chars, upper, lower and number"
              {...register("password", {
                required: "Password is required.",
                minLength: { value: 8, message: "Password must be at least 8 characters." },
              })}
            />
            <p className="hint">Use 8+ characters with upper, lower case and a number.</p>
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
            {mutation.isPending ? "Creating…" : "Create account"}
          </button>
          {mutation.error instanceof ApiError && (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          )}
        </form>
        <p className="sub" style={{ marginTop: "1.5rem", marginBottom: 0 }}>
          Already registered? <Link to={AppRoutes.LOGIN}>Sign in</Link>
        </p>
      </section>
    </div>
  );
}
