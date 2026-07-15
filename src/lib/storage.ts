// Thin wrappers around localStorage for the persisted auth session.

import type { User } from "../types";

const TOKEN_KEY = "meal_token";
const USER_KEY = "meal_user";

export function readStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function readStoredUser(): User | null {
  try {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? (JSON.parse(saved) as User) : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function storeSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
