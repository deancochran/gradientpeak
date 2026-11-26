import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const chartProps = jest.fn();
const apiQuery = jest.fn(() => {
  throw new Error("PlanTrainingChart must not make API queries");
});

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@/lib/api", () => ({
  api: {
    calendar: { day: { useQuery: apiQuery } },
    trainingPlans: { getPlanPeriodReview: { useQuery: apiQuery } },
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
jest.mock("./TrainingPathLegend", () => ({ TrainingPathLegend: createHost("TrainingPathLegend") }));

const { PlanTrainingChart } = require("./PlanTrainingChart");

const commonProps = {
  analysisAnchor: "2026-04-15",
  analysisPeriod: "6m",
  analysisWindowLoading: false,
  binning: "daily",
  dailyPoints: [
    { date: "2026-04-14", effectiveCompletedLoad: 20, plannedLoad: 30 },
    { date: "2026-04-15", effectiveCompletedLoad: 40, plannedLoad: 50 },
    { date: "2026-04-16", plannedLoad: 45 },
  ],
  onBinningChange: jest.fn(),
  onPeriodShift: jest.fn(),
  onRangeChange: jest.fn(),
  onRangeToday: jest.fn(),
  onSelectedDateChange: jest.fn(),
  selectedDate: "2026-04-15",
  todayKey: "2026-04-15",
};

beforeEach(() => jest.clearAllMocks());

it("forwards Plan-tab controls while rendering without API queries", async () => {
  await renderNative(<PlanTrainingChart {...commonProps} />);

  expect(screen.getByTestId("mock-load-chart")).toBeTruthy();
  expect(apiQuery).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("plan-load-controls-previous"));
  await fireEvent.press(screen.getByTestId("plan-load-controls-next"));
  expect(commonProps.onPeriodShift).toHaveBeenNthCalledWith(1, -1);
  expect(commonProps.onPeriodShift).toHaveBeenNthCalledWith(2, 1);

  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-controls-range-1y"));
  expect(commonProps.onRangeChange).toHaveBeenCalledWith("1y");
  await fireEvent.press(screen.getByTestId("plan-load-display-settings"));
  await fireEvent.press(screen.getByTestId("plan-load-bin-weekly"));
  expect(commonProps.onBinningChange).toHaveBeenCalledWith("weekly");
});

it("uses the same anchored weekly bucket for aggregation and selected renderer date", async () => {
  const formatDateLabel = jest.fn((date: string) => `Draft ${date}`);
  await renderNative(
    <PlanTrainingChart
      {...commonProps}
      binning="weekly"
      formatDateLabel={formatDateLabel}
      selectedDate="2026-04-15"
      weekAnchorDate="2026-04-15"
    />,
  );

  expect(chartProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      formatDateLabel,
      points: expect.arrayContaining([
        expect.objectContaining({
          date: "2026-04-15",
          effectiveCompletedLoad: 40,
          plannedLoad: 95,
        }),
      ]),
      range: "weekly",
      selectedDate: "2026-04-15",
    }),
  );
});
