import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiPaths } from "../../constants/index";
import { api } from "../../infrastructure/http/apiClient";
import { loginRequest, useAuthStore } from "./stores/auth";
import type {
  ForgotPasswordInput,
  LoginInput,
  Profile,
  RegisterInput,
  ResetPasswordInput,
} from "./types";

export function useLogin() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  return useMutation({
    mutationFn: (input: LoginInput) => loginRequest(input),
    onSuccess: (data) => setAccessToken(data.accessToken),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api.post<{ uuid: string }>(ApiPaths.REGISTER, input),
  });
}

/**
 * Ask for a reset link.
 *
 * The success message is rendered verbatim whatever the server answered. The
 * API replies identically for a known and an unknown address, and the UI has to
 * be just as careful: branching on any hint the response might carry would
 * rebuild the account-enumeration oracle one layer up.
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api.post<{ message: string }>(ApiPaths.FORGOT_PASSWORD, input),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      api.post<{ uuid: string }>(ApiPaths.RESET_PASSWORD, input),
  });
}

export function useProfile() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>(ApiPaths.ME),
    enabled: accessToken !== null,
  });
}
