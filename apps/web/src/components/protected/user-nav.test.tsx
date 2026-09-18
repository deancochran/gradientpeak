// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserNav } from "./user-nav";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useQuery: vi.fn(),
  user: { email: "rider@example.test", id: "profile-1" },
}));

vi.mock("@repo/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@repo/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  isRedirect: (error: unknown) => Boolean(error && typeof error === "object" && "href" in error),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

vi.mock("../../lib/api/client", () => ({
  api: { profiles: { get: { useQuery: mocks.useQuery } } },
}));

vi.mock("../../lib/auth/server-actions", () => ({
  signOutAction: Object.assign((...args: unknown[]) => mocks.signOut(...args), {
    url: "/sign-out",
  }),
}));
vi.mock("../../lib/contract-epoch", () => ({ contractEpochFormInputProps: {} }));
vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

describe("UserNav", () => {
  function signOutForm() {
    const form = screen.getByRole("button", { name: "Log out" }).closest("form");
    if (!form) throw new Error("Sign-out form is missing");
    return form;
  }
  afterEach(cleanup);
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.user = { email: "rider@example.test", id: "profile-1" };
  });

  it("renders the current profile avatar instead of the authentication fallback", () => {
    mocks.useQuery.mockReturnValue({
      data: { avatar_url: "https://cdn.example.test/profile-1/avatar.webp", username: "rider" },
    });

    render(<UserNav />);

    expect(screen.getByRole("img", { name: "Your profile" }).getAttribute("src")).toBe(
      "https://cdn.example.test/profile-1/avatar.webp",
    );
  });

  it("accepts one same-frame sign-out request and restores the action after failure", async () => {
    mocks.useQuery.mockReturnValue({ data: undefined });
    let reject!: (reason: Error) => void;
    mocks.signOut.mockReturnValue(new Promise((_, rejectPromise) => (reject = rejectPromise)));
    render(<UserNav />);

    const form = signOutForm();
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();

    reject(new Error("transport detail"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Could not sign out. Please try again."),
    );
    expect((screen.getByRole("button", { name: "Log out" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("isolates a prior account rejection from a new pending sign-out", async () => {
    mocks.useQuery.mockReturnValue({ data: undefined });
    let reject!: (reason: Error) => void;
    mocks.signOut.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const view = render(<UserNav />);
    fireEvent.submit(signOutForm());
    mocks.user = { id: "profile-2", email: "next@example.test" };
    view.rerender(<UserNav />);
    mocks.signOut.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.submit(signOutForm());
    await act(async () => {
      reject(new Error("old account"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Logging out..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
