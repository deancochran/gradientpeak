// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
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
  thresholdQuery: {
    data: null as unknown,
    isError: false,
    isLoading: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.invalidate }),
  createFileRoute: () => (options: object) => ({ ...options }),
  Link: ({
    children,
    search,
    to,
  }: {
    children: React.ReactNode;
    search?: { date?: string };
    to: string;
  }) => (
    <a data-date={search?.date} href={to}>
      {children}
    </a>
  ),
}));
vi.mock("../../components/feed/activity-feed", () => ({
  ActivityFeed: () => <div>Activity feed</div>,
}));
vi.mock("../../components/protected/search-launcher", () => ({
  SearchLauncher: () => <div>Search</div>,
}));
vi.mock("../../components/planning/plan-dashboard", () => ({
  PlanDashboard: () => <section aria-label="Training workspace">Training workspace</section>,
}));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { email: "athlete@example.test" } }),
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: { useQuery: () => mocks.thresholdQuery },
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

it("keeps cold loader failures actionable through router retry", () => {
  const ErrorPage = (Route as unknown as { errorComponent: React.ComponentType }).errorComponent;
  render(<ErrorPage />);
  expect(screen.getByRole("alert").textContent).toContain("Dashboard unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry dashboard" }));
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

beforeEach(() => {
  mocks.dashboardQuery = {
    data: mocks.dashboard,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };
  mocks.thresholdQuery = { data: null, isError: false, isLoading: false };
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

  it("leads with the connected training workspace and links upcoming work to its date", () => {
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByRole("region", { name: "Training workspace" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Endurance swim/ }).getAttribute("data-date")).toBe(
      "2026-09-08",
    );
    expect(screen.queryByText("Current Focus")).toBeNull();
  });

  it("does not infer a current threshold from the read-model publication state", () => {
    mocks.thresholdQuery = {
      data: {
        current: {
          thresholds: {
            bike: { status: "unavailable" },
            run: { status: "unavailable" },
            swim: { status: "unavailable" },
          },
        },
        publication: { status: "available" },
      },
      isError: false,
      isLoading: false,
    };
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByText("No current calculated thresholds")).toBeTruthy();
    expect(screen.getByText("0 current")).toBeTruthy();
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
