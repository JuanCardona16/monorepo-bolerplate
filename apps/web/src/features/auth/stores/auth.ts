import { create } from "zustand";
import { ApiPaths } from "../../../constants/index";
import { api } from "../../../infrastructure/http/apiClient";
import type { LoginInput, SessionPayload } from "../types";

interface AuthState {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clear: () => void;
  refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null }),
  refresh: async () => {
    try {
      const data = await api.post<SessionPayload>(ApiPaths.REFRESH);
      set({ accessToken: data.accessToken });
      return true;
    } catch {
      set({ accessToken: null });
      return false;
    }
  },
}));

export async function loginRequest(input: LoginInput): Promise<SessionPayload> {
  return api.post<SessionPayload>(ApiPaths.LOGIN, input);
}
