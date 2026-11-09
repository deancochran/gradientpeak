import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { type CanonicalGoalObjective, parseProfileGoalRecord } from "@repo/core";
import { activityDisplayModelSchema } from "@repo/core/contracts/read-projections";
import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const queryMock = jest.fn();
const fetchNextPage = jest.fn();
const refetch = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    activities: { listPaginated: { useInfiniteQuery: (...args: unknown[]) => queryMock(...args) } },
  },
}));
jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Polyline: createHost("Polyline"),
  Rect: createHost("Rect"),
}));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("../../plan/insights/PlanProgressInsight", () => ({
  formatGoalTimeLeft: () => "83 days left",
}));
const { RecordedGoalHistory } = require("../RecordedGoalHistory");
type Page = inferRouterOutputs<AppRouter>["activities"]["listPaginated"];
function activity(id: string, distance = 5000, elapsed = 1600) {
  return activityDisplayModelSchema.parse({
    contractVersion: "activity-display-v1",
    id,
    href: `/activities/${id}`,
    title: `Run ${id}`,
    owner: { id: "owner", username: null, avatarUrl: null },
    time: { startedAt: "2026-03-09T15:00:00Z", finishedAt: "2026-03-09T16:00:00Z" },
    activityComposition: { kind: "single", categories: ["run"] },
    notes: null,
    metrics: [
      {
        key: "distance",
        label: "Distance",
        status: "available",
        value: distance,
        unit: "meters",
        reason: null,
      },
      {
        key: "elapsed_duration",
        label: "Elapsed",
        status: "available",
        value: elapsed,
        unit: "seconds",
        reason: null,
      },
    ],
    visibility: "private",
    engagement: { likes: 0, comments: 0, viewerHasLiked: false },
    capabilities: {
      canLike: false,
      canComment: false,
      canShare: false,
      canEdit: true,
      canDelete: true,
      hasRoute: false,
    },
  });
}
function goal(
  objective: CanonicalGoalObjective = {
    type: "event_performance",
    activity_category: "run",
    distance_m: 5000,
    target_time_s: 1500,
  },
) {
  return parseProfileGoalRecord({
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "22222222-2222-4222-8222-222222222222",
    title: "Goal",
    priority: 1,
    target_date: "2026-06-01",
    activity_category: "run",
    target_payload: objective,
  });
}
function state(pages: Page[] | undefined, overrides: Record<string, unknown> = {}) {
  return {
    data: pages ? { pages } : undefined,
    isFetching: false,
    isError: false,
    isFetchNextPageError: false,
    fetchNextPage,
    refetch,
    ...overrides,
  };
}
function page(items = [activity("one")], hasMore = false): Page {
  return { items, total: items.length, hasMore, ...(hasMore ? { nextCursor: "50" } : {}) };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-03-10T12:00:00Z"));
  queryMock.mockReset();
  fetchNextPage.mockReset();
  refetch.mockReset();
  queryMock.mockReturnValue(state([page()]));
});
afterEach(() => jest.useRealTimers());

it("shows the exact observed event time, distance band and selected activity source", async () => {
  queryMock.mockReturnValue(
    state([page([activity("one", 4950, 1600), activity("two", 5050, 1550)])]),
  );
  const open = jest.fn();
  await renderNative(
    <RecordedGoalHistory goal={goal()} timezone="America/Los_Angeles" onOpenActivity={open} />,
  );
  expect(screen.getByText("Within 1% of 5 km")).toBeTruthy();
  expect(screen.getByText("25 min 50 sec")).toBeTruthy();
  expect(screen.getByText("50 sec")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("recorded-event_time-one"));
  await fireEvent.press(screen.getByTestId("recorded-source-event_time-one"));
  expect(open).toHaveBeenCalledWith("one");
  expect(screen.getByText("Distance: 4.95 km · Elapsed: 26 min 40 sec")).toBeTruthy();
  expect(
    screen.queryByText(
      /What influences your assessment|Your approach|Next step|Evidence and assumptions/,
    ),
  ).toBeNull();
  expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
    limit: 50,
    composition_mode: "single_only",
    activity_category: "run",
    sort_order: "asc",
    date_from: "2025-12-22T08:00:00.000Z",
  });
});

it("fetches more pages and deduplicates the completed observation list", async () => {
  const first = page([activity("one")], true);
  queryMock.mockReturnValue(state([first]));
  const view = await renderNative(
    <RecordedGoalHistory goal={goal()} timezone="UTC" onOpenActivity={jest.fn()} />,
  );
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Loading recorded history…")).toBeTruthy();
  queryMock.mockReturnValue(state([first, page([activity("one"), activity("two")])]));
  await view.rerender(
    <RecordedGoalHistory goal={goal()} timezone="UTC" onOpenActivity={jest.fn()} />,
  );
  expect(screen.getAllByTestId("recorded-event_time-one")).toHaveLength(1);
  expect(screen.getByTestId("recorded-event_time-two")).toBeTruthy();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Loading recorded history…")).toBeNull();
});

it("shows complete weekly zeros, current-week progress and weeks-only goals without an invented target", async () => {
  await renderNative(
    <RecordedGoalHistory
      goal={goal({ type: "consistency", target_weeks: 6 })}
      timezone="UTC"
      onOpenActivity={jest.fn()}
    />,
  );
  expect(screen.getByText("Target duration: 6 weeks")).toBeTruthy();
  expect(screen.getByText("Not specified")).toBeTruthy();
  expect(screen.queryByTestId("recorded-target-sessions")).toBeNull();
  expect(screen.getByTestId("recorded-sessions-2026-03-09").props.accessibilityLabel).toContain(
    "1 session · In progress",
  );
  expect(screen.getByTestId("recorded-sessions-2026-03-02").props.accessibilityLabel).toContain(
    "0 sessions",
  );
});

it("keeps completion dimensions separate and incomplete weekly buckets unknown", async () => {
  const view = await renderNative(
    <RecordedGoalHistory
      goal={goal({ type: "completion", distance_m: 10000, duration_s: 3600 })}
      timezone="UTC"
      onOpenActivity={jest.fn()}
    />,
  );
  expect(screen.getByTestId("recorded-target-distance")).toBeTruthy();
  expect(screen.getByTestId("recorded-target-elapsed")).toBeTruthy();
  queryMock.mockReturnValue(state(Array.from({ length: 20 }, () => page([activity("one")], true))));
  await view.rerender(
    <RecordedGoalHistory
      goal={goal({ type: "consistency", target_sessions_per_week: 3 })}
      timezone="UTC"
      onOpenActivity={jest.fn()}
    />,
  );
  expect(screen.getByText(/Partial history/)).toBeTruthy();
  expect(screen.getByTestId("recorded-sessions-2026-03-02").props.accessibilityLabel).toContain(
    "Unavailable",
  );
  expect(screen.getByTestId("recorded-sessions-2026-03-09").props.accessibilityLabel).toContain(
    "≥ 1 session",
  );
  expect(fetchNextPage).not.toHaveBeenCalled();
});

it("distinguishes missing timezone, failed first page and failed next page with retry", async () => {
  queryMock.mockReturnValue(state(undefined, { isFetching: true }));
  const view = await renderNative(
    <RecordedGoalHistory goal={goal()} timezone={null} onOpenActivity={jest.fn()} />,
  );
  expect(screen.getByText("Recorded history needs your planning timezone.")).toBeTruthy();
  expect(queryMock.mock.calls[0]?.[1].enabled).toBe(false);
  queryMock.mockReturnValue(state(undefined, { isError: true }));
  await view.rerender(
    <RecordedGoalHistory goal={goal()} timezone="UTC" onOpenActivity={jest.fn()} />,
  );
  expect(screen.getByText("Recorded history could not be loaded.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Retry history"));
  expect(refetch).toHaveBeenCalledTimes(1);
  queryMock.mockReturnValue(
    state([page([activity("one")], true)], { isError: true, isFetchNextPageError: true }),
  );
  await view.rerender(
    <RecordedGoalHistory goal={goal()} timezone="UTC" onOpenActivity={jest.fn()} />,
  );
  expect(screen.getByText(/Partial history/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Retry history"));
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
});

it("selects a previous week's source activity independently of the current week", async () => {
  const previous = activity("previous");
  previous.time.startedAt = "2026-03-03T15:00:00Z";
  queryMock.mockReturnValue(state([page([previous, activity("current")])]));
  const open = jest.fn();
  await renderNative(
    <RecordedGoalHistory
      goal={goal({ type: "consistency", target_sessions_per_week: 2 })}
      timezone="America/Los_Angeles"
      onOpenActivity={open}
    />,
  );
  expect(screen.getByTestId("recorded-source-sessions-current")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("recorded-sessions-2026-03-02"));
  expect(screen.queryByTestId("recorded-source-sessions-current")).toBeNull();
  await fireEvent.press(screen.getByTestId("recorded-source-sessions-previous"));
  expect(open).toHaveBeenCalledWith("previous");
});
