import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { DailyTrainingAdjustmentChart, getLoadBarGeometry } from "./DailyTrainingAdjustmentChart";
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
            completedLoadTss: 0,
            hasCompletedActivityWithoutLoad: true,
            targetLoadTss: 40,
          },
          {
            date: "2026-06-02",
            completedLoadTss: 42,
            hasCompletedActivityWithoutLoad: true,
            targetLoadTss: 40,
          },
          {
            date: "2026-06-03",
            completedLoadTss: 0,
            targetLoadTss: 40,
          },
          {
            date: "2026-06-04",
            targetLoadTss: 40,
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
          { date: "2026-06-01", targetLoadTss: 40, actualOrScheduledLoadTss: 35 },
          { date: "2026-06-02", targetLoadTss: 50, actualOrScheduledLoadTss: 65 },
        ]}
      />,
    );

    expect(screen.getByText("2026-06-02")).toBeTruthy();
    expect(screen.getByText("+15 TSS")).toBeTruthy();
  });

  it("centers the initial controlled date only after viewport and content readiness", () => {
    render(
      <DailyTrainingAdjustmentChart
        points={[
          { date: "2026-06-01", targetLoadTss: 40 },
          { date: "2026-06-02", targetLoadTss: 50 },
          { date: "2026-06-03", targetLoadTss: 60 },
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
    expect(mockScrollTo).toHaveBeenCalledWith({ animated: false, x: 60, y: 0 });
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
          { date: "2026-06-01", targetLoadTss: 40 },
          { date: "2026-06-02", targetLoadTss: 50 },
          { date: "2026-06-03", targetLoadTss: 60 },
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
          { date: "2026-06-01", targetLoadTss: 40 },
          { date: "2026-06-02", targetLoadTss: 50 },
          { date: "2026-06-03", targetLoadTss: 60 },
        ]}
      />,
    );
    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    const dragEvent = { nativeEvent: { contentOffset: { x: 31, y: 0 } } };
    const momentumEvent = { nativeEvent: { contentOffset: { x: 60, y: 0 } } };

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
          { date: "2026-06-01", targetLoadTss: 40 },
          { date: "2026-06-02", targetLoadTss: 50 },
          { date: "2026-06-03", targetLoadTss: 60 },
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
      nativeEvent: { contentOffset: { x: 60, y: 0 } },
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
          { date: "2026-06-01", targetLoadTss: 40, actualOrScheduledLoadTss: 35 },
          { date: "2026-06-02", targetLoadTss: 50, actualOrScheduledLoadTss: 65 },
          { date: "2026-06-03", targetLoadTss: 50, actualOrScheduledLoadTss: 30 },
        ]}
      />,
    );

    const scrollView = screen.getByTestId("daily-training-adjustment-chart-scroll");
    fireEvent(scrollView, "scrollBeginDrag");
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 60, y: 0 } } });

    expect(screen.getByText("2026-06-03")).toBeTruthy();
    expect(onSelectedDateChange).not.toHaveBeenCalled();

    fireEvent(scrollView, "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 60, y: 0 } },
    });

    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
  });

  it("keeps a controlled local commit selected until the parent acknowledges it", () => {
    const onSelectedDateChange = jest.fn();
    const points = [
      { date: "2026-06-01", targetLoadTss: 40 },
      { date: "2026-06-02", targetLoadTss: 50 },
      { date: "2026-06-03", targetLoadTss: 60 },
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
      nativeEvent: { contentOffset: { x: 60, y: 0 } },
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
          { date: "2026-06-01", targetLoadTss: 40 },
          { date: "2026-06-02", targetLoadTss: 50 },
          { date: "2026-06-03", targetLoadTss: 60 },
        ]}
        selectedDate="2026-06-02"
      />,
    );

    const adjustable = screen.getByLabelText("Daily training adjustment chart");
    expect(adjustable.props.accessibilityRole).toBe("adjustable");
    expect(adjustable.props.accessibilityValue).toEqual({ text: "Selected date 2026-06-02" });
    expect(adjustable.props.accessibilityHint).toBe("Adjust to select the next or previous date");

    fireEvent(adjustable, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSelectedDateChange).toHaveBeenCalledWith("2026-06-03");
    expect(screen.getByText("2026-06-03")).toBeTruthy();
  });

  it("uses one collision-safe width and center for every daily load layer", () => {
    const geometry = getLoadBarGeometry([{ x: 10 }, { x: 20 }, { x: 30 }], 1, 0, 40, 22);

    expect(geometry?.center).toBe(20);
    expect(geometry?.width).toBeCloseTo(7.2);
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

  it("keeps the chart anchored to the viewport instead of an old selected date while loading more days", () => {
    const buildPoints = (length: number) =>
      Array.from({ length }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, "0")}`,
        targetLoadTss: 50,
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
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 270, y: 0 } } });

    rerender(
      <DailyTrainingAdjustmentChart
        maxVisiblePoints={10}
        points={buildPoints(40)}
        selectedDate="2026-06-15"
      />,
    );

    expect(screen.getByText("06/23", { includeHiddenElements: true })).toBeTruthy();
  });
});
