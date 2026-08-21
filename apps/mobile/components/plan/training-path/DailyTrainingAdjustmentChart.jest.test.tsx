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

  it("marks a known-zero completed load at the chart baseline", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 0,
            effectiveCompletedLoadStatus: "known_zero",
          },
        ]}
      />,
    );

    expect(
      screen.UNSAFE_root.findByProps({
        testID: "known-zero-completed-load-marker-2026-06-01",
      }),
    ).toBeTruthy();
    expect(
      screen.UNSAFE_root.findAll(
        (node: ReactTestInstance) =>
          String(node.type) === "Rect" &&
          node.props.height === 3 &&
          node.props.color === "rgba(22, 163, 74, 0.86)",
      ),
    ).toHaveLength(1);
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

  it("highlights every completed activity without a calculated load", () => {
    render(
      <DailyTrainingAdjustmentChart
        selectedDate="2026-06-02"
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

    expect(
      screen.UNSAFE_root.findByProps({
        testID: "completed-activity-without-load-highlight-2026-06-01",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Completed activity without estimated load on 2026-06-01"),
    ).toBeNull();
    expect(
      screen.UNSAFE_root.findByProps({
        testID: "completed-activity-without-load-highlight-2026-06-02",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Completed activity without estimated load on 2026-06-02"),
    ).toBeNull();
    expect(screen.queryByTestId("completed-activity-without-load-highlight-2026-06-03")).toBeNull();
    const bottomMarkers = screen.UNSAFE_root.findAll(
      (node: ReactTestInstance) =>
        String(node.type) === "Rect" && node.props.height === 3 && node.props.y === 97,
    );
    expect(bottomMarkers).toHaveLength(2);
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
    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 0, y: 0 });
  });

  it("does not let passive native mount scrolling replace the controlled date", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", effectiveLoadStatus: "complete", effectiveLoad: 40 },
          { date: "2026-06-02", effectiveLoadStatus: "complete", effectiveLoad: 50 },
          { date: "2026-06-03", effectiveLoadStatus: "complete", effectiveLoad: 60 },
        ]}
        selectedDate="2026-06-03"
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(screen.getByText("2026-06-03")).toBeTruthy();
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
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
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
    act(() => jest.runOnlyPendingTimers());
    expect(mockScrollTo).not.toHaveBeenCalled();
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
    act(() => jest.advanceTimersByTime(499));
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    fireEvent(scrollView, "momentumScrollBegin");
    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    jest.useRealTimers();
  });

  it("keeps the viewport stable when a velocity drag settles without momentum events", () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    const initialPoints = [
      { date: "2026-06-01", targetLoad: 40 },
      { date: "2026-06-02", targetLoad: 50 },
      { date: "2026-06-03", targetLoad: 60 },
    ];
    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={initialPoints}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 31, y: 0 }, velocity: { x: 1, y: 0 } },
    });
    rerender(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          ...initialPoints,
          { date: "2026-06-04", targetLoad: 70 },
          { date: "2026-06-05", targetLoad: 80 },
        ]}
      />,
    );

    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();
    act(() => jest.advanceTimersByTime(500));

    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();
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
      text: "Selected date 2026-06-02. Planned Common Load unavailable",
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

    const target = screen.UNSAFE_root.findByProps({
      testID: "daily-training-adjustment-chart-bucket-2026-06-01",
    });
    expect(target.props.accessible).toBe(false);
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
    expect(chart.props.data.map((datum: { x: number }) => datum.x)).toEqual([60, 180]);
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
            formTsb: -1.8,
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
        "Form -2",
      ].join(". "),
    });
  });

  it("renders metric axes, projection styles, and a visible Today boundary", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-05-31",
            effectiveCompletedLoad: 15,
            fitnessCtl: 39,
            formTsb: -5,
          },
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 20,
            fitnessCtl: 40,
            scheduledFitnessCtl: 40,
            targetFitnessCtl: 40,
            recommendedLoadStatus: "complete",
            recommendedLoad: 30,
            formTsb: 0,
          },
          {
            date: "2026-06-02",
            effectiveRemainingLoad: 25,
            scheduledFitnessCtl: 42,
            targetFitnessCtl: 43,
            recommendedLoadStatus: "complete",
            recommendedLoad: 35,
            formTsb: 8,
          },
        ]}
        selectedDate="2026-06-01"
        showRecommendedProjection
        todayDate="2026-06-01"
      />,
    );

    expect(screen.getByLabelText("Left axis: Load, Common Load")).toBeTruthy();
    expect(screen.getByLabelText("Right axis: Fitness / Fatigue")).toBeTruthy();
    expect(screen.getByText("Form line shows recovery")).toBeTruthy();
    expect(
      screen.UNSAFE_root.findByProps({
        testID: "daily-training-adjustment-chart-today-boundary",
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Today boundary at 2026-06-01")).toBeNull();

    const lines = screen.UNSAFE_root.findAll(
      (node: ReactTestInstance) => String(node.type) === "Line",
    );
    const currentFitness = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(22, 163, 74, 0.95)",
    );
    const plannedProjection = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(37, 99, 235, 0.95)",
    );
    const form = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(124, 58, 237, 0.95)",
    );
    expect(currentFitness?.props.points).toHaveLength(3);
    expect(plannedProjection?.props.points).toHaveLength(3);
    expect(form?.props.points).toHaveLength(3);
    expect(
      currentFitness?.props.points.map((point: { yValue: number | null }) => point.yValue),
    ).toEqual([39, 40, null]);
    expect(
      plannedProjection?.props.points.map((point: { yValue: number | null }) => point.yValue),
    ).toEqual([null, 40, 42]);
    expect(form?.props.points.map((point: { yValue: number }) => point.yValue)).toEqual([-5, 0, 8]);
    expect(currentFitness?.props.connectMissingData).toBe(false);
    expect(plannedProjection?.props.connectMissingData).toBe(false);
    expect(form?.props.connectMissingData).toBe(false);
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

  it("keeps a visible line gap for a missing training-state value", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", fitnessCtl: 40 },
          { date: "2026-06-02", fitnessCtl: null },
          { date: "2026-06-03", fitnessCtl: 44 },
        ]}
      />,
    );

    const fitnessLine = screen.UNSAFE_root.findAll(
      (node: ReactTestInstance) => String(node.type) === "Line",
    ).find((line: ReactTestInstance) => line.props.color === "rgba(22, 163, 74, 0.95)");
    expect(fitnessLine?.props.connectMissingData).toBe(false);
    expect(
      fitnessLine?.props.points.map((point: { yValue: number | null }) => point.yValue),
    ).toEqual([40, null, 44]);
  });

  it("shows the native horizontal exploration indicator", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", plannedLoad: 10 },
          { date: "2026-06-02", plannedLoad: 20 },
        ]}
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    expect(scrollView.props.showsHorizontalScrollIndicator).toBe(true);
    expect(scrollView.props.persistentScrollbar).toBe(true);
  });

  it("keeps today's plotted values unchanged after windowing backward and forward", () => {
    const points = Array.from({ length: 25 }, (_, index) => {
      const day = index + 1;
      return {
        date: `2026-06-${String(day).padStart(2, "0")}`,
        effectiveCompletedLoad: day,
        effectiveRemainingLoad: day * 2,
        fitnessCtl: 30 + day,
        scheduledFitnessCtl: 31 + day,
        formTsb: day - 15,
      };
    });
    render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={points}
        selectedDate="2026-06-15"
      />,
    );
    fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent(scrollView, "contentSizeChange", 720, 230);
    const todayBefore = screen.UNSAFE_getByType("CartesianChart" as never).props.data[5];

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(screen.getByText("06/15", { includeHiddenElements: true })).toBeTruthy();

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 480, y: 0 } } });
    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 480, y: 0 } },
    });

    const todayAfter = screen
      .UNSAFE_getByType("CartesianChart" as never)
      .props.data.find(
        (point: { actualFitness: number | null }) =>
          point.actualFitness === todayBefore.actualFitness,
      );
    expect(todayAfter).toMatchObject({
      actualFitness: todayBefore.actualFitness,
      completedLoad: todayBefore.completedLoad,
      form: todayBefore.form,
      plannedLoad: todayBefore.plannedLoad,
      projectedFitness: todayBefore.projectedFitness,
    });
    expect(screen.getByText("06/15", { includeHiddenElements: true })).toBeTruthy();
  });

  it("keeps the same dates visible when data arrives during drag and momentum", () => {
    const buildPoints = (startDay: number, endDay: number) =>
      Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
        date: `2026-06-${String(startDay + index).padStart(2, "0")}`,
        targetLoad: startDay,
      }));
    const onSelectedDateChange = jest.fn();

    const { rerender } = render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
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
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    const chartDataBefore = screen.UNSAFE_getByType("CartesianChart" as never).props.data;

    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
        points={buildPoints(1, 19)}
        selectedDate="2026-06-15"
      />,
    );
    expect(screen.UNSAFE_getByType("CartesianChart" as never).props.data).toBe(chartDataBefore);
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();

    fireEvent(scrollView, "momentumScrollBegin");
    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
        points={buildPoints(1, 25)}
        selectedDate="2026-06-15"
      />,
    );
    expect(screen.UNSAFE_getByType("CartesianChart" as never).props.data).toBe(chartDataBefore);

    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    expect(screen.UNSAFE_getByType("CartesianChart" as never).props.data).not.toBe(chartDataBefore);
    expect(onSelectedDateChange).toHaveBeenLastCalledWith("2026-06-12");
    expect(screen.getByText("2026-06-12")).toBeTruthy();
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();
    expect(
      screen.UNSAFE_root.findByProps({
        testID: "daily-training-adjustment-chart-bucket-2026-06-12",
      }),
    ).toBeTruthy();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});
