import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../../app/api.js";

interface RegisterForm {
  email: string;
  password: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<RegisterForm>();

  const mutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      api.post<{ uuid: string }>("/api/v1/auth/register", data),
    onSuccess: () => {
      navigate("/login");
    },
  });

  return (
    <div>
      <h1>Register</h1>
      <form onSubmit={(e) => void handleSubmit((data) => mutation.mutate(data))(e)}>
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
