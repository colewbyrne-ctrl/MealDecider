// Thin wrappers around localStorage for the persisted auth session.

const TOKEN_KEY = "meal_token";
const USER_KEY = "meal_user";

export function readStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function readStoredUser() {
  try {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function storeSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
