// @vitest-environment jsdom
import type { CanonicalGoalObjective, ProfileGoalRecord } from "@repo/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "./index";

const mocks = vi.hoisted(() => ({
  goal: null as ProfileGoalRecord | null,
  navigate: vi.fn(),
  search: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ goalId: "goal-1" }),
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.search,
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/goals">{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("../../../../lib/planning/server-actions", () => ({ deletePlanGoalAction: {} }));
vi.mock("../../../../components/route-flash-toast", () => ({
  RouteFlashToast: ({ clear }: { clear: () => void }) => (
    <button onClick={clear} type="button">
      Clear flash
    </button>
  ),
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    activities: {
      listPaginated: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [], total: 0, hasMore: false }] },
          isFetching: false,
          isError: false,
          fetchNextPage: vi.fn(),
          refetch: vi.fn(),
        }),
      },
    },
    profiles: { get: { useQuery: () => ({ data: { planning_timezone: "America/Los_Angeles" } }) } },
    goals: {
      getById: { useQuery: () => ({ data: mocks.goal, isLoading: false, isError: false }) },
    },
    athleteIntelligence: {
      getGoalAssessment: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
      getGoalProgress: {
        useQuery: () => ({
          data: {
            result: { status: "unsupported", reason: "non_threshold_goal", goalId: "goal-1" },
            provenance: null,
            publication: null,
          },
          isLoading: false,
          isError: false,
        }),
      },
      getThresholdOverview: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
  },
}));
afterEach(() => {
  cleanup();
  mocks.navigate.mockReset();
  mocks.search = {};
});

it("starts independent goal sections before awaiting primary data", async () => {
  const loader = Route.options.loader;
  if (typeof loader !== "function") throw new Error("Missing goal loader");
  let resolvePrimary: (value: object) => void = () => undefined;
  const primary = new Promise<object>((resolve) => {
    resolvePrimary = resolve;
  });
  const fetchGoal = vi.fn(() => primary);
  const assessment = vi.fn(() => new Promise<void>(() => undefined));
  const progress = vi.fn(() => new Promise<void>(() => undefined));
  const result = loader({
    params: { goalId: "goal-1" },
    context: {
      apiUtils: {
        goals: { getById: { getData: () => undefined, fetch: fetchGoal } },
        profiles: { get: { prefetch: vi.fn().mockResolvedValue(undefined) } },
        athleteIntelligence: {
          getGoalAssessment: { prefetch: assessment },
          getGoalProgress: { prefetch: progress },
        },
      },
    },
  } as never);
  expect(assessment).toHaveBeenCalledWith({ goalId: "goal-1" });
  expect(progress).toHaveBeenCalledWith({ goalId: "goal-1" });
  expect(fetchGoal).toHaveBeenCalledWith({ id: "goal-1" }, { retry: false });
  resolvePrimary({ title: "Goal" });
  await expect(result).resolves.toBeUndefined();
});

it.each<{ objective: CanonicalGoalObjective; expected: string }>([
  {
    objective: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 5000,
      target_time_s: 1500,
    },
    expected: "5 km · 25:00",
  },
  {
    objective: { type: "threshold", activity_category: "bike", metric: "power", value: 250 },
    expected: "250 W",
  },
  {
    objective: { type: "completion", distance_m: 10000, duration_s: 3600 },
    expected: "10 km in 1:00:00",
  },
  {
    objective: { type: "consistency", target_sessions_per_week: 3, target_weeks: 8 },
    expected: "3 sessions/week for 8 weeks",
  },
])("renders the complete $objective.type objective", ({ objective, expected }) => {
  mocks.goal = {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "22222222-2222-4222-8222-222222222222",
    title: "My goal",
    target_date: "2026-11-01",
    priority: 7,
    activity_category:
      "activity_category" in objective ? (objective.activity_category ?? "run") : "run",
    target_payload: objective,
  };
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing route component");
  render(<Component />);
  expect(screen.getByText(expected)).toBeTruthy();
  if (objective.type === "threshold") {
    expect(screen.getByText("Progress charts are not available for this goal type.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  } else {
    expect(
      screen.getByText("Recorded history", { selector: "[data-slot='card-title']" }),
    ).toBeTruthy();
    expect(screen.queryByText("Progress charts are not available for this goal type.")).toBeNull();
    if (objective.type === "consistency") expect(screen.getByRole("img")).toBeTruthy();
  }
  expect(
    screen.queryByText(
      /What influences your assessment|Your approach|Next step|Evidence and assumptions/,
    ),
  ).toBeNull();
});

it("clears goal flash state through replacement navigation without dropping other search", () => {
  mocks.goal = {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "22222222-2222-4222-8222-222222222222",
    title: "My goal",
    target_date: "2026-11-01",
    priority: 7,
    activity_category: "run",
    target_payload: { type: "consistency", target_sessions_per_week: 3, target_weeks: 8 },
  };
  mocks.search = { flash: "Saved", flashType: "success", view: "details" };
  const Component = Route.options.component;
  if (!Component) throw new Error("Missing route component");
  render(<Component />);

  fireEvent.click(screen.getByRole("button", { name: "Clear flash" }));

  const options = mocks.navigate.mock.calls[0]?.[0] as {
    replace: boolean;
    search: (previous: Record<string, unknown>) => Record<string, unknown>;
  };
  expect(options.replace).toBe(true);
  expect(options.search(mocks.search)).toEqual({
    flash: undefined,
    flashType: undefined,
    view: "details",
  });
});
