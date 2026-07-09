import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    jest.requireActual("react").createElement("ScrollView", props, children),
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  useAnimatedReaction: jest.fn(),
}));

describe("DailyTrainingAdjustmentChart", () => {
  it("derives a stable bounded chart window around the anchor date", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    }));

    const window = deriveTrainingPathChartWindow({
      anchorDate: "2026-06-06",
      maxPoints: 4,
      points,
      selectedDate: "2026-06-10",
    });

    expect(window.startIndex).toBe(3);
    expect(window.visiblePoints.map((point) => point.date)).toEqual([
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
    ]);
    expect(window.selectedDate).toBe("2026-06-10");
  });

  it("keeps the bounded chart window independent from transient selection", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    }));

    const firstWindow = deriveTrainingPathChartWindow({
      anchorDate: "2026-06-06",
      maxPoints: 4,
      points,
      selectedDate: "2026-06-01",
    });
    const secondWindow = deriveTrainingPathChartWindow({
      anchorDate: "2026-06-06",
      maxPoints: 4,
      points,
      selectedDate: "2026-06-10",
    });

    expect(secondWindow.startIndex).toBe(firstWindow.startIndex);
    expect(secondWindow.visiblePoints).toEqual(firstWindow.visiblePoints);
  });

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

  it("lets native momentum carry between snap points", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", targetLoadTss: 40, actualOrScheduledLoadTss: 35 },
          { date: "2026-06-02", targetLoadTss: 50, actualOrScheduledLoadTss: 65 },
          { date: "2026-06-03", targetLoadTss: 50, actualOrScheduledLoadTss: 30 },
        ]}
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    expect(scrollView.props.disableIntervalMomentum).toBeUndefined();
    expect(scrollView.props.onScrollEndDrag).toBeUndefined();
    expect(scrollView.props.decelerationRate).toBe("fast");
    expect(scrollView.props.snapToInterval).toBeGreaterThan(0);
    expect(screen.queryByTestId("daily-training-adjustment-chart-center-highlight")).toBeNull();
  });

  it("prefetches more days before the user reaches either scroll edge", () => {
    const onScrollNearStart = jest.fn();
    const onScrollNearEnd = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={20}
        onScrollNearEnd={onScrollNearEnd}
        onScrollNearStart={onScrollNearStart}
        points={Array.from({ length: 40 }, (_, index) => ({
          date: `2026-06-${String(index + 1).padStart(2, "0")}`,
          targetLoadTss: 50,
        }))}
        selectedDate="2026-06-15"
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 1000, y: 0 } } });

    expect(onScrollNearStart).toHaveBeenCalledTimes(1);
    expect(onScrollNearEnd).toHaveBeenCalledTimes(1);
  });
});
