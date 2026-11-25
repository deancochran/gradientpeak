// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hydration = vi.hoisted(() => ({ ready: true }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
  useHydrated: () => hydration.ready,
  useLocation: () => ({ pathname: "/plan" }),
}));
vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children, asChild, ...props }: ComponentProps<"button"> & { asChild?: boolean }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@repo/ui/components/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetClose: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../chatbot/chatbot-panel", () => ({ ChatbotLauncher: () => null }));
vi.mock("../providers/auth-provider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("./messages-button", () => ({ MessagesButton: () => null }));
vi.mock("./notifications-button", () => ({ NotificationsButton: () => null }));
vi.mock("./search-launcher", () => ({ SearchLauncher: () => null }));
vi.mock("./user-nav", () => ({ UserNav: () => null }));

import { ProtectedHeader } from "./protected-header";

describe("ProtectedHeader", () => {
  afterEach(() => {
    cleanup();
    hydration.ready = true;
  });

  it("does not accept navigation menu clicks before client hydration", () => {
    hydration.ready = false;
    const { rerender } = render(<ProtectedHeader />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    expect(trigger.hasAttribute("disabled")).toBe(true);

    hydration.ready = true;
    rerender(<ProtectedHeader />);
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("keeps a Personal-to-Coaching context destination available in desktop navigation", () => {
    render(<ProtectedHeader />);

    const coachingLinks = screen.getAllByText("Coaching");
    expect(coachingLinks).toHaveLength(2);
    expect(coachingLinks[0]?.closest("a")?.getAttribute("to")).toBe("/organizations");
  });
});
