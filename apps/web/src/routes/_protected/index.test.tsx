// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
          data: mocks.dashboard,
          isError: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

import { Route } from "./index";

afterEach(cleanup);

describe("Dashboard schedule", () => {
  it("labels the explicit objective-intensity field without a normalized-intensity alias", () => {
    const DashboardPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<DashboardPage />);

    expect(screen.getByText(/Common Load 64 · Intensity 0\.70/)).toBeTruthy();
    expect(screen.queryByText(/Normalized intensity/i)).toBeNull();
  });
});
