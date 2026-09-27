import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiPaths } from "../../constants/index";
import { api } from "../../infrastructure/http/apiClient";
import { loginRequest, useAuthStore } from "./stores/auth";
import type { LoginInput, Profile, RegisterInput } from "./types";

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

export function useProfile() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<Profile>(ApiPaths.ME),
    enabled: accessToken !== null,
  });
}
