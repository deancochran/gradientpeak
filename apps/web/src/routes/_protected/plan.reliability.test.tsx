// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSearch = vi.hoisted(() => vi.fn());
const useNavigate = vi.hoisted(() => vi.fn());
const profileQuery = vi.hoisted(() => vi.fn());
const activePlanQuery = vi.hoisted(() => vi.fn());
const trainingPlansQuery = vi.hoisted(() => vi.fn());
const eventsQuery = vi.hoisted(() => vi.fn());
const goalsQuery = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    ...options,
    useNavigate,
    useSearch,
  }),
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../components/protected/plan-goal-form", () => ({
  PlanGoalForm: () => <div>Goal form</div>,
}));
vi.mock("../../lib/planning", () => ({
  formatShortDayLabel: (date: string) => date,
  getTodayDateKey: () => "2026-10-31",
}));
vi.mock("@repo/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@repo/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@repo/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@repo/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    profiles: { get: { useQuery: profileQuery } },
    trainingPlans: {
      getActivePlan: { useQuery: activePlanQuery },
      list: { useQuery: trainingPlansQuery },
    },
    events: { list: { useQuery: eventsQuery } },
    goals: { list: { useQuery: goalsQuery } },
  },
}));

import { PlanPage } from "./plan";

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function setQueries(overrides: Record<string, Record<string, unknown>> = {}) {
  profileQuery.mockReturnValue(queryState({ data: { id: "profile" }, ...overrides.profile }));
  activePlanQuery.mockReturnValue(queryState({ data: null, ...overrides.active }));
  trainingPlansQuery.mockReturnValue(queryState({ data: { items: [] }, ...overrides.plans }));
  eventsQuery.mockReturnValue(queryState({ data: { items: [] }, ...overrides.events }));
  goalsQuery.mockReturnValue(queryState({ data: { items: [] }, ...overrides.goals }));
}

describe("plan reliability states", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    useSearch.mockReturnValue({ flash: undefined, flashType: undefined });
    setQueries();
  });

  it("distinguishes loading, unavailable, empty, and populated planning data", () => {
    setQueries({
      events: { data: undefined, isLoading: true },
      goals: { data: undefined, isLoading: true },
      plans: { data: undefined, isLoading: true },
    });
    const view = render(<PlanPage />);
    expect(screen.getByText("Loading scheduled work…")).toBeTruthy();
    expect(screen.getAllByText("Loading goals…").length).toBeGreaterThan(0);

    setQueries({
      events: { data: undefined, isError: true },
      goals: { data: undefined, isError: true },
      plans: { data: undefined, isError: true },
    });
    view.rerender(<PlanPage />);
    expect(screen.getByText("Scheduled work could not be loaded.")).toBeTruthy();
    expect(screen.getAllByText("Goals could not be loaded.").length).toBeGreaterThan(0);
    expect(screen.getByText("Training plans could not be loaded.")).toBeTruthy();

    setQueries();
    view.rerender(<PlanPage />);
    expect(screen.getByText("No upcoming scheduled events yet.")).toBeTruthy();
    expect(screen.getByText("No goals yet. Add one to anchor your plan.")).toBeTruthy();
    expect(screen.getByText("No saved training plans yet.")).toBeTruthy();

    setQueries({
      events: {
        data: { items: [{ id: "event", title: "Long run", scheduled_date: "2026-11-01" }] },
      },
      goals: {
        data: {
          items: [
            {
              id: "goal",
              title: "Race",
              target_date: "2026-12-01",
              priority: 8,
              activity_category: "run",
            },
          ],
        },
      },
      plans: { data: { items: [{ id: "plan", name: "Base" }] } },
    });
    view.rerender(<PlanPage />);
    expect(screen.getByText("Long run")).toBeTruthy();
    expect(screen.getAllByText("Race").length).toBeGreaterThan(0);
    expect(screen.getByText("Base")).toBeTruthy();
  });

  it("keeps cached empty collections visible with their stale error and scoped retry", () => {
    const eventRetry = vi.fn();
    setQueries({
      events: { isError: true, data: { items: [] }, refetch: eventRetry },
      goals: { isError: true, data: { items: [] } },
      plans: { isError: true, data: { items: [] } },
    });
    render(<PlanPage />);
    expect(screen.getByText("No upcoming scheduled events yet.")).toBeTruthy();
    expect(screen.getByText("No goals yet. Add one to anchor your plan.")).toBeTruthy();
    expect(screen.getByText("No saved training plans yet.")).toBeTruthy();
    expect(screen.getByText("Showing last loaded scheduled work.")).toBeTruthy();
    expect(screen.getByText("Showing last loaded goals.")).toBeTruthy();
    expect(screen.getByText("Showing last loaded training plans.")).toBeTruthy();
    const scheduledRetry = screen
      .getByText("Showing last loaded scheduled work.")
      .parentElement?.querySelector("button");
    if (!scheduledRetry) throw new Error("Expected a scheduled work retry");
    fireEvent.click(scheduledRetry);
    expect(eventRetry).toHaveBeenCalled();
  });

  it("does not present a cached-null active plan as an empty plan after an error", () => {
    setQueries({ active: { data: null, isError: true } });
    render(<PlanPage />);
    expect(screen.getByText("The active plan could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No active plan detected from future scheduled events.")).toBeNull();
  });

  it("offers a scoped retry for unavailable scheduled work", () => {
    const retry = vi.fn();
    setQueries({ events: { data: undefined, isError: true, refetch: retry } });
    render(<PlanPage />);
    const retryButton = screen.getAllByRole("button", { name: "Retry" })[0];
    if (!retryButton) throw new Error("Expected an unavailable scheduled work retry");
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalled();
  });
});
