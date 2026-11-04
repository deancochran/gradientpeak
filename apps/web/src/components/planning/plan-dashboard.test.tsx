// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  goalInput: vi.fn(),
  profile: {
    data: { id: "profile" },
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
  projection: { data: {} as unknown, isError: false, isLoading: false, refetch: vi.fn() },
  goals: {
    data: { items: [] },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/planning">{children}</a>,
}));
vi.mock("../../lib/planning", () => ({
  formatShortDayLabel: (date: string) => date,
  getMonthKey: () => "2026-04",
  getTodayDateKey: () => "2026-04-01",
  shiftDateKey: (date: string) => date,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    profiles: { get: { useQuery: () => state.profile } },
    trainingPlans: {
      getPlanTabProjection: {
        useQuery: () => state.projection,
      },
      list: { useQuery: () => ({ data: { items: [] }, isError: false, isLoading: false }) },
    },
    calendar: {
      range: {
        useQuery: () => ({
          data: { items: [] },
          isError: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
    goals: {
      list: {
        useQuery: (input: unknown) => {
          state.goalInput(input);
          return state.goals;
        },
      },
    },
  },
}));
vi.mock("../../components/protected/plan-goal-form", () => ({ PlanGoalForm: () => null }));

import { PlanDashboard } from "./plan-dashboard";

afterEach(() => {
  cleanup();
  state.goalInput.mockReset();
  state.profile = {
    data: { id: "profile" },
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
  state.projection = { data: {}, isError: false, isLoading: false, refetch: vi.fn() };
});

it("does not turn a failed profile dependency into absent planning data", () => {
  state.profile = {
    data: undefined,
    isError: true,
    isLoading: false,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
  render(<PlanDashboard />);

  expect(screen.getByText("Active plan is unavailable.")).toBeTruthy();
  expect(screen.getByText("Goal anchors are unavailable.")).toBeTruthy();
  expect(screen.getByText(/planning profile could not be loaded/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry planning profile" })).toBeTruthy();
  expect(screen.queryByText("No upcoming goals.")).toBeNull();
});

it("keeps dependent planning surfaces loading while the profile is loading", () => {
  state.profile = {
    data: undefined,
    isError: false,
    isLoading: true,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
  render(<PlanDashboard />);

  expect(screen.getByText("Loading active plan...")).toBeTruthy();
  expect(screen.getByText("Loading training path…")).toBeTruthy();
  expect(screen.queryByText("Active plan is unavailable.")).toBeNull();
  expect(screen.queryByText("No training path data is ready yet.")).toBeNull();
});

it("reports a missing resolved profile as unavailable and retries the profile dependency", () => {
  const refetch = vi.fn();
  state.profile = {
    data: undefined,
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch,
  } as never;
  render(<PlanDashboard />);

  expect(screen.getByText(/planning profile could not be loaded/)).toBeTruthy();
  screen.getByRole("button", { name: "Retry planning profile" }).click();
  expect(refetch).toHaveBeenCalledOnce();
});

it("does not label an initial projection failure as no active plan", () => {
  state.projection = { data: undefined, isError: true, isLoading: false, refetch: vi.fn() };
  render(<PlanDashboard />);

  expect(screen.getByText("Active plan is unavailable.")).toBeTruthy();
  expect(screen.getByText(/Training path could not be refreshed/)).toBeTruthy();
  expect(screen.queryByText("No active plan detected from future planned sessions.")).toBeNull();
});

it("requests the first future goal with a bounded server-side date predicate", () => {
  render(<PlanDashboard />);
  expect(screen.getByText("No upcoming goals.")).toBeTruthy();
  expect(state.goalInput).toHaveBeenCalledWith(
    expect.objectContaining({
      limit: 1,
      sort_by: "target_date",
      sort_order: "asc",
      target_date_on_or_after: "2026-04-01",
    }),
  );
});
