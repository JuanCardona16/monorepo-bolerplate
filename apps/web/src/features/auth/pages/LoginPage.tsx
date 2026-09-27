import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { useLogin } from "../hooks";
import type { LoginInput } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<LoginInput>();
  const mutation = useLogin();

  const onSubmit = (data: LoginInput) => {
    mutation.mutate(data, {
      onSuccess: () => navigate(AppRoutes.HOME),
    });
  };

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <input type="email" placeholder="Email" {...register("email", { required: true })} />
        <input
          type="password"
          placeholder="Password"
          {...register("password", { required: true })}
        />
        <button type="submit" disabled={mutation.isPending}>
          Login
        </button>
      </form>
      {mutation.error instanceof ApiError && (
        <p className="error">{mutation.error.message}</p>
      )}
      {formState.errors.email && <p className="error">Email is required.</p>}
      {formState.errors.password && <p className="error">Password is required.</p>}
    </div>
  );
}
