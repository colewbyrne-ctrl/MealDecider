import { useState } from "react";

import type { AuthResponse, User } from "../types";
import {
  clearSession,
  readStoredToken,
  readStoredUser,
  storeSession,
} from "../lib/storage";

export type UseAuth = {
  token: string;
  user: User | null;
  saveSession: (data: AuthResponse) => void;
  clearAuth: () => void;
};

// Owns the persisted auth session: the bearer token and current user, kept in
// sync with localStorage. Login/logout orchestration (status messages, resetting
// page-specific state) stays in App; this hook just owns the session itself.
export function useAuth(): UseAuth {
  const [token, setToken] = useState<string>(readStoredToken);
  const [user, setUser] = useState<User | null>(readStoredUser);

  function saveSession(data: AuthResponse): void {
    storeSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
  }

  function clearAuth(): void {
    clearSession();
    setToken("");
    setUser(null);
  }

  return { token, user, saveSession, clearAuth };
}
