// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../lib/auth/client", () => ({
  authClient: { signIn: { email: mocks.signInEmail } },
}));

vi.mock("../lib/auth/server-actions", () => ({
  signInWithEmailAction: { url: "/_serverFn/sign-in" },
}));

beforeEach(() => {
  mocks.signInEmail.mockReset();
});

afterEach(cleanup);

describe("LoginForm", () => {
  it("submits browser logins through the standard Better Auth endpoint", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "athlete@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password *"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "athlete@example.com",
        password: "Password1",
      }),
    );
    expect(await screen.findByText("Invalid email or password. Please try again.")).toBeTruthy();
  });
});
