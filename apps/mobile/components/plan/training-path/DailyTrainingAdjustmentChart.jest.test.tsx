import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  useAnimatedReaction: jest.fn(),
}));

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  ScrollView: ({ children, ...props }: any) => React.createElement("ScrollView", props, children),
}));

describe("DailyTrainingAdjustmentChart", () => {
  it("renders the selected daily adjustment tray", () => {
    render(
      <DailyTrainingAdjustmentChart
        selectedDate="2026-06-02"
        points={[
          { date: "2026-06-01", targetLoadTss: 40, actualOrScheduledLoadTss: 35 },
          { date: "2026-06-02", targetLoadTss: 50, actualOrScheduledLoadTss: 65 },
        ]}
      />,
    );

    expect(screen.getByText("2026-06-02")).toBeTruthy();
    expect(screen.getByText("+15 TSS")).toBeTruthy();
  });

  it("renders an empty state", () => {
    render(<DailyTrainingAdjustmentChart points={[]} />);

    expect(screen.getByText("No daily training adjustments yet.")).toBeTruthy();
  });

  it("selects the nearest day when scrolling settles", () => {
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", targetLoadTss: 40, actualOrScheduledLoadTss: 35 },
          { date: "2026-06-02", targetLoadTss: 50, actualOrScheduledLoadTss: 65 },
          { date: "2026-06-03", targetLoadTss: 50, actualOrScheduledLoadTss: 30 },
        ]}
      />,
    );

    fireEvent(screen.getByTestId("daily-training-adjustment-chart-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 42, y: 0 } },
    });

    expect(screen.getByText("2026-06-02")).toBeTruthy();
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
  });
});
