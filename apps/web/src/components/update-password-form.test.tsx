// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UpdatePasswordForm } from "./update-password-form";

const reset = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => reset }));
vi.mock("../lib/auth/server-actions", () => ({ resetPasswordAction: { url: "/_serverFn/reset" } }));
afterEach(cleanup);

it("explains a missing or invalid token and offers a new link while Save is disabled", () => {
  render(<UpdatePasswordForm />);
  expect(screen.getByRole("alert").textContent).toContain("This reset link is missing or invalid");
  expect(screen.getByRole("button", { name: "Save new password" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.getByRole("link", { name: "Request a new reset link" }).getAttribute("href")).toBe(
    "/auth/forgot-password",
  );
  expect(reset).not.toHaveBeenCalled();
});

it("retains credentials and disables a rejected expired token with explicit recovery", async () => {
  reset.mockRejectedValueOnce(new Error("Invalid token"));
  render(<UpdatePasswordForm token="expired-token" />);
  fireEvent.change(screen.getByLabelText("New password *"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password *"), {
    target: { value: "Password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toBeTruthy(),
  );
  expect(screen.getByRole("button", { name: "Save new password" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect((screen.getByLabelText("New password *") as HTMLInputElement).value).toBe("Password123");
});
