import { fireEvent } from "@testing-library/react-native";
import { format } from "date-fns";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const captureProductAnalytics = jest.fn();
beforeEach(() => captureProductAnalytics.mockClear());

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Polyline: createHost("Polyline"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/lib/analytics/productAnalytics", () => ({
  useProductAnalytics: () => ({ capture: captureProductAnalytics }),
}));

const { PlanProgressInsight, formatGoalGap, formatGoalTimeLeft } = require("./PlanProgressInsight");

it("preserves local labels and UTC chart dates when planningTimezone is omitted", async () => {
  const instant = "2026-09-20T01:00:00Z";
  const point = {
    activityCategory: "bike",
    value: 240,
    metric: "power",
    unit: "watts",
    effectiveAt: instant,
    thresholdId: "default-zone",
    sourceActivities: [{ id: "default-source", name: "Evening ride", finishedAt: instant }],
  };
  const props = {
    deadlineDate: "2026-10-20",
    todayKey: "2026-09-20",
    progress: null,
    onOpenSourceActivity: jest.fn(),
    trend: {
      activityCategory: "bike",
      metric: "power",
      unit: "watts",
      current: point,
      points: [point],
    },
    window: { start: "2026-09-20", end: "2026-09-21" },
  };
  const view = await renderNative(<PlanProgressInsight {...props} />);
  // Run this suite with TZ=America/Los_Angeles to distinguish local Sep 19
  // labels from the UTC Sep 20 chart bucket.
  expect(screen.getByText(`240 W · ${format(new Date(instant), "MMM d, yyyy")}`)).toBeTruthy();
  expect(
    screen.getByText(`Source activity · ${format(new Date(instant), "MMM d, yyyy")}`),
  ).toBeTruthy();
  expect(screen.getByTestId("plan-progress-point-2026-09-20").props.accessibilityLabel).toContain(
    format(new Date(instant), "MMMM d, yyyy"),
  );
  await view.rerender(<PlanProgressInsight {...props} planningTimezone="Asia/Tokyo" />);
  expect(screen.getByText("240 W · Sep 20, 2026")).toBeTruthy();
  expect(screen.getByText("Source activity · Sep 20, 2026")).toBeTruthy();
  await view.rerender(<PlanProgressInsight {...props} planningTimezone="America/Los_Angeles" />);
  // Explicit planning dates also govern filtering; local Sep 19 is outside.
  expect(screen.queryByTestId("plan-progress-point-2026-09-20")).toBeNull();
});

it("shows evidence and source dates in the athlete planning timezone", async () => {
  const point = {
    activityCategory: "bike",
    value: 240,
    metric: "power",
    unit: "watts",
    effectiveAt: "2026-09-20T06:00:00Z",
    thresholdId: "zone-point",
    sourceActivities: [
      { id: "zone-source", name: "Evening ride", finishedAt: "2026-09-20T05:00:00Z" },
    ],
  };
  await renderNative(
    <PlanProgressInsight
      planningTimezone="America/Los_Angeles"
      deadlineDate="2026-10-20"
      todayKey="2026-09-19"
      progress={null}
      onOpenSourceActivity={jest.fn()}
      trend={{
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        current: point,
        points: [point],
      }}
      window={{ start: "2026-09-01", end: "2026-11-01" }}
    />,
  );
  expect(screen.getByText("Sep 19")).toBeTruthy();
  expect(screen.getByText("240 W · Sep 19, 2026")).toBeTruthy();
  expect(screen.getByText("Source activity · Sep 19, 2026")).toBeTruthy();
  expect(screen.getByTestId("plan-progress-point-2026-09-20").props.accessibilityLabel).toContain(
    "September 19, 2026",
  );
  expect(screen.queryByText(/Lines stop at measurement/)).toBeNull();
});

it("draws connected comparable evidence, target, markers, and source evidence", async () => {
  const onOpenSourceActivity = jest.fn();
  const points = [
    {
      activityCategory: "bike",
      confidence: 0.72,
      effectiveAt: "2026-02-01T12:00:00.000Z",
      metric: "power",
      method: "bike_power_30m",
      sourceActivities: [
        { finishedAt: "2026-01-31T12:00:00.000Z", id: "activity-1", name: "Threshold ride" },
      ],
      thresholdId: "threshold-1",
      unit: "watts",
      value: 220,
    },
    {
      activityCategory: "bike",
      confidence: 0.84,
      effectiveAt: "2026-04-10T12:00:00.000Z",
      metric: "power",
      method: "bike_power_30m",
      sourceActivities: [
        { finishedAt: "2026-04-09T12:00:00.000Z", id: "activity-2", name: "Spring test" },
      ],
      thresholdId: "threshold-2",
      unit: "watts",
      value: 240,
    },
  ];
  await renderNative(
    <PlanProgressInsight
      showGoalSummary
      deadlineDate="2026-11-15"
      onOpenSourceActivity={onOpenSourceActivity}
      progress={
        {
          status: "on_track",
          deadlineAt: "2026-11-15T00:00:00Z",
          current: { value: 240 },
          metrics: { remainingGap: 10 },
          target: { activityCategory: "bike", targetValue: 250, unit: "watts" },
        } as never
      }
      todayKey="2026-04-15"
      trend={{
        activityCategory: "bike",
        change: 20,
        changePercent: 9,
        current: points[1],
        metric: "power",
        points,
        unit: "watts",
      }}
      window={{ end: "2026-04-15", start: "2026-01-15" }}
    />,
  );

  expect(screen.getByTestId("plan-progress-connected-line")).toBeTruthy();
  expect(screen.getByTestId("plan-progress-goal-line")).toBeTruthy();
  expect(screen.getByTestId("plan-progress-chart-today-marker")).toBeTruthy();
  expect(screen.getByText("Power (W)")).toBeTruthy();
  expect(screen.getByText("bike power 30m · 84% confidence")).toBeTruthy();
  expect(screen.getByTestId("plan-progress-deadline-summary")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-progress-source-activity-2"));
  expect(onOpenSourceActivity).toHaveBeenCalledWith("activity-2");
  expect(screen.getByText("240 W")).toBeTruthy();
  expect(screen.getByText("250 W")).toBeTruthy();
  expect(screen.getByText("10 W")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-progress-point-2026-02-01"));
  await fireEvent.press(screen.getByTestId("plan-progress-source-activity-1"));
  expect(onOpenSourceActivity).toHaveBeenLastCalledWith("activity-1");
});

it("keeps the chart summary separate from focusable evidence and exposes an in-range deadline", async () => {
  const points = [
    {
      activityCategory: "bike" as const,
      effectiveAt: "2026-04-10T12:00:00.000Z",
      metric: "power",
      thresholdId: "threshold-1",
      unit: "watts",
      value: 240,
    },
    {
      activityCategory: "bike" as const,
      effectiveAt: "2026-04-14T12:00:00.000Z",
      metric: "power",
      thresholdId: "threshold-2",
      unit: "watts",
      value: 245,
    },
  ];
  await renderNative(
    <PlanProgressInsight
      deadlineDate="2026-04-15"
      onOpenSourceActivity={jest.fn()}
      progress={
        {
          status: "achieved",
          target: { achievementValue: 245, activityCategory: "bike", targetValue: 250 },
        } as never
      }
      todayKey="2026-04-15"
      trend={{
        activityCategory: "bike",
        change: 5,
        changePercent: 2,
        current: points[1],
        metric: "power",
        points,
        unit: "watts",
      }}
      window={{ end: "2026-04-15", start: "2026-04-01" }}
    />,
  );

  expect(
    screen.getByTestId("plan-progress-chart-accessibility-summary").props.accessibilityLabel,
  ).toContain("Goal deadline Apr 15, 2026 is in this evidence range");
  expect(screen.getByTestId("plan-progress-point-2026-04-10").props.accessibilityRole).toBe(
    "button",
  );
  expect(screen.getByTestId("plan-progress-achievement-line")).toBeTruthy();
  expect(screen.getByText("┊ Goal deadline Apr 15, 2026")).toBeTruthy();
  expect(screen.getByText(/Confidence unknown/)).toBeTruthy();
  expect(screen.queryByText(/0% confidence/)).toBeNull();
});

it("shows the goal's current, target, remaining gap and deadline without inventing missing metrics", async () => {
  await renderNative(
    <PlanProgressInsight
      showGoalSummary
      deadlineDate="2026-06-01"
      onOpenSourceActivity={jest.fn()}
      progress={
        {
          status: "insufficient",
          current: null,
          deadlineAt: "2026-06-01T00:00:00Z",
          target: {
            activityCategory: "bike",
            targetValue: 250,
            achievementValue: 250,
            unit: "watts",
          },
          metrics: { remainingGap: null },
        } as never
      }
      todayKey="2026-04-15"
      trend={null}
      window={{ start: "2026-02-01", end: "2026-08-01" }}
    />,
  );
  expect(screen.getByText("250 W")).toBeTruthy();
  expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  expect(screen.getByText("47 days left")).toBeTruthy();
  expect(screen.queryByText("0 W")).toBeNull();
});

it.each([
  {
    category: "run",
    current: 4,
    target: 5,
    achievement: 4.5,
    currentLabel: "4:10 /km",
    targetLabel: "3:20 /km",
    gap: "28 s/km",
  },
  {
    category: "swim",
    current: 1,
    target: 1.25,
    achievement: 1.2,
    currentLabel: "1:40 /100m",
    targetLabel: "1:20 /100m",
    gap: "17 s/100m",
  },
])("shows $category pace with a gap to achievement in pace units", async ({
  category,
  current,
  target,
  achievement,
  currentLabel,
  targetLabel,
  gap,
}) => {
  const progress = {
    status: "on_track",
    deadlineAt: "2026-06-02T06:59:59Z",
    current: { value: current },
    metrics: { remainingGap: achievement - current },
    target: {
      activityCategory: category,
      targetValue: target,
      achievementValue: achievement,
      unit: "meters_per_second",
    },
  };
  await renderNative(
    <PlanProgressInsight
      showGoalSummary
      deadlineDate="2026-06-01"
      onOpenSourceActivity={jest.fn()}
      progress={progress}
      todayKey="2026-06-01"
      trend={null}
      window={{ start: "2026-02-01", end: "2026-08-01" }}
    />,
  );
  expect(screen.getByText(currentLabel)).toBeTruthy();
  expect(screen.getByText(targetLabel)).toBeTruthy();
  expect(screen.getByText(gap)).toBeTruthy();
  expect(screen.getByText("Pace gap to achievement")).toBeTruthy();
  expect(screen.getByText("Due today")).toBeTruthy();
  expect(formatGoalGap({ ...progress, metrics: { remainingGap: 0 } })).toBe(
    category === "run" ? "0 s/km" : "0 s/100m",
  );
  expect(formatGoalGap({ ...progress, metrics: { remainingGap: null } })).toBe("Unavailable");
});

it.each([
  ["2026-03-09", "2026-03-08", "1 day left"],
  ["2026-03-08", "2026-03-08", "Due today"],
  ["2026-03-07", "2026-03-09", "2 days overdue"],
  [null, "2026-03-09", "Unavailable"],
])("formats date-only time left %s from %s", (deadline, today, expected) => {
  expect(formatGoalTimeLeft(deadline, today)).toBe(expected);
});

it.each([
  "policyVersion",
  "method",
])("keeps measurements selectable without connecting a %s change", async (field) => {
  const points = [1, 2, 3].map((day) => ({
    activityCategory: "bike",
    metric: "power",
    unit: "watts",
    value: 240 + day,
    effectiveAt: `2026-04-0${day}T12:00:00Z`,
    thresholdId: `threshold-${day}`,
    method: "bike_power_30m",
    policyVersion: "v1",
    ...(day >= 2 ? { [field]: "v2" } : {}),
  }));
  await renderNative(
    <PlanProgressInsight
      showGoalSummary
      deadlineDate="2026-06-01"
      onOpenSourceActivity={jest.fn()}
      progress={{
        status: "insufficient",
        assessedAt: "2026-04-02T13:00:00Z",
        deadlineAt: "2026-06-01T00:00:00Z",
        current: null,
        metrics: { remainingGap: null },
        target: {
          activityCategory: "bike",
          unit: "watts",
          targetValue: 250,
          achievementValue: 250,
        },
      }}
      todayKey="2026-04-02"
      trend={{
        activityCategory: "bike",
        current: points[1],
        metric: "power",
        unit: "watts",
        points,
      }}
      window={{ start: "2026-04-01", end: "2026-08-01" }}
    />,
  );
  expect(screen.queryByTestId("plan-progress-connected-line")).toBeNull();
  expect(screen.getByTestId("plan-progress-point-2026-04-01")).toBeTruthy();
  expect(screen.getByTestId("plan-progress-point-2026-04-02")).toBeTruthy();
  expect(screen.queryByTestId("plan-progress-point-2026-04-03")).toBeNull();
  expect(screen.getByTestId("plan-progress-evidence-selectors").props.horizontal).toBe(true);
  await fireEvent.press(screen.getByTestId("plan-progress-point-2026-04-01"));
  expect(
    screen.getByTestId("plan-progress-point-2026-04-01").props.accessibilityState.selected,
  ).toBe(true);
});

it("captures one bounded chart engagement when evidence is selected", async () => {
  await renderNative(
    <PlanProgressInsight
      deadlineDate={null}
      onOpenSourceActivity={jest.fn()}
      progress={null}
      todayKey="2026-04-15"
      trend={
        {
          activityCategory: "bike",
          current: null,
          metric: "power",
          points: [
            {
              activityCategory: "bike",
              effectiveAt: "2026-04-10T12:00:00.000Z",
              metric: "power",
              thresholdId: "threshold-1",
              unit: "watts",
              value: 240,
            },
          ],
          unit: "watts",
        } as never
      }
      window={{ end: "2026-04-15", start: "2026-04-01" }}
    />,
  );
  await fireEvent.press(screen.getByTestId("plan-progress-point-2026-04-10"));
  expect(captureProductAnalytics).toHaveBeenCalledTimes(1);
  expect(captureProductAnalytics).toHaveBeenCalledWith("plan.chart_engaged", { chart: "progress" });
});
