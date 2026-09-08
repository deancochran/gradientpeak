import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const captureProductAnalytics = jest.fn();

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
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

const { PlanProgressInsight } = require("./PlanProgressInsight");

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
      deadlineDate="2026-11-15"
      onOpenSourceActivity={onOpenSourceActivity}
      progress={
        { status: "on_track", target: { activityCategory: "bike", targetValue: 250 } } as never
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
