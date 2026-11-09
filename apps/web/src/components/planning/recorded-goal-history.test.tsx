// @vitest-environment jsdom
import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { type CanonicalGoalObjective, parseProfileGoalRecord } from "@repo/core";
import { activityDisplayModelSchema } from "@repo/core/contracts/read-projections";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordedGoalHistory } from "./recorded-goal-history";

const mocks = vi.hoisted(() => ({ query: vi.fn(), next: vi.fn(), retry: vi.fn() }));
vi.mock("../../lib/api/client", () => ({
  api: { activities: { listPaginated: { useInfiniteQuery: mocks.query } } },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
    className,
  }: {
    params: { activityId: string };
    children: ReactNode;
    className: string;
  }) => (
    <a className={className} href={`/activities/${params.activityId}`}>
      {children}
    </a>
  ),
}));
type Page = inferRouterOutputs<AppRouter>["activities"]["listPaginated"];
function activity(id: string, distance = 5000, elapsed = 1600, date = "2026-03-09T15:00:00Z") {
  return activityDisplayModelSchema.parse({
    contractVersion: "activity-display-v1",
    id,
    href: `/activities/${id}`,
    title: `Run ${id}`,
    owner: { id: "owner", username: null, avatarUrl: null },
    time: { startedAt: date, finishedAt: date },
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
    fetchNextPage: mocks.next,
    refetch: mocks.retry,
    ...overrides,
  };
}
function page(items = [activity("one")], hasMore = false): Page {
  return { items, total: items.length, hasMore, ...(hasMore ? { nextCursor: "50" } : {}) };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
  mocks.query.mockReset();
  mocks.next.mockReset();
  mocks.retry.mockReset();
  mocks.query.mockReturnValue(state([page()]));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("plots raw near-distance elapsed history and selects the source with its actual distance", () => {
  mocks.query.mockReturnValue(
    state([page([activity("one", 4950, 1600), activity("two", 5050, 1550)])]),
  );
  render(<RecordedGoalHistory goal={goal()} timezone="America/Los_Angeles" />);
  expect(screen.getByText("Within 1% of 5 km")).toBeTruthy();
  expect(screen.getByText("25 min 50 sec")).toBeTruthy();
  expect(screen.getByText("50 sec")).toBeTruthy();
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Lower time is faster");
  fireEvent.click(screen.getByRole("button", { name: /26 min 40 sec/ }));
  expect(screen.getByRole("link", { name: "Source activity: Run one" }).getAttribute("href")).toBe(
    "/activities/one",
  );
  expect(screen.getByText("Distance: 4.95 km · Elapsed: 26 min 40 sec")).toBeTruthy();
  expect(
    screen.queryByText(
      /What influences your assessment|Your approach|Next step|Evidence and assumptions/,
    ),
  ).toBeNull();
  expect(mocks.query.mock.calls[0]?.[0]).toMatchObject({
    limit: 50,
    composition_mode: "single_only",
    activity_category: "run",
    sort_order: "asc",
    date_from: "2025-12-22T08:00:00.000Z",
    date_to: "2026-03-10T12:00:00.000Z",
  });
});

it("loads subsequent pages, deduplicates activity IDs and stops at completion", () => {
  const first = page([activity("one")], true);
  const second = page([activity("one"), activity("two")]);
  mocks.query.mockReturnValue(state([first]));
  const view = render(<RecordedGoalHistory goal={goal()} timezone="UTC" />);
  expect(mocks.next).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Loading recorded history…")).toBeTruthy();
  expect(screen.getByText("Best loaded")).toBeTruthy();
  mocks.query.mockReturnValue(state([first, second]));
  view.rerender(<RecordedGoalHistory goal={goal()} timezone="UTC" />);
  expect(mocks.next).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Loading recorded history…")).toBeNull();
  expect(within(screen.getByRole("group")).getAllByRole("button")).toHaveLength(2);
});

it("retains partial counts on a failed page, retries, and shows capped pagination as partial", () => {
  const consistency = goal({ type: "consistency", target_sessions_per_week: 3 });
  mocks.query.mockReturnValue(
    state([page([activity("one")], true)], { isError: true, isFetchNextPageError: true }),
  );
  const view = render(<RecordedGoalHistory goal={consistency} timezone="UTC" />);
  expect(screen.getByRole("alert").textContent).toContain("Partial history");
  expect(screen.getByRole("button", { name: /≥ 1 session.*In progress/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /0 sessions/ })).toBeNull();
  expect(mocks.next).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
  expect(mocks.next).toHaveBeenCalledTimes(1);
  mocks.next.mockClear();
  const capped = Array.from({ length: 20 }, () => page([activity("one")], true));
  mocks.query.mockReturnValue(state(capped));
  view.rerender(<RecordedGoalHistory goal={consistency} timezone="UTC" />);
  expect(mocks.next).not.toHaveBeenCalled();
  const options = mocks.query.mock.calls.at(-1)?.[1];
  expect(options.getNextPageParam(capped[19], capped)).toBeUndefined();
  expect(screen.getByRole("alert").textContent).toContain("maximum 1,000 records");
});

it("renders separate completion targets and weeks-only session bars without an invented target", () => {
  const view = render(
    <RecordedGoalHistory
      goal={goal({ type: "completion", distance_m: 10000, duration_s: 3600 })}
      timezone="UTC"
    />,
  );
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByTestId("recorded-target-distance")).toBeTruthy();
  expect(screen.getByTestId("recorded-target-elapsed")).toBeTruthy();
  view.rerender(
    <RecordedGoalHistory goal={goal({ type: "consistency", target_weeks: 8 })} timezone="UTC" />,
  );
  expect(screen.getByText("Target duration: 8 weeks")).toBeTruthy();
  expect(screen.queryByTestId("recorded-target-sessions")).toBeNull();
  expect(screen.getByText("Not specified")).toBeTruthy();
  expect(screen.getByRole("button", { name: /1 session.*In progress/ })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /0 sessions/ })).toHaveLength(11);
});

it("distinguishes missing timezone, initial loading, failure and complete empty history", () => {
  mocks.query.mockReturnValue(state(undefined, { isFetching: true }));
  const view = render(<RecordedGoalHistory goal={goal()} timezone={null} />);
  expect(screen.getByText("Recorded history needs your planning timezone.")).toBeTruthy();
  expect(mocks.query.mock.calls[0]?.[1].enabled).toBe(false);
  view.rerender(<RecordedGoalHistory goal={goal()} timezone="UTC" />);
  expect(screen.getByText("Loading recorded history…")).toBeTruthy();
  mocks.query.mockReturnValue(state(undefined, { isError: true }));
  view.rerender(<RecordedGoalHistory goal={goal()} timezone="UTC" />);
  expect(screen.getByText("Recorded history could not be loaded.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
  expect(mocks.retry).toHaveBeenCalledTimes(1);
  mocks.query.mockReturnValue(state([page([])]));
  view.rerender(<RecordedGoalHistory goal={goal()} timezone="UTC" />);
  expect(screen.getByText("No matching recorded measurements in this window.")).toBeTruthy();
});

it("selects a historical week and exposes only that week's source activities", () => {
  mocks.query.mockReturnValue(
    state([page([activity("previous", 5000, 1600, "2026-03-03T15:00:00Z"), activity("current")])]),
  );
  render(
    <RecordedGoalHistory
      goal={goal({ type: "consistency", target_sessions_per_week: 2 })}
      timezone="America/Los_Angeles"
    />,
  );
  expect(screen.getByRole("link", { name: "Source activity: Run current" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Monday, March 2, 2026 · 1 session" }));
  expect(
    screen.getByRole("link", { name: "Source activity: Run previous" }).getAttribute("href"),
  ).toBe("/activities/previous");
  expect(screen.queryByRole("link", { name: "Source activity: Run current" })).toBeNull();
});
