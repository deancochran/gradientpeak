// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserNav } from "./user-nav";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
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
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));

vi.mock("../../lib/api/client", () => ({
  api: { profiles: { get: { useQuery: mocks.useQuery } } },
}));

vi.mock("../../lib/auth/server-actions", () => ({ signOutAction: {} }));
vi.mock("../../lib/contract-epoch", () => ({ contractEpochFormInputProps: {} }));
vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: { email: "rider@example.test", id: "profile-1" } }),
}));

describe("UserNav", () => {
  it("renders the current profile avatar instead of the authentication fallback", () => {
    mocks.useQuery.mockReturnValue({
      data: { avatar_url: "https://cdn.example.test/profile-1/avatar.webp", username: "rider" },
    });

    render(<UserNav />);

    expect(screen.getByRole("img", { name: "Your profile" }).getAttribute("src")).toBe(
      "https://cdn.example.test/profile-1/avatar.webp",
    );
  });
});
