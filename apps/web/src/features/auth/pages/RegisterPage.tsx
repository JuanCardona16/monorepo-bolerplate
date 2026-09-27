import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { AppRoutes } from "../../../constants/index";
import { ApiError } from "../../../core/errors/ApiError";
import { useRegister } from "../hooks";
import type { RegisterInput } from "../types";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<RegisterInput>();
  const mutation = useRegister();

  const onSubmit = (data: RegisterInput) => {
    mutation.mutate(data, {
      onSuccess: () => navigate(AppRoutes.LOGIN),
    });
  };

  return (
    <div>
      <h1>Register</h1>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <input type="email" placeholder="Email" {...register("email", { required: true })} />
        <input
          type="password"
          placeholder="Password (8+ chars, upper, lower, number)"
          {...register("password", { required: true, minLength: 8 })}
        />
        <button type="submit" disabled={mutation.isPending}>
          Register
        </button>
      </form>
      {mutation.error instanceof ApiError && (
        <p className="error">{mutation.error.message}</p>
      )}
      {formState.errors.password && (
        <p className="error">Password must be at least 8 characters.</p>
      )}
    </div>
  );
}
