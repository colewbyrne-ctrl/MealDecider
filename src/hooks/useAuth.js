import { useState } from "react";

import {
  clearSession,
  readStoredToken,
  readStoredUser,
  storeSession,
} from "../lib/storage.js";

// Owns the persisted auth session: the bearer token and current user, kept in
// sync with localStorage. Login/logout orchestration (status messages, resetting
// page-specific state) stays in App; this hook just owns the session itself.
export function useAuth() {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(readStoredUser);

  function saveSession(data) {
    storeSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
  }

  function clearAuth() {
    clearSession();
    setToken("");
    setUser(null);
  }

  return { token, user, saveSession, clearAuth };
}
