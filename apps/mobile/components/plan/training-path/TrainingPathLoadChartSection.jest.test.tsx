import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { TrainingPathLoadChartSection } from "./TrainingPathLoadChartSection";

const chartProps: Array<Record<string, unknown>> = [];
jest.mock("./DailyTrainingAdjustmentChart", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    DailyTrainingAdjustmentChart: (props: Record<string, unknown>) => {
      chartProps.push(props);
      return ReactRuntime.createElement("View", { testID: props.testID });
    },
  };
});

beforeEach(() => chartProps.splice(0));

it("keeps the daily chart legend collapsed until requested", async () => {
  await render(
    <TrainingPathLoadChartSection
      dailyPoints={[{ date: "2026-06-02", effectiveCompletedLoad: 20, effectiveRemainingLoad: 30 }]}
      selectedDate="2026-06-02"
    />,
  );
  expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();
  expect(screen.queryByTestId("training-path-legend")).toBeNull();
  expect(screen.getByTestId("training-path-period-summary")).toBeTruthy();
  expect(screen.queryByTestId("training-path-range-dropdown-trigger")).toBeNull();
  expect(screen.getByTestId("training-path-legend-button")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("training-path-legend-button"));
  expect(screen.getByTestId("training-path-legend")).toBeTruthy();
  expect(chartProps.at(-1)).not.toHaveProperty("range");
});
