import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import { hasCompletedActivityWithoutLoad } from "./dailyTrainingAdjustmentChartPresentation";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";

const mockScrollTo = jest.fn();

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    __esModule: true,
    ScrollView: ReactRuntime.forwardRef(
      ({ children, ...props }: { children?: React.ReactNode }, ref) => {
        ReactRuntime.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
        return ReactRuntime.createElement("ScrollView", props, children);
      },
    ),
  };
});

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  useAnimatedReaction: jest.fn(),
}));

describe("DailyTrainingAdjustmentChart", () => {
  beforeEach(() => {
    mockScrollTo.mockClear();
  });

  it("identifies an unavailable completed activity load", () => {
    expect(
      hasCompletedActivityWithoutLoad({
        date: "2026-06-01",
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toBe(true);
  });

  it("does not mark a known zero completed load as unavailable", () => {
    expect(
      hasCompletedActivityWithoutLoad({
        date: "2026-06-01",
        hasCompletedActivityWithoutLoad: false,
      }),
    ).toBe(false);
  });

  it("keeps an unavailable marker alongside a known completed aggregate load", () => {
    expect(
      hasCompletedActivityWithoutLoad({
        date: "2026-06-01",
        hasCompletedActivityWithoutLoad: true,
      }),
    ).toBe(true);
  });

  it("does not mark creation-like points without a completed activity", () => {
    expect(
      hasCompletedActivityWithoutLoad({
        date: "2026-06-01",
        hasCompletedActivityWithoutLoad: false,
      }),
    ).toBe(false);
  });

  it("renders accessible markers only for unavailable completed activity loads", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-01",
            completedLoad: 0,
            hasCompletedActivityWithoutLoad: true,
            targetLoad: 40,
          },
          {
            date: "2026-06-02",
            completedLoad: 42,
            hasCompletedActivityWithoutLoad: true,
            targetLoad: 40,
          },
          {
            date: "2026-06-03",
            completedLoad: 0,
            targetLoad: 40,
          },
          {
            date: "2026-06-04",
            targetLoad: 40,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("completed-activity-marker-label-2026-06-01")).toBeTruthy();
    expect(screen.getByLabelText("Completed activity without load on 2026-06-01")).toBeTruthy();
    expect(screen.getByTestId("completed-activity-marker-label-2026-06-02")).toBeTruthy();
    expect(screen.queryByTestId("completed-activity-marker-label-2026-06-03")).toBeNull();
    expect(screen.queryByTestId("completed-activity-marker-label-2026-06-04")).toBeNull();
  });

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
          { date: "2026-06-01", effectiveLoadStatus: "complete", effectiveLoad: 35 },
          {
            date: "2026-06-02",
            effectiveLoadStatus: "complete",
            effectiveLoad: 65,
            effectiveIntensity: 0.9,
          },
        ]}
      />,
    );

    expect(screen.getByText("2026-06-02")).toBeTruthy();
    expect(screen.getByText("65")).toBeTruthy();
    expect(screen.getByText("Hard · 0.90")).toBeTruthy();
    expect(screen.queryByText(/TSS/)).toBeNull();
    expect(screen.queryByText("Target")).toBeNull();
  });

  it("omits recommendation and target-comparison copy when target load is unavailable", () => {
    render(
      <DailyTrainingAdjustmentChart
        selectedDate="2026-06-02"
        points={[
          {
            actualOrScheduledLoad: 35,
            date: "2026-06-02",
            hasTargetLoad: false,
            plannedLoad: 35,
            targetLoad: 0,
          },
        ]}
      />,
    );

    expect(screen.queryByText("Target")).toBeNull();
    expect(screen.queryByText("On target")).toBeNull();
  });

  it("keeps recommendation data out of chart layers while preserving reusable tray compatibility", () => {
    render(
      <DailyTrainingAdjustmentChart
        selectedDate="2026-06-02"
        points={[
          {
            date: "2026-06-02",
            effectiveLoadStatus: "complete",
            effectiveLoad: 65,
            recommendedLoadStatus: "complete",
            recommendedLoad: 80,
            targetLoad: 1_000,
          },
        ]}
      />,
    );

    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.queryByText("1000")).toBeNull();
  });

  it("centers the initial controlled date only after viewport and content readiness", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", effectiveLoadStatus: "complete", effectiveLoad: 40 },
          {
            date: "2026-06-02",
            effectiveLoadStatus: "complete",
            effectiveLoad: 50,
            effectiveIntensity: 0.75,
          },
          { date: "2026-06-03", effectiveLoadStatus: "complete", effectiveLoad: 60 },
        ]}
        selectedDate="2026-06-03"
      />,
    );

    expect(mockScrollTo).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    expect(mockScrollTo).not.toHaveBeenCalled();

    fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "contentSizeChange",
      600,
      230,
    );

    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 96, y: 0 });
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
          { date: "2026-06-01", targetLoad: 40, actualOrScheduledLoad: 35 },
          { date: "2026-06-02", targetLoad: 50, actualOrScheduledLoad: 65 },
          { date: "2026-06-03", targetLoad: 50, actualOrScheduledLoad: 30 },
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
          { date: "2026-06-01", targetLoad: 40, actualOrScheduledLoad: 35 },
          { date: "2026-06-02", targetLoad: 50, actualOrScheduledLoad: 65 },
          { date: "2026-06-03", targetLoad: 50, actualOrScheduledLoad: 30 },
        ]}
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    expect(scrollView.props.disableIntervalMomentum).toBeUndefined();
    expect(scrollView.props.onScrollEndDrag).toEqual(expect.any(Function));
    expect(scrollView.props.decelerationRate).toBe("fast");
    expect(scrollView.props.snapToInterval).toBeGreaterThan(0);
  });

  it("commits a slow drag without momentum exactly once", () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", effectiveLoadStatus: "complete", effectiveLoad: 40 },
          {
            date: "2026-06-02",
            effectiveLoadStatus: "complete",
            effectiveLoad: 50,
            effectiveIntensity: 0.75,
          },
          { date: "2026-06-03", effectiveLoadStatus: "complete", effectiveLoad: 60 },
        ]}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 34, y: 0 } },
    });
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    act(() => jest.runOnlyPendingTimers());
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
    jest.useRealTimers();
  });

  it("cancels drag settlement when momentum starts and commits momentum once", () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", targetLoad: 40 },
          { date: "2026-06-02", targetLoad: 50 },
          { date: "2026-06-03", targetLoad: 60 },
        ]}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    const dragEvent = { nativeEvent: { contentOffset: { x: 31, y: 0 } } };
    const momentumEvent = { nativeEvent: { contentOffset: { x: 96, y: 0 } } };

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent(scrollView, "scrollEndDrag", dragEvent);
    fireEvent(scrollView, "momentumScrollBegin");
    act(() => jest.runOnlyPendingTimers());
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    fireEvent(scrollView, "momentumScrollEnd", momentumEvent);
    fireEvent(scrollView, "momentumScrollEnd", momentumEvent);
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    jest.useRealTimers();
  });

  it("waits for momentum when drag-end velocity is present", () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", targetLoad: 40 },
          { date: "2026-06-02", targetLoad: 50 },
          { date: "2026-06-03", targetLoad: 60 },
        ]}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 31, y: 0 }, velocity: { x: 1, y: 0 } },
    });
    act(() => jest.runOnlyPendingTimers());
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    fireEvent(scrollView, "momentumScrollBegin");
    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    jest.useRealTimers();
  });

  it("previews the selected day instantly while scrolling without committing until settle", () => {
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", targetLoad: 40, actualOrScheduledLoad: 35 },
          { date: "2026-06-02", targetLoad: 50, actualOrScheduledLoad: 65 },
          { date: "2026-06-03", targetLoad: 50, actualOrScheduledLoad: 30 },
        ]}
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 96, y: 0 } } });

    expect(screen.getByText("2026-06-03")).toBeTruthy();
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });

    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
  });

  it("keeps a controlled local commit selected until the parent acknowledges it", () => {
    const onSelectedDateChange = jest.fn();
    const points = [
      { date: "2026-06-01", targetLoad: 40 },
      { date: "2026-06-02", targetLoad: 50 },
      { date: "2026-06-03", targetLoad: 60 },
    ];
    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-01"
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent(scrollView, "momentumScrollBegin");
    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });
    expect(screen.getByText("2026-06-03")).toBeTruthy();

    rerender(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-01"
      />,
    );
    expect(screen.getByText("2026-06-03")).toBeTruthy();

    rerender(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-03"
      />,
    );
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("exposes one adjustable chart control for selecting adjacent dates", () => {
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", effectiveLoadStatus: "complete", effectiveLoad: 40 },
          {
            date: "2026-06-02",
            effectiveLoadStatus: "complete",
            effectiveLoad: 50,
            effectiveIntensity: 0.75,
          },
          { date: "2026-06-03", effectiveLoadStatus: "complete", effectiveLoad: 60 },
        ]}
        selectedDate="2026-06-02"
      />,
    );

    const adjustable = screen.getByLabelText("Daily training adjustment chart");
    expect(adjustable.props.accessibilityRole).toBe("adjustable");
    expect(adjustable.props.accessibilityValue).toEqual({
      text: "Selected date 2026-06-02",
    });
    expect(adjustable.props.accessibilityHint).toBe("Adjust to select the next or previous date");

    fireEvent(adjustable, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("provides a 44-point period target aligned to each bucket", () => {
    const onSelectedDateChange = jest.fn();
    render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[{ date: "2026-06-01", effectiveRemainingLoad: 20 }]}
      />,
    );

    const target = screen.getByTestId("daily-training-adjustment-chart-bucket-2026-06-01");
    expect(target.props.accessibilityRole).toBe("button");
    expect(target.props.style.width).toBeGreaterThanOrEqual(44);
    fireEvent.press(target);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-01");
  });

  it("passes center-valued x data and the x field to CartesianChart", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", effectiveRemainingLoad: 20 },
          { date: "2026-06-02", effectiveRemainingLoad: 30 },
        ]}
      />,
    );

    const chart = screen.UNSAFE_getByType("CartesianChart" as never);
    expect(chart.props.data.map((datum: { x: number }) => datum.x)).toEqual([120, 168]);
  });

  it("announces available selected load, fitness, and unavailable completed-load state", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-02",
            hasCompletedActivityWithoutLoad: true,
            effectiveLoadStatus: "partial",
            effectiveLoad: 40,
            effectiveIntensity: 0.7,
            effectiveCompletedLoad: 15,
            effectiveRemainingLoad: 25,
            recommendedLoadStatus: "complete",
            recommendedLoad: 80,
            fitnessCtl: 31.4,
            scheduledFitnessCtl: 33.2,
            targetFitnessCtl: 35.1,
          },
        ]}
        selectedDate="2026-06-02"
        showRecommendedProjection
      />,
    );

    expect(
      screen.getByLabelText("Daily training adjustment chart").props.accessibilityValue,
    ).toEqual({
      text: [
        "Selected date 2026-06-02",
        "Completed Common Load 15",
        "Completed activity, Common Load unavailable",
        "Planned Common Load 25",
        "Actual fitness 31",
        "Planned fitness projection 33",
      ].join(". "),
    });
  });

  it("renders metric axes, projection styles, and a visible Today boundary", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 20,
            fitnessCtl: 40,
            scheduledFitnessCtl: 40,
            targetFitnessCtl: 40,
            recommendedLoadStatus: "complete",
            recommendedLoad: 30,
          },
          {
            date: "2026-06-02",
            effectiveRemainingLoad: 25,
            scheduledFitnessCtl: 42,
            targetFitnessCtl: 43,
            recommendedLoadStatus: "complete",
            recommendedLoad: 35,
          },
        ]}
        selectedDate="2026-06-01"
        showRecommendedProjection
        todayDate="2026-06-01"
      />,
    );

    expect(screen.getByLabelText("Left axis: Load, Common Load")).toBeTruthy();
    expect(screen.getByLabelText("Right axis: Training state")).toBeTruthy();
    expect(screen.getByTestId("daily-training-adjustment-chart-today-boundary")).toBeTruthy();
    expect(screen.getByLabelText("Today boundary at 2026-06-01")).toBeTruthy();

    const lines = screen.UNSAFE_root.findAll(
      (node: ReactTestInstance) => String(node.type) === "Line",
    );
    const currentFitness = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(22, 163, 74, 0.95)",
    );
    const plannedProjection = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(37, 99, 235, 0.95)",
    );
    expect(currentFitness?.props.children).toBeUndefined();
    expect(plannedProjection?.props.children).toBeUndefined();
    expect(
      lines.find((line: ReactTestInstance) => line.props.color === "rgba(15, 23, 42, 0.44)"),
    ).toBeUndefined();
    expect(
      screen.UNSAFE_root.findAll(
        (node: ReactTestInstance) =>
          String(node.type) === "SkiaText" && node.props.text === "TODAY",
      ),
    ).toHaveLength(1);
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
          targetLoad: 50,
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

  it("keeps the chart anchored to the viewport instead of an old selected date while loading more days", () => {
    const buildPoints = (length: number) =>
      Array.from({ length }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, "0")}`,
        targetLoad: 50,
      }));

    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(24)}
        selectedDate="2026-06-15"
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 336, y: 0 } } });

    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(40)}
        selectedDate="2026-06-15"
      />,
    );

    expect(screen.getByText("06/21", { includeHiddenElements: true })).toBeTruthy();
  });

  it("restores the centered date after older dates are prepended", () => {
    const buildPoints = (startDay: number, endDay: number) =>
      Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
        date: `2026-06-${String(startDay + index).padStart(2, "0")}`,
        targetLoad: 50,
      }));

    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(10, 19)}
        selectedDate="2026-06-15"
      />,
    );
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "contentSizeChange",
      600,
      230,
    );
    mockScrollTo.mockClear();
    fireEvent.scroll(screen.getByTestId("daily-training-adjustment-chart-scroll"), {
      nativeEvent: { contentOffset: { x: 120, y: 0 } },
    });
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 120, y: 0 } },
    });
    mockScrollTo.mockClear();

    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(5, 19)}
        selectedDate="2026-06-15"
      />,
    );

    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 240, y: 0 });
  });

  it("preserves the final drag position when dates arrive during momentum", () => {
    const buildPoints = (startDay: number, endDay: number) =>
      Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
        date: `2026-06-${String(startDay + index).padStart(2, "0")}`,
        targetLoad: 50,
      }));
    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(10, 19)}
        selectedDate="2026-06-15"
      />,
    );
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "contentSizeChange",
      600,
      230,
    );
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-scroll"), "scrollBeginDrag");
    fireEvent.scroll(screen.getByTestId("daily-training-adjustment-chart-scroll"), {
      nativeEvent: { contentOffset: { x: 120, y: 0 } },
    });

    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(5, 19)}
        selectedDate="2026-06-15"
      />,
    );
    mockScrollTo.mockClear();
    fireEvent.scroll(screen.getByTestId("daily-training-adjustment-chart-scroll"), {
      nativeEvent: { contentOffset: { x: 180, y: 0 } },
    });
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-scroll"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 180, y: 0 } },
    });

    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 192, y: 0 });
  });
});
