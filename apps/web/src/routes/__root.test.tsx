// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RootErrorPage, RootNotFoundPage, RootPendingPage, Route } from "./__root";

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (options: object) => options,
  HeadContent: () => null,
  Link: ({ children, to }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={to}>{children}</a>
  ),
  Scripts: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("root route states", () => {
  it("registers intentional pending, error, and not-found components", () => {
    expect(Route).toMatchObject({
      pendingComponent: RootPendingPage,
      errorComponent: RootErrorPage,
      notFoundComponent: RootNotFoundPage,
    });
  });

  it("announces a useful pending state", () => {
    render(<RootPendingPage />);

    expect(screen.getByRole("status").textContent).toContain("Loading GradientPeak");
    expect(screen.getByText("Preparing your training workspace.")).toBeTruthy();
  });

  it("offers recovery without exposing raw error details", () => {
    const reset = vi.fn();

    render(<RootErrorPage error={new Error("private stack detail")} reset={reset} />);

    expect(screen.queryByText(/private stack detail/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Return to dashboard" }).getAttribute("href")).toBe(
      "/",
    );
  });

  it("provides useful same-app navigation when a page is missing", () => {
    render(<RootNotFoundPage />);

    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Search GradientPeak" }).getAttribute("href")).toBe(
      "/search",
    );
  });
});
