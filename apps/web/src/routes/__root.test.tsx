// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RootErrorPage,
  RootNotFoundPage,
  RootPendingPage,
  Route,
  recoverFromVitePreloadError,
} from "./__root";

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
  it("reloads once for a stale Vite route chunk within the cooldown", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(recoverFromVitePreloadError(event, { now: () => 50_000, reload, storage })).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    const repeatedEvent = new Event("vite:preloadError", { cancelable: true });
    expect(recoverFromVitePreloadError(repeatedEvent, { now: () => 60_000, reload, storage })).toBe(
      false,
    );
    expect(repeatedEvent.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves Vite's default preload failure handling active when storage is unavailable", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();

    expect(
      recoverFromVitePreloadError(event, {
        now: () => 50_000,
        reload,
        storage: {
          getItem: () => {
            throw new Error("storage unavailable");
          },
          setItem: vi.fn(),
        },
      }),
    ).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps Vite's default handling when the reload guard cannot be persisted", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();

    expect(
      recoverFromVitePreloadError(event, {
        now: () => 50_000,
        reload,
        storage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("storage unavailable");
          },
        },
      }),
    ).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

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
