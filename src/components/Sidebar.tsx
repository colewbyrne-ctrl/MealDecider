import type { FormEvent } from "react";

import type { AuthForm, AuthMode, Page, User } from "../types";

const PAGES: [Page, string][] = [
  ["manage", "Manage"],
  ["recipes", "Recipes"],
  ["calendar", "Calendar"],
  ["shopping", "Shopping"],
  ["decider", "Decide"],
];

type SidebarProps = {
  user: User | null;
  page: Page;
  setPage: (page: Page) => void;
  onLogout: () => void;
  loading: boolean;
  message: string;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  authForm: AuthForm;
  setAuthForm: (form: AuthForm) => void;
  onAuthSubmit: (event: FormEvent) => void;
};

export function Sidebar({
  user,
  page,
  setPage,
  onLogout,
  loading,
  message,
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  onAuthSubmit,
}: SidebarProps) {
  return (
    <section className="sidebar">
      <div>
        <p className="eyebrow">Meal Decider</p>
        <h1>Dinner, organized.</h1>
        <p className="subtle">Manage recipes, compare options, and pick what fits tonight.</p>
      </div>

      {user ? (
        <>
          <nav className="app-nav" aria-label="App pages">
            {PAGES.map(([key, label]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => setPage(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="account-box">
            <span className="label">Signed in</span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
            <button className="secondary" onClick={onLogout} disabled={loading}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <form className="auth-form" onSubmit={onAuthSubmit}>
          <div className="segmented">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          {authMode === "register" && (
            <label>
              Name
              <input
                value={authForm.name}
                onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              minLength={authMode === "register" ? 8 : 1}
              required
            />
          </label>

          <button className="primary" disabled={loading}>
            {loading ? "Working..." : authMode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      )}

      {message && <p className="status-line">{message}</p>}
    </section>
  );
}
