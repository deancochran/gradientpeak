// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as unknown,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/activity">{children}</a>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: {
        useQuery: () => ({
          data: state.data,
          isError: state.isError,
          isLoading: false,
          refetch: state.refetch,
        }),
      },
    },
  },
}));

import { Route } from "./thresholds";

afterEach(cleanup);
afterEach(() => {
  state.isError = false;
  state.refetch.mockReset();
});

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
          metric: "speed",
          method: "run_speed_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "run",
          unit: "meters_per_second",
          value: 4,
        },
        {
          activityCategory: "swim",
          effectiveAt: "2026-04-01T00:00:00Z",
          metric: "speed",
          method: "swim_speed_15m",
          policyVersion: "threshold-v1",
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

it("separates bike power and LTHR into independently scaled chronological evidence", () => {
  state.data = {
    current: {
      thresholds: {
        bike: {
          status: "available",
          effectiveAt: "2026-05-01T00:00:00Z",
          unit: "watts",
          value: 260,
        },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          effectiveAt: "2026-04-01T00:00:00Z",
          metric: "lthr",
          method: "lthr_30m_final_20m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-lthr",
          unit: "bpm",
          value: 163,
        },
        {
          activityCategory: "bike",
          effectiveAt: "2026-03-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-power-early",
          unit: "watts",
          value: 240,
        },
        {
          activityCategory: "bike",
          effectiveAt: "2026-05-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-power-latest",
          unit: "watts",
          value: 260,
        },
      ],
      nextCursor: {
        createdAt: "2026-01-01T00:00:00Z",
        effectiveAt: "2026-01-01T00:00:00Z",
        thresholdId: "older",
      },
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(
    screen.getByRole("img", { name: /bike power history.*2 chronological records/i }),
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: /bike LTHR history.*1 chronological records/i }),
  ).toBeTruthy();
  expect(screen.getByText(/newest 100 records/i)).toBeTruthy();
});

it("retains cached data and exposes retry when a refresh fails", () => {
  state.isError = true;
  state.data = {
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [], nextCursor: null },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(screen.getByText(/showing cached threshold data/i)).toBeTruthy();
  screen.getByRole("button", { name: "Try again" }).click();
  expect(state.refetch).toHaveBeenCalledOnce();
});
