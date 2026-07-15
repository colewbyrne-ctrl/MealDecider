import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import App from "./App";

describe("App (smoke)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the signed-out shell without a stored session", () => {
    render(<App />);
    // Sidebar auth form is present...
    expect(screen.getByText("Dinner, organized.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // ...and the workspace prompts the user to sign in.
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });
});
