import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const chartProps = jest.fn();
const periodReviewProps = jest.fn();
const periodReviewUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: undefined,
  isFetching: false,
  isLoading: false,
  refetch: jest.fn(),
}));
const selectedDayProps = jest.fn();
const calendarDayUseQuery = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { projection: { items: [{ activity: { id: "activity-1" } }] } },
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: jest.fn(),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@/lib/api", () => ({
  api: {
    calendar: {
      day: {
        useQuery: (input: unknown, options: unknown) => calendarDayUseQuery(input, options),
      },
    },
    trainingPlans: {
      getPlanPeriodReview: {
        useQuery: (input: unknown, options: unknown) => periodReviewUseQuery(input, options),
      },
    },
  },
}));
jest.mock("@/components/charts/ChartRangeModal", () => ({
  ChartRangeModal: ({ children, visible, ...props }: Record<string, unknown>) =>
    visible
      ? React.createElement("View", props, (children as (range: string) => React.ReactNode)("6m"))
      : null,
}));
jest.mock("./DailyTrainingAdjustmentChart", () => ({
  DailyTrainingAdjustmentChart: (props: Record<string, unknown>) => {
    chartProps(props);
    return React.createElement("View", { testID: "mock-load-chart" });
  },
}));
jest.mock("./PlanSelectedDay", () => ({
  PlanSelectedDay: (props: Record<string, unknown>) => {
    selectedDayProps(props);
    return React.createElement("View", { testID: "mock-selected-day" });
  },
}));
jest.mock("./PlanSelectedPeriodReview", () => ({
  PlanSelectedPeriodReview: (props: Record<string, unknown>) => {
    periodReviewProps(props);
    return React.createElement("View", { testID: "mock-period-review" });
  },
}));

const { PlanUnifiedTrendDashboard } = require("./PlanUnifiedTrendDashboard");

const onRangeChange = jest.fn();
const goalMarkers = [
  { id: "goal-2", label: "Spring 5K", priority: 3, targetDate: "2026-04-15" },
  { id: "goal-1", label: "Autumn marathon", priority: 9, targetDate: "2026-11-15" },
];
const commonProps = {
  analysisAnchor: "2026-04-15",
  analysisPeriod: "6m",
  analysisWindowLoading: false,
  dailyPoints: [
    { date: "2026-04-14", effectiveCompletedLoad: 20, plannedLoad: 30 },
    { date: "2026-04-15", effectiveCompletedLoad: 40, plannedLoad: 50 },
    { date: "2026-04-16", plannedLoad: 45 },
  ],
  goalMarkers,
  model: {
    domains: { fitness: [0, 100], load: [0, 100] },
    emptyState: null,
    goalMarkers: [],
    selectedWeekSummary: null,
    todayKey: "2026-04-15",
    weeks: [],
  },
  onGoalPress: jest.fn(),
  onOpenCompletedActivity: jest.fn(),
  onPeriodShift: jest.fn(),
  onRangeChange,
  onRangeToday: jest.fn(),
  onSelectedDateChange: jest.fn(),
  onViewDetails: jest.fn(),
  primaryGoalId: "goal-1",
  selectedDate: "2026-04-15",
  timelineDaysByDate: {
    "2026-04-15": { completedItems: [], date: "2026-04-15", scheduledItems: [] },
  },
};

beforeEach(() => jest.clearAllMocks());

it("keeps every point daily while fitting the selected range and rendering every goal marker", async () => {
  await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  expect(screen.getByTestId("mock-load-chart")).toBeTruthy();
  expect(periodReviewUseQuery).toHaveBeenLastCalledWith(
    { anchorDate: "2026-04-15", period: "day" },
    expect.objectContaining({ retry: false }),
  );
  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      goalMarkers,
      fitRange: true,
      height: 250,
      loadOnly: true,
      primaryGoalId: "goal-1",
      points: commonProps.dailyPoints,
      range: "daily",
      showSelectedTray: false,
    }),
  );
  expect(selectedDayProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      completedActivities: [{ id: "activity-1" }],
      goals: [goalMarkers[0]],
      selectedDate: "2026-04-15",
    }),
  );
  const props = chartProps.mock.calls.at(-1)?.[0] as {
    onSelectedDateChange: (date: string) => void;
  };
  props.onSelectedDateChange("2026-04-14");
  expect(commonProps.onSelectedDateChange).toHaveBeenCalledWith("2026-04-14");
});

it("keeps display options behind one compact control without changing the selected day", async () => {
  await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  expect(screen.queryByTestId("plan-load-display-sheet")).toBeNull();
  expect(screen.queryByTestId("plan-load-legend")).toBeNull();
  expect(screen.queryByTestId("plan-load-controls-today")).toBeNull();
  expect(screen.getByLabelText("Legend and filters: 6M, grouped by Day, 3 trends")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  expect(screen.getByTestId("plan-load-display-sheet")).toBeTruthy();
  expect(screen.getByTestId("plan-load-legend")).toBeTruthy();
  expect(screen.getAllByText("Fitness").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Fatigue").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Form").length).toBeGreaterThan(0);
  expect(screen.queryByText(/Actual fitness|Planned fitness projection/)).toBeNull();
  expect(screen.queryByTestId("plan-load-bin-monthly")).toBeNull();
  await fireEvent.press(screen.getByTestId("plan-load-controls-range-1y"));
  expect(onRangeChange).toHaveBeenCalledWith("1y");
  expect(screen.queryByTestId("plan-load-display-sheet")).toBeNull();
  expect(selectedDayProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedDate: "2026-04-15" }),
  );
});

it("replaces stale window data with an updating state before rendering the returned range", async () => {
  const { rerender } = await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-controls-range-1y"));
  await rerender(
    <PlanUnifiedTrendDashboard {...commonProps} analysisPeriod="1y" analysisWindowLoading />,
  );

  expect(screen.getByTestId("plan-training-chart-loading")).toBeTruthy();
  expect(screen.queryByTestId("mock-load-chart")).toBeNull();

  const nextPoints = [
    { date: "2025-10-15", effectiveCompletedLoad: 12, plannedLoad: 18 },
    { date: "2026-04-15", effectiveCompletedLoad: 40, plannedLoad: 50 },
  ];
  await rerender(
    <PlanUnifiedTrendDashboard {...commonProps} analysisPeriod="1y" dailyPoints={nextPoints} />,
  );

  expect(screen.queryByTestId("plan-training-chart-loading")).toBeNull();
  expect(screen.getByTestId("mock-load-chart")).toBeTruthy();
  expect(chartProps).toHaveBeenLastCalledWith(expect.objectContaining({ points: nextPoints }));
});

it("opens the canonical day training breakdown for the selected date", async () => {
  await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  const props = selectedDayProps.mock.calls.at(-1)?.[0] as {
    onOpenDayDetails: (date: string) => void;
  };
  await React.act(async () => props.onOpenDayDetails("2026-04-15"));

  expect(commonProps.onViewDetails).toHaveBeenCalledWith("2026-04-15", "day");
});

it("changes binning explicitly without changing the selected date window", async () => {
  await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  expect(screen.queryByTestId("plan-load-bin-yearly")).toBeNull();
  await fireEvent.press(screen.getByTestId("plan-load-bin-weekly"));
  expect(screen.queryByTestId("plan-load-display-sheet")).toBeNull();

  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      points: [
        expect.objectContaining({
          date: "2026-04-14",
          effectiveCompletedLoad: 60,
          plannedLoad: 125,
        }),
      ],
      range: "weekly",
      selectedDate: "2026-04-14",
    }),
  );
  expect(screen.getByText("6M · Week")).toBeTruthy();
  expect(screen.getByTestId("mock-period-review")).toBeTruthy();
  expect(periodReviewProps).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ period: expect.anything() }),
  );
  expect(periodReviewUseQuery).toHaveBeenLastCalledWith(
    { anchorDate: "2026-04-15", period: "week" },
    expect.objectContaining({ retry: false }),
  );
  const reviewProps = periodReviewProps.mock.calls.at(-1)?.[0] as { onOpenDetails: () => void };
  await React.act(async () => reviewProps.onOpenDetails());
  expect(commonProps.onViewDetails).toHaveBeenCalledWith("2026-04-15", "week");
  expect(selectedDayProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedDate: "2026-04-15" }),
  );
});

it("toggles fitness, fatigue, and form independently while Load remains enabled", async () => {
  await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);

  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ loadOnly: true, visibleTrends: ["fitness", "fatigue", "form"] }),
  );
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-trend-fitness"));
  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ loadOnly: true, visibleTrends: ["fatigue", "form"] }),
  );
  expect(screen.queryByTestId("plan-load-display-sheet")).toBeNull();
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-trend-fatigue"));
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-trend-form"));
  expect(chartProps).toHaveBeenLastCalledWith(expect.objectContaining({ visibleTrends: [] }));
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-trend-fitness"));
  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ visibleTrends: ["fitness"] }),
  );
});

it("moves by the selected window and preserves weekly grouping for the newly loaded range", async () => {
  const { rerender } = await renderNative(<PlanUnifiedTrendDashboard {...commonProps} />);
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-bin-weekly"));

  await fireEvent.press(screen.getByTestId("plan-load-controls-next"));
  expect(commonProps.onPeriodShift).toHaveBeenCalledWith(1);

  await rerender(
    <PlanUnifiedTrendDashboard
      {...commonProps}
      analysisAnchor="2026-10-15"
      dailyPoints={[
        { date: "2026-10-14", effectiveCompletedLoad: 10, plannedLoad: 20 },
        { date: "2026-10-15", effectiveCompletedLoad: 15, plannedLoad: 25 },
      ]}
      selectedDate="2026-10-15"
    />,
  );

  expect(screen.getByText("6M · Week")).toBeTruthy();
  expect(periodReviewProps).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ period: expect.anything() }),
  );
  expect(screen.getByTestId("plan-load-controls-today")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("plan-load-controls-today"));
  expect(commonProps.onRangeToday).toHaveBeenCalledTimes(1);
  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      points: [
        expect.objectContaining({
          date: "2026-10-14",
          effectiveCompletedLoad: 25,
          plannedLoad: 45,
        }),
      ],
      range: "weekly",
    }),
  );
});
