import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidebar } from "./Sidebar.jsx";

function renderSidebar(overrides = {}) {
  const props = {
    user: null,
    page: "manage",
    setPage: vi.fn(),
    onLogout: vi.fn(),
    loading: false,
    message: "",
    authMode: "login",
    setAuthMode: vi.fn(),
    authForm: { name: "", email: "", password: "" },
    setAuthForm: vi.fn(),
    onAuthSubmit: vi.fn((e) => e.preventDefault()),
    ...overrides,
  };
  return { props, ...render(<Sidebar {...props} />) };
}

describe("Sidebar", () => {
  it("shows the auth form when signed out", () => {
    renderSidebar();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("shows nav and account box when signed in", () => {
    renderSidebar({ user: { name: "Cole", email: "cole@example.com" } });
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getByText("Cole")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("navigates when a nav button is clicked", async () => {
    const { props } = renderSidebar({ user: { name: "Cole", email: "cole@example.com" } });
    await userEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(props.setPage).toHaveBeenCalledWith("calendar");
  });

  it("renders a status message when provided", () => {
    renderSidebar({ message: "Signed out." });
    expect(screen.getByText("Signed out.")).toBeInTheDocument();
  });
});
