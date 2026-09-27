import { create } from "zustand";
import { api } from "../app/api.js";

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
      const data = await api.post<{ accessToken: string }>("/api/v1/auth/refresh");
      set({ accessToken: data.accessToken });
      return true;
    } catch {
      set({ accessToken: null });
      return false;
    }
  },
}));
