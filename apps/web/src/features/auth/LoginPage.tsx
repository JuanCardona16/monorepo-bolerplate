import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../../app/api.js";
import { useAuthStore } from "../../stores/auth.js";

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const { register, handleSubmit, formState } = useForm<LoginForm>();

  const mutation = useMutation({
    mutationFn: (data: LoginForm) =>
      api.post<{ accessToken: string }>("/api/v1/auth/login", data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate("/");
    },
  });

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={(e) => void handleSubmit((data) => mutation.mutate(data))(e)}>
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
