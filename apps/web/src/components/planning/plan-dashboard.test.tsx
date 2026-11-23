// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  goalInput: vi.fn(),
  projectionInput: vi.fn(),
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
  selectedDay: {
    data: { projection: { items: [] } },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: React.ReactNode;
    params?: Record<string, string>;
    search?: { resourceType?: string };
  }) => (
    <a
      data-event-id={params?.eventId}
      data-goal-id={params?.goalId}
      data-resource-type={search?.resourceType}
      href="/planning"
    >
      {children}
    </a>
  ),
}));
vi.mock("../../lib/planning", () => ({
  formatShortDayLabel: (date: string) => date,
  formatDayLabel: (date: string) => date,
  getMonthKey: () => "2026-04",
  getTodayDateKey: () => "2026-04-01",
  isValidDateKey: (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date),
  shiftDateKey: (date: string) => date,
}));
vi.mock("../calendar/calendar-projection-card", () => ({
  CalendarProjectionCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    profiles: { get: { useQuery: () => state.profile } },
    trainingPlans: {
      getPlanTabProjection: {
        useQuery: (input: unknown) => {
          state.projectionInput(input);
          return state.projection;
        },
      },
      list: { useQuery: () => ({ data: { items: [] }, isError: false, isLoading: false }) },
    },
    calendar: {
      day: { useQuery: () => state.selectedDay },
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
  state.projectionInput.mockReset();
  state.profile = {
    data: { id: "profile" },
    isError: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
  state.projection = { data: {}, isError: false, isLoading: false, refetch: vi.fn() };
  state.goals = {
    data: { items: [] },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };
  state.selectedDay = {
    data: { projection: { items: [] } },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  };
});

it("uses the projection's authoritative day for selected-day status and the goal lower bound", () => {
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: {
        days: [
          {
            date: "2026-04-02",
            load: {
              completedLoad: 12.5,
              completedLoadStatus: "partial",
              plannedLoad: 0,
              plannedLoadStatus: "known_zero",
              scheduledLoad: 0,
              scheduledLoadStatus: "known_zero",
              remainingLoad: 0,
              remainingLoadStatus: "known_zero",
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable",
              deltaLoad: null,
            },
            scheduledItems: [],
            completedItems: [],
            annotations: [],
          },
        ],
      },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("Today", { exact: true })).toBeTruthy();
  expect(screen.getByText("Observed Load: ~12.5")).toBeTruthy();
  expect(screen.getByText("Planned Load: 0 (zero)")).toBeTruthy();
  expect(state.goalInput).toHaveBeenCalledWith(
    expect.objectContaining({ target_date_on_or_after: "2026-04-02" }),
  );
});

it("reanchors a no-URL selection to the server planning day without navigation", async () => {
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: {
        days: [
          {
            date: "2026-04-02",
            load: {
              completedLoad: 0,
              completedLoadStatus: "known_zero",
              plannedLoad: 0,
              plannedLoadStatus: "known_zero",
              scheduledLoad: 0,
              scheduledLoadStatus: "known_zero",
              remainingLoad: 0,
              remainingLoadStatus: "known_zero",
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable",
              deltaLoad: null,
            },
            scheduledItems: [],
            completedItems: [],
            annotations: [],
          },
        ],
      },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard />);

  await waitFor(() =>
    expect(state.projectionInput).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-04-02", endDate: "2026-04-02" }),
    ),
  );
  expect(screen.getByText("Today", { exact: true })).toBeTruthy();
  expect(state.goalInput).toHaveBeenCalledWith(
    expect.objectContaining({ target_date_on_or_after: "2026-04-02" }),
  );
});

it("does not turn a failed profile dependency into absent planning data", () => {
  state.profile = {
    data: undefined,
    isError: true,
    isLoading: false,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
  state.projection = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  render(<PlanDashboard />);

  expect(screen.getByText(/planning profile could not be loaded/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry planning profile" })).toBeTruthy();
  expect(screen.getByText("Today’s next action is unavailable")).toBeTruthy();
});

it("keeps dependent planning surfaces loading while the profile is loading", () => {
  state.profile = {
    data: undefined,
    isError: false,
    isLoading: true,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
  state.projection = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  render(<PlanDashboard />);

  expect(screen.getByText("Loading training path…")).toBeTruthy();
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
  state.projection = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  render(<PlanDashboard />);

  expect(screen.getByText(/planning profile could not be loaded/)).toBeTruthy();
  screen.getByRole("button", { name: "Retry planning profile" }).click();
  expect(refetch).toHaveBeenCalledOnce();
});

it("does not label an initial projection failure as no active plan", () => {
  state.projection = { data: undefined, isError: true, isLoading: false, refetch: vi.fn() };
  render(<PlanDashboard />);

  expect(screen.getByText(/Training path could not be refreshed/)).toBeTruthy();
});

it("keeps a cached projection visible when its refresh fails", () => {
  state.projection = {
    data: {
      today: "2026-04-01",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  render(<PlanDashboard selectedDate="2026-04-01" />);

  expect(screen.getByRole("alert").textContent).toMatch(/may be stale/);
  expect(screen.getByRole("heading", { name: "Training path" })).toBeTruthy();
  expect(screen.queryByText(/Training path could not be refreshed/)).toBeNull();
});

it("keeps cached profile-backed planning data visible when the profile refresh fails", () => {
  state.profile = {
    data: { id: "profile" },
    isError: true,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-01",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  render(<PlanDashboard selectedDate="2026-04-01" />);

  expect(screen.getByRole("alert").textContent).toMatch(/may be stale/);
  expect(screen.getByRole("heading", { name: "Training path" })).toBeTruthy();
  expect(screen.queryByText(/planning profile could not be loaded/)).toBeNull();
});

it("keeps compact goal, library, and current-session access available", () => {
  state.goals = {
    data: {
      items: [
        {
          id: "goal-1",
          title: "Spring race",
          target_date: "2026-05-10",
          priority: 7,
          activity_category: "run",
        },
      ],
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-01",
      currentScheduledPlan: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Race build",
        applicationReceipt: "receipt",
        nextPlannedSessionId: "00000000-0000-4000-8000-000000000002",
        nextPlannedSessionTitle: "Tempo",
        nextPlannedSessionDate: "2026-04-03",
        nextActivityPlanId: null,
      },
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-01" />);

  expect(screen.getByText("Race build")).toBeTruthy();
  const nextSession = screen.getByRole("link", { name: "2026-04-03" });
  expect(nextSession.getAttribute("data-event-id")).toBe("00000000-0000-4000-8000-000000000002");
  expect(nextSession.getAttribute("data-resource-type")).toBe("planned_session");
  expect(screen.getByRole("button", { name: "New goal" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open training-plan library" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "All goals" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Spring race/ }).getAttribute("data-goal-id")).toBe(
    "goal-1",
  );
});

it("only offers a follow-session action for a canonically scheduled session", () => {
  state.selectedDay = {
    data: {
      projection: {
        items: [
          {
            id: "completed-session",
            calendarDate: "2026-04-02",
            kind: "planned_activity",
            status: "completed",
            plannedSession: { lifecycle: { status: "completed" } },
          },
          {
            id: "scheduled-session",
            calendarDate: "2026-04-02",
            kind: "planned_activity",
            status: "scheduled",
            title: "Tempo session",
            plannedSession: { lifecycle: { status: "scheduled" } },
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: {
        days: [
          {
            date: "2026-04-02",
            load: {
              completedLoad: 0,
              completedLoadStatus: "known_zero",
              plannedLoad: null,
              plannedLoadStatus: "unavailable",
              scheduledLoad: 30,
              scheduledLoadStatus: "complete",
              remainingLoad: 30,
              remainingLoadStatus: "complete",
              recommendedLoad: null,
              recommendedLoadStatus: "unavailable",
              deltaLoad: null,
            },
            scheduledItems: [],
            completedItems: [],
            annotations: [],
          },
        ],
      },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getAllByText("Tempo session").length).toBeGreaterThan(0);
  const openSession = screen.getByRole("link", { name: /Open session/ });
  expect(openSession.getAttribute("data-event-id")).toBe("scheduled-session");
  expect(openSession.getAttribute("data-resource-type")).toBe("planned_session");
  expect(
    screen.getByText(
      "Planned Load is unavailable for this day. Scheduled work is listed below with its own available details.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Session complete")).toBeNull();
});

it("shows completed work truthfully instead of offering an already completed session", () => {
  state.selectedDay = {
    data: {
      projection: {
        items: [
          {
            id: "completed-session",
            calendarDate: "2026-04-02",
            kind: "planned_activity",
            status: "completed",
            plannedSession: { lifecycle: { status: "completed" } },
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("Session complete")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Open session/ })).toBeNull();
});

it("does not offer a next-session action for a cancelled session", () => {
  state.selectedDay = {
    data: {
      projection: {
        items: [
          {
            id: "cancelled-session",
            calendarDate: "2026-04-02",
            kind: "planned_activity",
            status: "cancelled",
            plannedSession: { lifecycle: { status: "scheduled" } },
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("No session scheduled")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Open session/ })).toBeNull();
});

it("does not offer an empty-day action while today is still loading", () => {
  state.selectedDay = {
    data: undefined,
    isError: false,
    isLoading: true,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("Loading today’s next action...")).toBeTruthy();
  expect(screen.queryByText("No session scheduled")).toBeNull();
  expect(screen.queryByRole("link", { name: "Add work" })).toBeNull();
});

it("does not offer an empty-day action when today cannot be loaded", () => {
  state.selectedDay = {
    data: undefined,
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("Today’s next action is unavailable")).toBeTruthy();
  expect(screen.queryByText("No session scheduled")).toBeNull();
  expect(screen.queryByRole("link", { name: "Add work" })).toBeNull();
});

it("keeps cached failed empty-day data visibly stale and withholds its add action", () => {
  state.selectedDay = {
    data: { projection: { items: [] } },
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByRole("alert").textContent).toMatch(/may be stale/);
  expect(screen.getByText("No session in the last available update")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Add work" })).toBeNull();
});

it("offers an empty-day action after a successful current-day result", () => {
  state.selectedDay = {
    data: { projection: { items: [] } },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;
  state.projection = {
    data: {
      today: "2026-04-02",
      timeline: { days: [], weeks: [] },
      fitness: { actual: [], scheduled: [], recommended: [] },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  } as never;

  render(<PlanDashboard selectedDate="2026-04-02" />);

  expect(screen.getByText("No session scheduled")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add work" })).toBeTruthy();
});

it("requests the first future goal with a bounded server-side date predicate", () => {
  render(<PlanDashboard />);
  expect(screen.queryByText("No upcoming goals.")).toBeNull();
  expect(state.goalInput).toHaveBeenCalledWith(
    expect.objectContaining({
      limit: 1,
      sort_by: "target_date",
      sort_order: "asc",
      target_date_on_or_after: "2026-04-01",
    }),
  );
});
