// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/activity">{children}</a>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: {
        useQuery: () => ({ data: state.data, isError: false, isLoading: false }),
      },
    },
  },
}));

import { Route } from "./thresholds";

afterEach(cleanup);

it("formats current and historical swim speeds as pace per 100m", () => {
  state.data = {
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: {
          status: "available",
          effectiveAt: "2026-04-01T00:00:00Z",
          unit: "meters_per_second",
          value: 4,
        },
        swim: {
          status: "available",
          effectiveAt: "2026-04-01T00:00:00Z",
          unit: "meters_per_second",
          value: 1,
        },
      },
    },
    history: {
      items: [
        {
          activityCategory: "run",
          effectiveAt: "2026-04-01T00:00:00Z",
          sourceActivities: [],
          thresholdId: "run",
          unit: "meters_per_second",
          value: 4,
        },
        {
          activityCategory: "swim",
          effectiveAt: "2026-04-01T00:00:00Z",
          sourceActivities: [],
          thresholdId: "swim",
          unit: "meters_per_second",
          value: 1,
        },
      ],
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(screen.getAllByText(/4:10 \/km/)).toHaveLength(2);
  expect(screen.getAllByText(/1:40 \/100m/)).toHaveLength(2);
});
