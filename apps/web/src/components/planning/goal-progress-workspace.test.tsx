// @vitest-environment jsdom

import { skipToken } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  historyInput: vi.fn(),
  progressInput: vi.fn(),
  progress: { data: undefined as unknown, isError: false, isLoading: true, refetch: vi.fn() },
  thresholdOverview: { data: undefined, isError: false, isLoading: false, refetch: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { goalId: string } }) => (
    <a href={`/goals/${params.goalId}`}>{children}</a>
  ),
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getGoalProgress: {
        useQuery: (input: unknown) => {
          state.progressInput(input);
          return state.progress;
        },
      },
      getThresholdOverview: {
        useQuery: (input: unknown) => {
          state.historyInput(input);
          return state.thresholdOverview;
        },
      },
    },
  },
}));
vi.mock("./goal-progress-chart", () => ({
  GoalProgressChart: ({ data, history }: { data: unknown; history: unknown[] }) => (
    <p data-testid="goal-progress-chart">
      {data ? "progress data" : "no progress data"} · {history.length} history measurements
    </p>
  ),
}));

import { GoalProgressWorkspace } from "./goal-progress-workspace";

afterEach(() => {
  state.historyInput.mockReset();
  state.progressInput.mockReset();
  state.progress = {
    data: undefined as unknown,
    isError: false,
    isLoading: true,
    refetch: vi.fn(),
  };
  state.thresholdOverview = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
});

const goal = { id: "goal-1", target_date: "2026-06-01", title: "Summer threshold" };

it("waits for canonical goal progress before requesting threshold history", () => {
  render(<GoalProgressWorkspace goal={goal} planningTimezone="UTC" />);

  expect(state.progressInput).toHaveBeenCalledWith({ goalId: "goal-1" });
  expect(state.historyInput).toHaveBeenCalledWith(skipToken);
  expect(screen.getByTestId("goal-progress-chart").textContent).toContain("no progress data");
});

it("keeps an unsupported goal compact while preserving its date and goal link", () => {
  state.progress = {
    data: {
      result: { status: "unsupported", reason: "non_threshold_goal", goalId: "goal-1" },
      provenance: null,
      publication: null,
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };

  render(<GoalProgressWorkspace goal={goal} planningTimezone="UTC" />);

  expect(state.historyInput).toHaveBeenCalledWith(skipToken);
  expect(screen.getByTestId("goal-progress-unsupported").textContent).toContain(
    "Observed numerical progress is unavailable for this goal.",
  );
  expect(screen.getByRole("link", { name: "View goal" }).getAttribute("href")).toBe(
    "/goals/goal-1",
  );
});
