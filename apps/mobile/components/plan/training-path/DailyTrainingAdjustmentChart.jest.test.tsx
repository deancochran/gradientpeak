import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { TestInstance as ReactTestInstance } from "test-renderer";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import { hasCompletedActivityWithoutLoad } from "./dailyTrainingAdjustmentChartPresentation";
import { getPlanChartTheme } from "./planChartTheme";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";

const mockScrollTo = jest.fn();

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Expected ${description}`);
  return value;
}

function getCartesianChart(): ReactTestInstance {
  return requireValue(
    screen.container.queryAll((node) => node.type === "CartesianChart")[0],
    "a CartesianChart",
  );
}

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

  it("does not render a baseline marker for a known-zero completed load", async () => {
    await render(
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
      screen.container.queryAll(
        (node: ReactTestInstance) => String(node.type) === "Rect" && node.props.height === 3,
      ),
    ).toHaveLength(0);
    expect(
      screen.container.queryAll(
        (node: ReactTestInstance) =>
          String(node.type) === "Rect" &&
          node.props.color === getPlanChartTheme("light").completedLoad,
      ),
    ).toHaveLength(0);
  });

  it("renders positive load bars in neutral colors", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 24,
            effectiveCompletedLoadStatus: "complete",
            plannedLoad: 30,
            plannedLoadStatus: "complete",
          },
        ]}
      />,
    );

    const colors = screen.container
      .queryAll((node: ReactTestInstance) => String(node.type) === "Rect")
      .map((node) => node.props.color);
    const theme = getPlanChartTheme("light");
    expect(colors).toContain(theme.completedLoad);
    expect(colors).toContain(theme.plannedLoad);
    expect(theme.completedLoad).not.toBe(theme.fitness);
    expect(theme.plannedLoad).not.toBe(theme.projectedFitness);
  });

  it("removes nonessential axis chrome in compact mode", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        density="compact"
        points={[{ date: "2026-06-01", effectiveCompletedLoad: 24, fitnessCtl: 40 }]}
        visibleTrends={["fitness"]}
      />,
    );

    expect(screen.queryByLabelText("Left axis: Load, Common Load")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.getByLabelText("Plan Load and trend timeline")).toBeTruthy();
  });

  it("does not visually distinguish a load value based on incomplete evidence", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 24,
            effectiveCompletedLoadStatus: "partial",
          },
        ]}
      />,
    );

    expect(
      screen.container.queryAll(
        (node) => node.props.testID === "incomplete-completed-load-marker-2026-06-01",
      ),
    ).toHaveLength(0);
    expect(
      screen.container.queryAll(
        (node: ReactTestInstance) => String(node.type) === "Rect" && node.props.opacity === 0.35,
      ),
    ).toHaveLength(0);
    expect(
      screen.container.queryAll(
        (node: ReactTestInstance) =>
          String(node.type) === "SkiaLine" && node.props.strokeWidth === 2,
      ),
    ).toHaveLength(0);
    expect(
      screen.container.queryAll(
        (node: ReactTestInstance) =>
          String(node.type) === "Rect" &&
          node.props.color === getPlanChartTheme("light").completedLoad,
      ),
    ).toHaveLength(1);
  });

  it("stacks same-date goals, prioritizes their tap target, and exposes offscreen goals", async () => {
    const onGoalPress = jest.fn();
    await render(
      <DailyTrainingAdjustmentChart
        goalMarkers={[
          { id: "goal-low", label: "Local 5K", priority: 3, targetDate: "2026-06-01" },
          { id: "goal-high", label: "A race", priority: 9, targetDate: "2026-06-01" },
          { id: "goal-later", label: "Autumn race", priority: 8, targetDate: "2026-07-01" },
        ]}
        loadOnly
        onGoalPress={onGoalPress}
        points={[
          { date: "2026-06-01", effectiveCompletedLoad: 24 },
          { date: "2026-06-02", plannedLoad: 30 },
        ]}
        primaryGoalId="goal-high"
        showSelectedTray={false}
        testID="plan-load"
      />,
    );

    const marker = screen.getByTestId("plan-load-goal-marker-2026-06-01");
    expect(marker.props.accessibilityLabel).toBe("2 goals on 2026-06-01. Open A race");
    await fireEvent.press(marker);
    expect(onGoalPress).toHaveBeenCalledWith("goal-high");
    expect(screen.getByTestId("plan-load-goals-after")).toBeTruthy();
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

  it("does not render bottom markers for incomplete load collection", async () => {
    await render(
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

    expect(screen.queryByTestId("completed-activity-without-load-highlight-2026-06-01")).toBeNull();
    expect(screen.queryByTestId("completed-activity-without-load-highlight-2026-06-02")).toBeNull();
    expect(screen.queryByTestId("completed-activity-without-load-highlight-2026-06-03")).toBeNull();
    const bottomMarkers = screen.container.queryAll(
      (node: ReactTestInstance) =>
        String(node.type) === "Rect" && node.props.height === 3 && node.props.y === 97,
    );
    expect(bottomMarkers).toHaveLength(0);
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

  it("renders the selected daily adjustment tray", async () => {
    await render(
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

  it("omits recommendation and target-comparison copy when target load is unavailable", async () => {
    await render(
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

  it("keeps recommendation data out of chart layers while preserving reusable tray compatibility", async () => {
    await render(
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

  it("centers the initial controlled date only after viewport and content readiness", async () => {
    await render(
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

    await fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    expect(mockScrollTo).not.toHaveBeenCalled();

    await fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "contentSizeChange",
      600,
      230,
    );

    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 0, y: 0 });
  });

  it("does not let passive native mount scrolling replace the controlled date", async () => {
    await render(
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
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("renders an empty state", async () => {
    await render(<DailyTrainingAdjustmentChart points={[]} />);

    expect(screen.getByText("No daily training adjustments yet.")).toBeTruthy();
  });

  it("selects the nearest day when scrolling settles", async () => {
    const onSelectedDateChange = jest.fn();
    await render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[
          { date: "2026-06-01", targetLoad: 40, actualOrScheduledLoad: 35 },
          { date: "2026-06-02", targetLoad: 50, actualOrScheduledLoad: 65 },
          { date: "2026-06-03", targetLoad: 50, actualOrScheduledLoad: 30 },
        ]}
      />,
    );

    await fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "momentumScrollEnd",
      {
        nativeEvent: { contentOffset: { x: 0, y: 0 } },
      },
    );

    expect(screen.getByText("2026-06-02")).toBeTruthy();
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
  });

  it("lets native momentum carry between snap points", async () => {
    await render(
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

  it("commits a slow drag without momentum exactly once", async () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    await render(
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

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 34, y: 0 } },
    });
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    await act(() => jest.runOnlyPendingTimers());
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
    await act(() => jest.runOnlyPendingTimers());
    expect(mockScrollTo).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("cancels drag settlement when momentum starts and commits momentum once", async () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    await render(
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

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent(scrollView, "scrollEndDrag", dragEvent);
    await fireEvent(scrollView, "momentumScrollBegin");
    await act(() => jest.runOnlyPendingTimers());
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    await fireEvent(scrollView, "momentumScrollEnd", momentumEvent);
    await fireEvent(scrollView, "momentumScrollEnd", momentumEvent);
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    jest.useRealTimers();
  });

  it("waits for momentum when drag-end velocity is present", async () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    await render(
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

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 31, y: 0 }, velocity: { x: 1, y: 0 } },
    });
    await act(() => jest.advanceTimersByTime(499));
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    await fireEvent(scrollView, "momentumScrollBegin");
    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    jest.useRealTimers();
  });

  it("keeps the viewport stable when a velocity drag settles without momentum events", async () => {
    jest.useFakeTimers();
    const onSelectedDateChange = jest.fn();
    const initialPoints = [
      { date: "2026-06-01", targetLoad: 40 },
      { date: "2026-06-02", targetLoad: 50 },
      { date: "2026-06-03", targetLoad: 60 },
    ];
    const { rerender } = await render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={initialPoints}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent(scrollView, "scrollEndDrag", {
      nativeEvent: { contentOffset: { x: 31, y: 0 }, velocity: { x: 1, y: 0 } },
    });
    await rerender(
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
    await act(() => jest.advanceTimersByTime(500));

    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-02");
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();
    jest.useRealTimers();
  });

  it("previews the selected day instantly while scrolling without committing until settle", async () => {
    const onSelectedDateChange = jest.fn();
    await render(
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
    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 96, y: 0 } } });

    expect(screen.getByText("2026-06-03")).toBeTruthy();
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });

    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
  });

  it("keeps a controlled local commit selected until the parent acknowledges it", async () => {
    const onSelectedDateChange = jest.fn();
    const points = [
      { date: "2026-06-01", targetLoad: 40 },
      { date: "2026-06-02", targetLoad: 50 },
      { date: "2026-06-03", targetLoad: 60 },
    ];
    const { rerender } = await render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-01"
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent(scrollView, "momentumScrollBegin");
    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 96, y: 0 } },
    });
    expect(screen.getByText("2026-06-03")).toBeTruthy();

    await rerender(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-01"
      />,
    );
    expect(screen.getByText("2026-06-03")).toBeTruthy();

    await rerender(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2026-06-03"
      />,
    );
    expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("exposes one adjustable chart control for selecting adjacent dates", async () => {
    const onSelectedDateChange = jest.fn();
    await render(
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

    await fireEvent(adjustable, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("provides a 44-point period target aligned to each bucket", async () => {
    const onSelectedDateChange = jest.fn();
    await render(
      <DailyTrainingAdjustmentChart
        onSelectedDateChange={onSelectedDateChange}
        points={[{ date: "2026-06-01", effectiveRemainingLoad: 20 }]}
      />,
    );

    const target = screen.container.queryAll(
      (node) => node.props.testID === "daily-training-adjustment-chart-bucket-2026-06-01",
    )[0];
    if (!target) throw new Error("Expected the daily training adjustment bucket");
    expect(target.props.accessible).toBe(false);
    expect(target.props.style.width).toBeGreaterThanOrEqual(44);
    await fireEvent.press(target);
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-01");
  });

  it("passes center-valued x data and the x field to CartesianChart", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", effectiveRemainingLoad: 20 },
          { date: "2026-06-02", effectiveRemainingLoad: 30 },
        ]}
      />,
    );

    const chart = getCartesianChart();
    expect(chart.props.data.map((datum: { x: number }) => datum.x)).toEqual([60, 180]);
  });

  it("renders finite root-partial load without exposing its internal status", async () => {
    await render(
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
      />,
    );

    expect(
      screen.getByLabelText("Daily training adjustment chart").props.accessibilityValue,
    ).toEqual({
      text: [
        "Selected date 2026-06-02",
        "Completed Common Load 15",
        "Planned Common Load 25",
        "Actual fitness 31",
        "Planned fitness projection 33",
        "Form -2",
      ].join(". "),
    });
  });

  it("renders metric axes, projection styles, and a visible Today boundary", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        points={[
          {
            date: "2026-05-31",
            effectiveCompletedLoad: 15,
            fitnessCtl: 39,
            actualFatigueAtl: 44,
            formTsb: -5,
          },
          {
            date: "2026-06-01",
            effectiveCompletedLoad: 20,
            fitnessCtl: 40,
            scheduledFitnessCtl: 40,
            actualFatigueAtl: 45,
            scheduledFatigueAtl: 45,
            targetFitnessCtl: 40,
            recommendedLoadStatus: "complete",
            recommendedLoad: 30,
            formTsb: 0,
          },
          {
            date: "2026-06-02",
            effectiveRemainingLoad: 25,
            scheduledFitnessCtl: 42,
            scheduledFatigueAtl: 47,
            scheduledFormTsb: 8,
            targetFitnessCtl: 43,
            recommendedLoadStatus: "complete",
            recommendedLoad: 35,
            formTsb: 8,
          },
        ]}
        selectedDate="2026-06-01"
        todayDate="2026-06-01"
      />,
    );

    expect(screen.getByLabelText("Left axis: Load, Common Load")).toBeTruthy();
    expect(screen.getByLabelText("Right axis: Fitness / Fatigue")).toBeTruthy();
    expect(screen.queryByText("Form line shows recovery")).toBeNull();
    expect(
      screen.container.queryAll(
        (node) => node.props.testID === "daily-training-adjustment-chart-today-boundary",
      )[0],
    ).toBeTruthy();
    expect(screen.queryByLabelText("Today boundary at 2026-06-01")).toBeNull();

    const lines = screen.container.queryAll(
      (node: ReactTestInstance) => String(node.type) === "Line",
    );
    const fitness = lines.find(
      (line: ReactTestInstance) =>
        JSON.stringify(
          line.props.points?.map((point: { yValue: number | null }) => point.yValue),
        ) === JSON.stringify([39, 40, 42]),
    );
    const fatigue = lines.find(
      (line: ReactTestInstance) =>
        JSON.stringify(
          line.props.points?.map((point: { yValue: number | null }) => point.yValue),
        ) === JSON.stringify([44, 45, 47]),
    );
    const form = lines.find(
      (line: ReactTestInstance) =>
        JSON.stringify(
          line.props.points?.map((point: { yValue: number | null }) => point.yValue),
        ) === JSON.stringify([-5, 0, 8]),
    );
    expect(fitness?.props.points).toHaveLength(3);
    expect(fatigue?.props.points).toHaveLength(3);
    expect(form?.props.points).toHaveLength(3);
    expect(fitness?.props.points.map((point: { yValue: number | null }) => point.yValue)).toEqual([
      39, 40, 42,
    ]);
    expect(fatigue?.props.points.map((point: { yValue: number | null }) => point.yValue)).toEqual([
      44, 45, 47,
    ]);
    expect(form?.props.points.map((point: { yValue: number | null }) => point.yValue)).toEqual([
      -5, 0, 8,
    ]);
    expect(lines.every((line) => line.props.connectMissingData === true)).toBe(true);
    expect(lines.every((line) => line.props.curveType === "natural")).toBe(true);
    expect(screen.getByText("Fit")).toBeTruthy();
    expect(screen.getByText("Fat")).toBeTruthy();
    expect(screen.getAllByText("Form").length).toBeGreaterThan(0);
    const trendAxes = getCartesianChart().props.yAxis.slice(1);
    expect(trendAxes).toHaveLength(3);
    expect(trendAxes[0].domain).not.toEqual(trendAxes[1].domain);
    expect(trendAxes[1].domain).not.toEqual(trendAxes[2].domain);
    expect(
      screen.container.queryAll(
        (node: ReactTestInstance) =>
          String(node.type) === "SkiaText" && node.props.text === "TODAY",
      ),
    ).toHaveLength(1);
  });

  it("keeps Today visible inside a partial explicit calendar bin", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        goalMarkers={[{ id: "goal", label: "Week goal", priority: 1, targetDate: "2026-06-01" }]}
        loadOnly
        onGoalPress={jest.fn()}
        points={[{ date: "2026-06-03", effectiveCompletedLoad: 20 }]}
        range="weekly"
        todayDate="2026-06-05"
      />,
    );

    expect(
      screen.container.queryAll(
        (node) => node.props.testID === "daily-training-adjustment-chart-today-boundary",
      )[0],
    ).toBeTruthy();
    expect(
      screen.getByTestId("daily-training-adjustment-chart-goal-marker-2026-06-01"),
    ).toBeTruthy();
    expect(screen.queryByTestId("daily-training-adjustment-chart-goals-before")).toBeNull();
  });

  it("renders only the requested optional trend lines alongside Load", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        loadOnly
        points={[
          {
            actualFatigueAtl: 45,
            date: "2026-06-03",
            fitnessCtl: 40,
            formTsb: -5,
            scheduledFatigueAtl: 47,
            scheduledFitnessCtl: 42,
          },
        ]}
        visibleTrends={["fitness"]}
      />,
    );

    const lines = screen.container.queryAll((node) => String(node.type) === "Line");
    expect(lines).toHaveLength(1);
    expect(lines.every((line) => line.props.connectMissingData === true)).toBe(true);
    expect(screen.getByLabelText("Trend lines: Fitness")).toBeTruthy();
    expect(screen.queryByText("Form shows recovery")).toBeNull();
  });

  it("smooths across a missing training-state value", async () => {
    await render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", fitnessCtl: 40 },
          { date: "2026-06-02", fitnessCtl: null },
          { date: "2026-06-03", fitnessCtl: 44 },
        ]}
      />,
    );

    const fitnessLine = screen.container
      .queryAll((node: ReactTestInstance) => String(node.type) === "Line")
      .find(
        (line: ReactTestInstance) =>
          JSON.stringify(
            line.props.points?.map((point: { yValue: number | null }) => point.yValue),
          ) === JSON.stringify([40, null, 44]),
      );
    expect(fitnessLine?.props.connectMissingData).toBe(true);
    expect(
      fitnessLine?.props.points.map((point: { yValue: number | null }) => point.yValue),
    ).toEqual([40, null, 44]);
  });

  it("shows the native horizontal exploration indicator", async () => {
    await render(
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

  it("renders and scrubs every day in a fitted leap-year range", async () => {
    const onSelectedDateChange = jest.fn();
    const start = new Date(Date.UTC(2024, 0, 1));
    const points = Array.from({ length: 366 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        effectiveCompletedLoad: index + 1,
      };
    });
    await render(
      <DailyTrainingAdjustmentChart
        fitRange
        goalMarkers={[{ id: "goal", label: "Leap goal", priority: 9, targetDate: "2024-02-29" }]}
        loadOnly
        onSelectedDateChange={onSelectedDateChange}
        points={points}
        selectedDate="2024-01-01"
        showSelectedTray={false}
        testID="fitted-load"
      />,
    );

    expect(getCartesianChart().props.data).toHaveLength(366);
    expect(screen.queryByTestId("fitted-load-bucket-2024-02-29")).toBeNull();
    expect(screen.queryByTestId("fitted-load-goal-marker-2024-02-29")).toBeNull();
    expect(screen.getByTestId("fitted-load-scroll").props.scrollEnabled).toBe(false);

    const interaction = screen.getByTestId("fitted-load-fitted-interaction");
    await fireEvent(interaction, "responderGrant", { nativeEvent: { locationX: 239.9 } });
    await fireEvent(interaction, "responderRelease", { nativeEvent: { locationX: 239.9 } });
    expect(onSelectedDateChange).toHaveBeenCalledWith("2024-12-31");
  });

  it("replaces the fitted daily viewport when the selected range data changes", async () => {
    const buildPoints = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
        effectiveCompletedLoad: index + 1,
      }));
    const { rerender } = await render(
      <DailyTrainingAdjustmentChart
        fitRange
        loadOnly
        points={buildPoints(42)}
        selectedDate="2024-01-01"
        showSelectedTray={false}
      />,
    );
    expect(getCartesianChart().props.data).toHaveLength(42);

    await rerender(
      <DailyTrainingAdjustmentChart
        fitRange
        loadOnly
        points={buildPoints(366)}
        selectedDate="2024-01-01"
        showSelectedTray={false}
      />,
    );

    expect(getCartesianChart().props.data).toHaveLength(366);
  });

  it("keeps today's plotted values unchanged after windowing backward and forward", async () => {
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
    await render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={points}
        selectedDate="2026-06-15"
      />,
    );
    await fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    await fireEvent(scrollView, "contentSizeChange", 720, 230);
    const todayBefore = requireValue(getCartesianChart().props.data[5], "today's chart point");

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(screen.getByText("06/15", { includeHiddenElements: true })).toBeTruthy();

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 480, y: 0 } } });
    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 480, y: 0 } },
    });

    const todayAfter = requireValue(
      getCartesianChart().props.data.find(
        (point: { actualFitness: number | null }) =>
          point.actualFitness === todayBefore.actualFitness,
      ),
      "today's updated chart point",
    );
    expect(todayAfter).toMatchObject({
      actualFitness: todayBefore.actualFitness,
      completedLoad: todayBefore.completedLoad,
      actualForm: todayBefore.actualForm,
      plannedLoad: todayBefore.plannedLoad,
      projectedFitness: todayBefore.projectedFitness,
      projectedForm: todayBefore.projectedForm,
    });
    expect(screen.getByText("06/15", { includeHiddenElements: true })).toBeTruthy();
  });

  it("keeps the same dates visible when data arrives during drag and momentum", async () => {
    const buildPoints = (startDay: number, endDay: number) =>
      Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
        date: `2026-06-${String(startDay + index).padStart(2, "0")}`,
        targetLoad: startDay,
      }));
    const onSelectedDateChange = jest.fn();

    const { rerender } = await render(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
        points={buildPoints(10, 19)}
        selectedDate="2026-06-15"
      />,
    );
    await fireEvent(screen.getByTestId("daily-training-adjustment-chart-viewport"), "layout", {
      nativeEvent: { layout: { height: 230, width: 240, x: 0, y: 0 } },
    });
    await fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "contentSizeChange",
      600,
      230,
    );
    mockScrollTo.mockClear();
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");

    await fireEvent(scrollView, "scrollBeginDrag");
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    const chartDataBefore = getCartesianChart().props.data;

    await rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
        points={buildPoints(1, 19)}
        selectedDate="2026-06-15"
      />,
    );
    expect(getCartesianChart().props.data).toBe(chartDataBefore);
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();

    await fireEvent(scrollView, "momentumScrollBegin");
    await rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        onSelectedDateChange={onSelectedDateChange}
        points={buildPoints(1, 25)}
        selectedDate="2026-06-15"
      />,
    );
    expect(getCartesianChart().props.data).toBe(chartDataBefore);

    await fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    expect(getCartesianChart().props.data).not.toBe(chartDataBefore);
    expect(onSelectedDateChange).toHaveBeenLastCalledWith("2026-06-12");
    expect(screen.getByText("2026-06-12")).toBeTruthy();
    expect(screen.queryByTestId("daily-training-adjustment-chart-bucket-2026-06-05")).toBeNull();
    expect(
      screen.container.queryAll(
        (node) => node.props.testID === "daily-training-adjustment-chart-bucket-2026-06-12",
      )[0],
    ).toBeTruthy();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("refreshes trend paths immediately when grouping changes during an interaction", async () => {
    const { rerender } = await render(
      <DailyTrainingAdjustmentChart
        fitRange
        points={[
          { date: "2026-06-01", fitnessCtl: 30 },
          { date: "2026-06-02", fitnessCtl: 31 },
        ]}
        range="daily"
        selectedDate="2026-06-01"
        visibleTrends={["fitness"]}
      />,
    );
    await fireEvent(
      screen.getByTestId("daily-training-adjustment-chart-scroll"),
      "scrollBeginDrag",
    );

    await rerender(
      <DailyTrainingAdjustmentChart
        fitRange
        points={[
          {
            bucketEndDate: "2026-06-07",
            bucketStartDate: "2026-06-01",
            date: "2026-06-01",
            fitnessCtl: 90,
          },
        ]}
        range="weekly"
        selectedDate="2026-06-01"
        visibleTrends={["fitness"]}
      />,
    );

    expect(getCartesianChart().props.data).toHaveLength(1);
    expect(getCartesianChart().props.data[0]).toMatchObject({ fitness: 90 });
  });
});
