import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { PasswordField } from "../../../shared/components/PasswordField";
import { AuthShell } from "../../../shared/components/AuthShell";
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
    <AuthShell>
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold text-ink">Create your account</h1>
        <p className="mb-8 mt-1 text-center text-sm text-muted">Please enter your details</p>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <div className="mb-5">
            <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="register-email"
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
            id="register-password"
            label="Password"
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
            className="mt-2 h-12 w-full cursor-pointer rounded-full bg-ink text-base font-semibold text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {mutation.isPending ? "Creating…" : "Sign Up"}
          </button>
          {mutation.error instanceof ApiError && (
            <p className="mt-3 text-center text-sm text-red-600" role="alert">
              {mutation.error.message}
            </p>
          )}
        </form>
        <p className="mt-10 text-center text-sm text-muted">
          Already registered?{" "}
          <Link to={AppRoutes.LOGIN} className="font-semibold text-ink">
            Sign In
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
