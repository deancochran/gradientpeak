// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboard: {
    activePlan: null,
    consistency: { streak: 0, weeklyCount: 0 },
    currentLoadStatus: null,
    schedule: [
      {
        id: "scheduled-1",
        activityName: "Endurance swim",
        activity_category: "swim",
        date: "2026-09-08",
        estimatedDuration: null,
        load: 64,
        objectiveIntensity: 0.7,
      },
    ],
  },
  dashboardQuery: {
    data: null as unknown,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../../components/feed/activity-feed", () => ({
  ActivityFeed: () => <div>Activity feed</div>,
}));
vi.mock("../../components/protected/search-launcher", () => ({
  SearchLauncher: () => <div>Search</div>,
}));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { email: "athlete@example.test" } }),
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    home: {
      getDashboard: {
        useQuery: () => ({
          ...mocks.dashboardQuery,
          data: mocks.dashboardQuery.data,
        }),
      },
    },
  },
}));

import { Route } from "./index";

beforeEach(() => {
  mocks.dashboardQuery = {
    data: mocks.dashboard,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  mocks.dashboardQuery = {
    data: mocks.dashboard,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };
});

describe("Dashboard schedule", () => {
  it("labels the explicit objective-intensity field without a normalized-intensity alias", () => {
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByText(/Common Load 64 · Intensity 0\.70/)).toBeTruthy();
    expect(screen.queryByText(/Normalized intensity/i)).toBeNull();
  });

  it("keeps cached dashboard content visible when a refresh fails", () => {
    mocks.dashboardQuery = {
      data: mocks.dashboard,
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    };
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByText("Endurance swim")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("most recent data");
  });

  it("shows an initial dashboard failure instead of empty dashboard cards", () => {
    mocks.dashboardQuery = { data: undefined, isError: true, isLoading: false, refetch: vi.fn() };
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByRole("alert").textContent).toContain("Dashboard unavailable");
    expect(screen.queryByText("Endurance swim")).toBeNull();
  });
});
