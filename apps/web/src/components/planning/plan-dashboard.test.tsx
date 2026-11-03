// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchNextPage: vi.fn(),
  goals: {
    data: {
      pages: [
        {
          items: [
            {
              activity_category: "run",
              id: "past-goal",
              priority: 4,
              target_date: "2020-01-01",
              title: "Past goal",
            },
          ],
        },
      ],
    },
    fetchNextPage: null as unknown,
    hasNextPage: true,
    isError: false,
    isFetchingNextPage: false,
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
    profiles: { get: { useQuery: () => ({ data: { id: "profile" } }) } },
    trainingPlans: {
      getPlanTabProjection: {
        useQuery: () => ({ data: {}, isError: false, isLoading: false, refetch: vi.fn() }),
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
      list: { useInfiniteQuery: () => ({ ...state.goals, fetchNextPage: state.fetchNextPage }) },
    },
  },
}));
vi.mock("./training-load-path", () => ({ TrainingLoadPath: () => null }));
vi.mock("../../components/protected/plan-goal-form", () => ({ PlanGoalForm: () => null }));

import { PlanDashboard } from "./plan-dashboard";

afterEach(() => {
  cleanup();
  state.fetchNextPage.mockReset();
});

it("continues the sorted goal cursor instead of missing a future goal after a full past page", async () => {
  render(<PlanDashboard />);
  await waitFor(() => expect(state.fetchNextPage).toHaveBeenCalledOnce());
});
