// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GoalProgressChart } from "./goal-progress-chart";
import {
  buildGoalProgressPlot,
  formatGoalGap,
  formatGoalTimeLeft,
  formatThreshold,
  type GoalProgress,
  goalPlanningDate,
  nearestGoalChartPoint,
  type ThresholdHistory,
} from "./goal-progress-presentation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, children }: { params: { activityId: string }; children: ReactNode }) => (
    <a href={`/activities/${params.activityId}`}>{children}</a>
  ),
}));
afterEach(cleanup);

const history: ThresholdHistory = [220, 240].map((value, index) => ({
  activityCategory: "bike",
  metric: "power",
  unit: "watts",
  method: "bike_power_30m",
  thresholdId: `threshold-${index}`,
  value,
  confidence: 0.8,
  policyVersion: "v1",
  effectiveAt: `2026-0${index + 3}-01T00:00:00Z`,
  sourceActivities: [
    {
      id: `activity-${index}`,
      name: `Test ride ${index}`,
      finishedAt: `2026-0${index + 3}-01T00:00:00Z`,
    },
  ],
}));
const firstMeasurement = history[0];
const latestMeasurement = history[1];
if (!firstMeasurement || !latestMeasurement) throw new Error("Missing threshold fixtures");
const data: GoalProgress = {
  result: {
    status: "on_track",
    reason: "observed_rate_meets_required_rate",
    goalId: "goal-1",
    assessedAt: "2026-04-02T00:00:00Z",
    deadlineAt: "2026-06-01T00:00:00Z",
    target: {
      activityCategory: "bike",
      metric: "power",
      unit: "watts",
      targetValue: 250,
      achievementValue: 250,
    },
    baseline: null,
    current: {
      thresholdId: "threshold-1",
      activityCategory: "bike",
      metric: "power",
      unit: "watts",
      value: 240,
      confidence: 0.8,
      effectiveAt: "2026-04-01T00:00:00Z",
      sourceActivityIds: ["activity-1"],
      freshness: "fresh",
    },
    metrics: {
      targetGap: 10,
      remainingGap: 10,
      changeFromBaseline: 20,
      progressRatio: 0.67,
      progressPercent: 67,
      observedRatePerDay: 0.6,
      requiredRatePerDay: 0.2,
    },
    evidence: { observationCount: 2, observedSpanDays: 31 },
  },
  provenance: { baseline: firstMeasurement, current: latestMeasurement },
  publication: { computedAt: "2026-04-02T00:00:00Z", status: "available", publishedRevision: 1 },
};

it("shows numeric progress, target/deadline markers and selectable source links", () => {
  render(
    <GoalProgressChart
      data={data}
      history={history}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "Current: 240 W. Target: 250 W. Remaining gap: 10 W",
  );
  expect(screen.getByTestId("goal-target-line")).toBeTruthy();
  expect(screen.getByTestId("goal-deadline-line")).toBeTruthy();
  expect(screen.getByTestId("goal-assessed-line")).toBeTruthy();
  expect(screen.getByText("Target 250 W")).toBeTruthy();
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "Assessed Thursday, April 2, 2026 UTC",
  );
  expect(
    screen.getByRole("link", { name: "Source activity: Test ride 1" }).getAttribute("href"),
  ).toBe("/activities/activity-1");
  const hitSurface = screen.getByTestId("goal-chart-hit-surface");
  vi.spyOn(hitSurface, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 256));
  const firstPoint = buildGoalProgressPlot(data, history)?.segments.flat()[0];
  if (!firstPoint) throw new Error("Missing plot point");
  fireEvent.click(hitSurface, {
    clientX: 10 + firstPoint.plotX * 3,
    clientY: 20 + firstPoint.plotY * 2.56,
  });
  const measurements = screen.getByRole("group", { name: "Threshold measurements" });
  expect(measurements.className).toContain("overflow-x-auto");
  const firstChip = within(measurements).getByRole("button", { name: /220 W/ });
  firstChip.focus();
  expect(document.activeElement).toBe(firstChip);
  expect(firstChip.textContent).toBe("Mar 1 · 220 W");
  expect(
    within(measurements).getByRole("button", { name: /220 W/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByRole("link", { name: "Source activity: Test ride 0" }).getAttribute("href"),
  ).toBe("/activities/activity-0");
  expect(
    screen.queryByText(
      /What influences your assessment|Your approach|Next step|Evidence and assumptions/,
    ),
  ).toBeNull();
});

it("keeps unrelated activity categories out of the goal chart and includes the deadline in its domain", () => {
  const plot = buildGoalProgressPlot(data, [
    ...history,
    {
      ...firstMeasurement,
      activityCategory: "run",
      metric: "speed",
      unit: "meters_per_second",
      method: "run_speed_30m",
      thresholdId: "run",
      value: 4,
    },
  ]);
  expect(plot?.points).toHaveLength(2);
  expect(plot?.deadlineX).toBe(92);
  expect(formatThreshold(4, "run")).toBe("4:10 /km");
  expect(formatThreshold(1, "swim")).toBe("1:40 /100m");
});

it("shows honest unsupported and empty states", () => {
  const { rerender } = render(
    <GoalProgressChart
      data={{
        result: { status: "unsupported", reason: "non_threshold_goal", goalId: "goal" },
        provenance: null,
        publication: null,
      }}
      history={history}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText("Progress charts are not available for this goal type.")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByText("240 W")).toBeNull();
  if (data.result.status === "unsupported") throw new Error("Invalid fixture");
  rerender(
    <GoalProgressChart
      data={{
        ...data,
        provenance: { baseline: null, current: null },
        result: {
          ...data.result,
          current: null,
          metrics: { ...data.result.metrics, remainingGap: null },
        },
      }}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText("No comparable threshold measurements yet.")).toBeTruthy();
  expect(screen.getByText("250 W")).toBeTruthy();
  expect(screen.getAllByText("Unavailable")).toHaveLength(3);
});

it("retains canonical evidence but stops connections at policy changes and excludes future evidence", () => {
  const changed = { ...latestMeasurement, policyVersion: "v2" };
  const future = {
    ...latestMeasurement,
    thresholdId: "future",
    effectiveAt: "2026-04-03T00:00:00Z",
  };
  const plot = buildGoalProgressPlot({ ...data, provenance: null }, [
    firstMeasurement,
    changed,
    future,
  ]);
  expect(plot?.points.map((point) => point.thresholdId)).toEqual(["threshold-0", "threshold-1"]);
  expect(plot?.segments.map((segment) => segment.length)).toEqual([1, 1]);
  render(
    <GoalProgressChart
      data={{ ...data, provenance: null }}
      history={[firstMeasurement, changed]}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.queryByText("Lines stop at measurement method or policy changes.")).toBeNull();
  expect(screen.getByRole("img").querySelector("polyline")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /240 W/ }));
  expect(screen.getByRole("link", { name: /Test ride 1/ })).toBeTruthy();
});

it.each([
  2, 12, 100,
])("selects every point in a %i-point plot without overlapping hitboxes", (count) => {
  const points = Array.from({ length: count }, (_, index) => ({
    label: `point-${index}`,
    plotX: 8 + index * 0.5,
    plotY: 85 - index * 0.05,
  }));
  for (const point of points) {
    expect(
      nearestGoalChartPoint(points, {
        x: point.plotX * 3,
        y: point.plotY * 2.56,
        width: 300,
        height: 256,
      }),
    ).toBe(point.label);
  }
  expect(nearestGoalChartPoint(points, { x: 0, y: 0, width: 0, height: 0 })).toBeNull();
});

it("uses the planning timezone for measurement, assessed and deadline labels with concise chips", () => {
  if (data.result.status === "unsupported") throw new Error("Invalid fixture");
  const point = { ...firstMeasurement, effectiveAt: "2026-09-20T06:00:00Z" };
  const result = {
    ...data.result,
    assessedAt: "2026-09-20T06:30:00Z",
    deadlineAt: "2026-10-21T06:59:59Z",
  };
  render(
    <GoalProgressChart
      data={{ ...data, result, provenance: null }}
      history={[point]}
      planningTimezone="America/Los_Angeles"
      targetDate="2026-10-20"
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
    "Assessed Saturday, September 19, 2026",
  );
  const chip = screen.getByRole("button", { name: "Saturday, September 19, 2026 · 220 W" });
  expect(chip.textContent).toBe("Sep 19 · 220 W");
  expect(screen.getByText("220 W · Saturday, September 19, 2026")).toBeTruthy();
  expect(screen.getByText("Oct 20")).toBeTruthy();
  expect(screen.queryByText("Oct 21")).toBeNull();
  expect(screen.getAllByTestId("goal-chart-hit-surface")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Select chart point/ })).toBeNull();
});

it.each([
  {
    category: "run" as const,
    current: 4,
    target: 5,
    achievement: 4.5,
    currentLabel: "4:10 /km",
    targetLabel: "3:20 /km",
    gap: "28 s/km",
  },
  {
    category: "swim" as const,
    current: 1,
    target: 1.25,
    achievement: 1.2,
    currentLabel: "1:40 /100m",
    targetLabel: "1:20 /100m",
    gap: "17 s/100m",
  },
])("shows $category pace and a tolerance-aware pace gap", ({
  category,
  current,
  target,
  achievement,
  currentLabel,
  targetLabel,
  gap,
}) => {
  if (data.result.status === "unsupported" || !data.result.current)
    throw new Error("Invalid fixture");
  const result = {
    ...data.result,
    current: {
      ...data.result.current,
      value: current,
      activityCategory: category,
      metric: "speed" as const,
      unit: "meters_per_second" as const,
    },
    target: {
      activityCategory: category,
      metric: "speed" as const,
      unit: "meters_per_second" as const,
      targetValue: target,
      achievementValue: achievement,
    },
    metrics: { ...data.result.metrics, remainingGap: achievement - current },
  };
  render(
    <GoalProgressChart
      data={{ ...data, result, provenance: null }}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText(currentLabel)).toBeTruthy();
  expect(screen.getByText(targetLabel)).toBeTruthy();
  expect(screen.getByText("Pace gap to achievement")).toBeTruthy();
  expect(screen.getByText(gap)).toBeTruthy();
  expect(screen.queryByText(/m\/s/)).toBeNull();
  expect(formatGoalGap({ ...result, metrics: { ...result.metrics, remainingGap: 0 } })).toBe(
    category === "run" ? "0 s/km" : "0 s/100m",
  );
  expect(formatGoalGap({ ...result, metrics: { ...result.metrics, remainingGap: null } })).toBe(
    "Unavailable",
  );
});

it.each([
  ["2026-03-09", "2026-03-08", "1 day left"],
  ["2026-03-08", "2026-03-08", "Due today"],
  ["2026-03-07", "2026-03-09", "2 days overdue"],
  [null, "2026-03-09", "Unavailable"],
])("formats date-only time left %s from %s", (deadline, today, expected) => {
  expect(formatGoalTimeLeft(deadline, today)).toBe(expected);
});

it("uses the athlete date across DST and never slices the UTC end-of-day deadline for time left", () => {
  const athleteDate = goalPlanningDate(new Date("2026-03-09T06:30:00Z"), "America/Los_Angeles");
  expect(athleteDate).toBe("2026-03-08");
  expect(formatGoalTimeLeft("2026-03-08", athleteDate)).toBe("Due today");
  expect(goalPlanningDate(new Date(), "invalid-zone")).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-09T06:30:00Z"));
  try {
    render(
      <GoalProgressChart
        data={data}
        targetDate="2026-03-08"
        planningTimezone="America/Los_Angeles"
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Due today")).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

it("distinguishes loading, failed progress and partial history with retry", () => {
  const retry = vi.fn();
  const { rerender } = render(
    <GoalProgressChart data={undefined} isLoading isError={false} onRetry={retry} />,
  );
  expect(screen.getByText("Loading goal progress…")).toBeTruthy();
  rerender(<GoalProgressChart data={undefined} isLoading={false} isError onRetry={retry} />);
  expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Retry progress" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(
    <GoalProgressChart
      data={data}
      isLoading={false}
      isError={false}
      historyError
      onRetry={retry}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("Showing available goal evidence");
  expect(screen.getByRole("img")).toBeTruthy();
});
