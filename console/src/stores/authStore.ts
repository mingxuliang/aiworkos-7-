import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  username: string;
  roles: string[];
}

interface AuthStore {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
}

const STORAGE_KEY = "qwenpaw-auth-user-storage";

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
