// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useDashboardQuery = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => options,
}));

vi.mock("@repo/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("../../components/protected/search-launcher", () => ({
  SearchLauncher: () => <div>Search</div>,
}));

vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { email: "athlete@example.com" } }),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    home: {
      getDashboard: {
        useQuery: useDashboardQuery,
      },
    },
  },
}));

import { DashboardPage } from "./index";

const dashboard = {
  activePlan: null,
  consistency: { streak: 3, weeklyCount: 2 },
  currentStatus: { atl: 31, ctl: 42, form: 11 },
  schedule: [],
};

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("dashboard reliability states", () => {
  beforeEach(() => {
    cleanup();
    useDashboardQuery.mockReset();
  });

  it("distinguishes initial loading, an unavailable dashboard, and a loaded empty schedule", () => {
    useDashboardQuery.mockReturnValue(queryState({ isLoading: true, isFetching: true }));
    const view = render(<DashboardPage />);
    expect(screen.getByText("Loading upcoming activities...")).toBeTruthy();
    expect(screen.getByText("Loading active plan")).toBeTruthy();

    useDashboardQuery.mockReturnValue(queryState({ isError: true }));
    view.rerender(<DashboardPage />);
    expect(screen.getByText("Upcoming activities could not be loaded.")).toBeTruthy();
    expect(screen.getByText("Active plan could not be loaded")).toBeTruthy();

    useDashboardQuery.mockReturnValue(queryState({ data: dashboard }));
    view.rerender(<DashboardPage />);
    expect(screen.getByText("No upcoming sessions scheduled.")).toBeTruthy();
    expect(screen.getAllByText("No active plan").length).toBeGreaterThan(0);
  });

  it("keeps stale dashboard data visible while it refreshes", () => {
    useDashboardQuery.mockReturnValue(queryState({ data: dashboard, isFetching: true }));
    render(<DashboardPage />);

    expect(screen.getByText("Refreshing dashboard…")).toBeTruthy();
    expect(screen.getAllByText("11").length).toBeGreaterThan(0);
  });

  it("keeps cached dashboard data visible alongside its scoped stale-error retry", () => {
    useDashboardQuery.mockReturnValue(queryState({ data: dashboard, isError: true }));
    render(<DashboardPage />);

    expect(screen.getAllByText("11").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing your last loaded dashboard data.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("offers a scoped retry for an unavailable dashboard", () => {
    const retry = vi.fn();
    useDashboardQuery.mockReturnValue(queryState({ isError: true, refetch: retry }));
    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });
});
