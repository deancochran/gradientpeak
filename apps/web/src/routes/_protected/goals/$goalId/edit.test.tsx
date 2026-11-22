// @vitest-environment jsdom
import type { CanonicalGoalObjective, ProfileGoalRecord } from "@repo/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./edit";

const mocks = vi.hoisted(() => ({ goal: null as ProfileGoalRecord | null, action: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ goalId: mocks.goal?.id }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/goals">{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    goals: {
      getById: { useQuery: () => ({ data: mocks.goal, isLoading: false, isError: false }) },
    },
    useUtils: () => ({
      goals: { invalidate: vi.fn() },
      athleteIntelligence: { invalidate: vi.fn() },
    }),
  },
}));
vi.mock("../../../../lib/planning/server-actions", () => ({
  createPlanGoalAction: {},
  updatePlanGoalAction: {},
}));
vi.mock("../../../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({ guardedCancel: vi.fn(), markSaved: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
});

const cases = [
  {
    objective: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 42195.123,
      target_speed_mps: 3.123456,
    },
    label: "Distance (km)",
    value: "43",
    changed: { distance_m: 43000 },
  },
  {
    objective: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 42195.123,
      target_time_s: 15000,
      environment: "trail",
      tolerance_pct: 0.03,
    },
    label: "Goal time",
    value: "4:00:00",
    changed: { target_time_s: 14400 },
  },
  {
    objective: {
      type: "threshold",
      metric: "pace",
      activity_category: "swim",
      value: 1.123456,
      tolerance_pct: 0.02,
    },
    label: "Test duration",
    value: "30:00",
    changed: { test_duration_s: 1800 },
  },
  {
    objective: { type: "threshold", metric: "power", activity_category: "run", value: 250.125 },
    label: "Watts",
    value: "275",
    changed: { value: 275 },
  },
  {
    objective: { type: "threshold", metric: "hr", value: 170, test_duration_s: 1201 },
    label: "Target bpm",
    value: "175",
    changed: { value: 175 },
  },
  {
    objective: { type: "completion", distance_m: 25.123 },
    label: "Duration",
    value: "1:00",
    changed: { duration_s: 60 },
  },
  {
    objective: { type: "consistency", target_weeks: 6 },
    label: "Weeks",
    value: "7",
    changed: { target_weeks: 7 },
  },
] satisfies { objective: CanonicalGoalObjective; label: string; value: string; changed: object }[];

function mount(objective: CanonicalGoalObjective) {
  mocks.goal = {
    id: "33333333-3333-4333-8333-333333333333",
    profile_id: "11111111-1111-4111-8111-111111111111",
    title: "Original goal",
    target_date: "2026-11-01",
    priority: 7,
    activity_category:
      "activity_category" in objective && objective.activity_category
        ? objective.activity_category
        : "run",
    target_payload: objective,
  };
  mocks.action.mockResolvedValue({ status: "error", message: "Retry available" });
  const Component = Route.options.component;
  if (!Component) throw new Error("Expected goal edit route component");
  render(<Component />);
}

describe("goal edit route with its real form and Core adapters", () => {
  it.each(cases)("retains the existing variant and all untouched values %#", async ({
    objective,
    label,
    value,
    changed,
  }) => {
    mount(objective);
    fireEvent.submit(screen.getByTestId("goal-form"));
    await screen.findByRole("alert");
    expect(mocks.action.mock.calls[0]?.[0].data.target_payload).toStrictEqual(objective);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed goal" } });
    fireEvent.submit(screen.getByTestId("goal-form"));
    await screen.findByRole("alert");
    expect(mocks.action.mock.calls[1]?.[0].data).toMatchObject({
      title: "Renamed goal",
      target_payload: objective,
    });
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.blur(screen.getByLabelText(label));
    fireEvent.submit(screen.getByTestId("goal-form"));
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(3));
    expect(mocks.action.mock.calls[2]?.[0].data.target_payload).toStrictEqual({
      ...objective,
      ...changed,
    });
    expect(mocks.action.mock.calls[2]?.[0].data).not.toHaveProperty("originalGoal");
  });

  it.each([
    { objective: { type: "completion", distance_m: 42195 }, label: "Duration" },
    { objective: { type: "threshold", metric: "power", value: 250 }, label: "Test duration" },
  ] satisfies {
    objective: CanonicalGoalObjective;
    label: string;
  }[])("blocks invalid optional duration without losing the draft %#", async ({
    objective,
    label,
  }) => {
    mount(objective);
    fireEvent.change(screen.getByLabelText(label), { target: { value: "1:bad" } });
    fireEvent.blur(screen.getByLabelText(label));
    fireEvent.submit(screen.getByTestId("goal-form"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/valid.*duration/);
    expect(mocks.action).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveProperty("value", "1:bad");
    fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    fireEvent.submit(screen.getByTestId("goal-form"));
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(mocks.action.mock.calls[0]?.[0].data.target_payload).toStrictEqual(objective);
  });
});
