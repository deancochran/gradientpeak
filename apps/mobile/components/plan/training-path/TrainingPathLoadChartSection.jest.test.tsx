import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { createElement } from "react";
import { TrainingPathLoadChartSection } from "./TrainingPathLoadChartSection";

const mockDailyChartProps: Array<Record<string, unknown>> = [];

jest.mock("./DailyTrainingAdjustmentChart", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    DailyTrainingAdjustmentChart: (props: { testID?: string }) => {
      mockDailyChartProps.push(props);
      return ReactRuntime.createElement("View", { testID: props.testID });
    },
  };
});

jest.mock("./TrainingPathChart", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    TrainingPathChart: () =>
      ReactRuntime.createElement("View", { testID: "weekly-training-path-chart" }),
  };
});

jest.mock("@/components/shared/AppFormModal", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    AppFormModal: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      ReactRuntime.createElement("View", { testID }, children),
  };
});

describe("TrainingPathLoadChartSection", () => {
  beforeEach(() => {
    mockDailyChartProps.length = 0;
  });

  it("keeps an existing chart mounted while a wider date range loads", () => {
    const props = {
      dailyPoints: [
        {
          date: "2026-06-02",
          effectiveLoadStatus: "complete" as const,
          effectiveRemainingLoad: 50,
        },
      ],
    };
    const { rerender } = render(<TrainingPathLoadChartSection {...props} />);

    expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();

    rerender(<TrainingPathLoadChartSection {...props} loading />);

    expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();
    expect(screen.queryByText("Loading training path…")).toBeNull();
  });

  it("renders chartable daily data instead of a no-goal state", () => {
    const emptyModel = {
      domains: { fitness: [0, 1] as [number, number], load: [0, 1] as [number, number] },
      emptyState: "noGoal" as const,
      goalMarkers: [],
      selectedWeekSummary: null,
      todayKey: "2026-07-18",
      weeks: [],
    };

    render(
      <TrainingPathLoadChartSection
        dailyPoints={[{ date: "2026-06-02", effectiveCompletedLoad: 42 }]}
        model={emptyModel}
        onCreateGoal={jest.fn()}
      />,
    );

    expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();
    expect(screen.queryByTestId("training-path-empty-state")).toBeNull();
    expect(screen.queryByText("Add goal")).toBeNull();
  });

  it("keeps the no-goal action when date buckets contain no chartable data", () => {
    const emptyModel = {
      domains: { fitness: [0, 1] as [number, number], load: [0, 1] as [number, number] },
      emptyState: "noGoal" as const,
      goalMarkers: [],
      selectedWeekSummary: null,
      todayKey: "2026-07-18",
      weeks: [],
    };

    render(
      <TrainingPathLoadChartSection
        dailyPoints={[{ date: "2026-06-02" }]}
        model={emptyModel}
        onCreateGoal={jest.fn()}
      />,
    );

    expect(screen.getByTestId("training-path-empty-state")).toBeTruthy();
    expect(screen.getByText("Add goal")).toBeTruthy();
    expect(screen.queryByTestId("training-path-daily-adjustment-chart")).toBeNull();
  });

  it("does not let a legacy weekly target suppress the no-goal state", () => {
    const emptyModel = {
      domains: { fitness: [0, 1] as [number, number], load: [0, 1] as [number, number] },
      emptyState: "noGoal" as const,
      goalMarkers: [],
      selectedWeekSummary: null,
      todayKey: "2026-07-18",
      weeks: [
        {
          weekStart: "2026-07-13",
          weekEnd: "2026-07-19",
          label: "Jul 13",
          completedLoad: null,
          plannedLoad: null,
          targetLoad: 500,
          fitness: null,
          scheduledFitness: null,
          targetFitness: null,
          fatigue: null,
          form: null,
          riskZone: null,
          isCurrent: true,
          isSelected: true,
        },
      ],
    };

    render(
      <TrainingPathLoadChartSection
        model={emptyModel}
        onCreateGoal={jest.fn()}
        onSelectedWeekChange={jest.fn()}
      />,
    );

    expect(screen.getByText("Add goal")).toBeTruthy();
    expect(screen.queryByTestId("weekly-training-path-chart")).toBeNull();
  });

  it("prefers an explicit unavailable state over the model empty state", () => {
    const emptyModel = {
      domains: { fitness: [0, 1] as [number, number], load: [0, 1] as [number, number] },
      emptyState: "noGoal" as const,
      goalMarkers: [],
      selectedWeekSummary: null,
      todayKey: "2026-07-18",
      weeks: [],
    };

    render(
      <TrainingPathLoadChartSection
        emptyState={{
          body: "Check your connection and try again.",
          title: "Error loading plan information",
          tone: "unavailable",
        }}
        model={emptyModel}
      />,
    );

    expect(screen.getByText("Error loading plan information")).toBeTruthy();
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
    expect(screen.queryByText("Add goal")).toBeNull();
    expect(screen.queryByTestId("weekly-training-path-chart")).toBeNull();
  });

  it("renders only the range selector and factual chart legend", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[
          { date: "2026-06-02", effectiveLoadStatus: "complete", effectiveRemainingLoad: 50 },
        ]}
      />,
    );

    expect(screen.getByTestId("training-path-primary-legend")).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.getAllByText("Actual fitness").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Planned fitness projection")).toBeTruthy();
    expect(screen.getAllByText("Actual fatigue").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Planned fatigue projection")).toBeTruthy();
    expect(screen.queryByTestId("training-path-metric-dropdown-trigger")).toBeNull();
    expect(screen.queryByText("Intensity")).toBeNull();
    expect(
      screen.getByTestId("training-path-range-dropdown-daily").props.accessibilityState,
    ).toEqual({ disabled: false, selected: true });
    expect(screen.getByTestId("training-path-range-dropdown-trigger")).toHaveTextContent(
      "Daily Training",
    );

    const helpButton = screen.getByTestId("training-path-legend-button");
    expect(helpButton.props.className).toContain("h-11 w-11");
    expect(screen.queryByTestId("training-path-settings-button")).toBeNull();

    fireEvent.press(helpButton);
    expect(screen.getByTestId("training-path-legend-modal")).toBeTruthy();
    expect(screen.getAllByText("Actual fitness")).toHaveLength(3);
    expect(screen.getAllByText("Planned fitness projection")).toHaveLength(2);
    expect(screen.queryByText("Recommended projection")).toBeNull();
  });

  it("aggregates only the loaded bounded window when the range changes", () => {
    const onViewDetails = jest.fn();
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[
          {
            date: "2026-06-29",
            effectiveLoadStatus: "complete",
            effectiveCompletedLoad: 10,
            effectiveRemainingLoad: 20,
            plannedLoad: 30,
          },
          {
            date: "2026-07-01",
            effectiveLoadStatus: "complete",
            effectiveCompletedLoad: 5,
            effectiveRemainingLoad: 15,
          },
        ]}
        onViewDetails={onViewDetails}
      />,
    );

    fireEvent.press(screen.getByTestId("training-path-range-dropdown-weekly"));
    expect(mockDailyChartProps.at(-1)).toMatchObject({
      range: "weekly",
      points: [expect.objectContaining({ date: "2026-06-29", effectiveCompletedLoad: 15 })],
    });

    fireEvent.press(screen.getByTestId("training-path-range-dropdown-monthly"));
    expect(mockDailyChartProps.at(-1)).toMatchObject({
      range: "monthly",
      points: [
        expect.objectContaining({ date: "2026-06-01", effectiveCompletedLoad: 10 }),
        expect.objectContaining({ date: "2026-07-01", effectiveCompletedLoad: 5 }),
      ],
    });
    expect(screen.getByText("Monthly totals use the loaded, bounded Plan window.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("training-path-view-details"));
    expect(onViewDetails).toHaveBeenCalledWith({ period: "month", anchorDate: "2026-06-01" });
  });

  it("maps a controlled persisted range to the selected ledger period and factual summary", () => {
    const onViewDetails = jest.fn();
    const onChartRangeChange = jest.fn();
    render(
      <TrainingPathLoadChartSection
        chartRange="weekly"
        dailyPoints={[
          {
            date: "2026-06-29",
            effectiveLoadStatus: "partial",
            effectiveCompletedLoad: 10,
            effectiveRemainingLoad: 20,
            plannedLoad: 30,
            fitnessCtl: 40,
            scheduledFitnessCtl: 42,
            actualFatigueAtl: 44,
            scheduledFatigueAtl: 46,
          },
        ]}
        onChartRangeChange={onChartRangeChange}
        onViewDetails={onViewDetails}
      />,
    );

    expect(screen.getByTestId("training-path-range-dropdown-trigger")).toHaveTextContent(
      "Weekly Training",
    );
    expect(screen.getByTestId("training-path-period-summary")).toBeTruthy();
    expect(screen.getByText("Week · Jun 29")).toBeTruthy();
    expect(screen.queryByText("Partial data")).toBeNull();
    expect(screen.getByLabelText("Completed load: 10")).toBeTruthy();
    expect(screen.getByLabelText("Planned load: 30")).toBeTruthy();
    fireEvent.press(screen.getByTestId("training-path-view-details"));
    expect(onViewDetails).toHaveBeenCalledWith({ period: "week", anchorDate: "2026-06-29" });
    fireEvent.press(screen.getByTestId("training-path-range-dropdown-monthly"));
    expect(onChartRangeChange).toHaveBeenCalledWith("monthly");
  });

  it("keeps the compact selected-period indicator visible above View details", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[
          {
            date: "2026-06-29",
            effectiveLoadStatus: "complete",
            effectiveCompletedLoad: 10,
            effectiveRemainingLoad: 20,
          },
        ]}
        onViewDetails={jest.fn()}
        selectedDate="2026-06-29"
        showSelectedPointTray={false}
      />,
    );

    expect(mockDailyChartProps.at(-1)).toMatchObject({ showSelectedPointTray: false });
    expect(screen.getByTestId("training-path-period-summary")).toBeTruthy();
    expect(screen.getByTestId("training-path-view-details")).toBeTruthy();
  });

  it("keeps the legend behind the Help button when inline legend space is disabled", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[{ date: "2026-06-29", effectiveRemainingLoad: 20 }]}
        showInlineLegend={false}
      />,
    );

    expect(screen.queryByTestId("training-path-primary-legend")).toBeNull();
    fireEvent.press(screen.getByTestId("training-path-legend-button"));
    expect(screen.getByTestId("training-path-legend-modal")).toBeTruthy();
  });

  it("does not render the Plan activity/event feed beneath the analytical chart", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[{ date: "2026-06-02", effectiveRemainingLoad: 20 }]}
        renderBelowChart={() => createElement("Text", null, "Activity and event feed")}
      />,
    );

    expect(screen.queryByText("Activity and event feed")).toBeNull();
  });

  it("never renders recommendation layers for goal-backed data", () => {
    const modelWithoutGoal = {
      domains: { fitness: [0, 100] as [number, number], load: [0, 100] as [number, number] },
      emptyState: null,
      goalMarkers: [],
      selectedWeekSummary: null,
      todayKey: "2026-06-29",
      weeks: [],
    };
    const modelWithGoal = {
      ...modelWithoutGoal,
      goalMarkers: [
        { id: "goal-1", label: "Race", targetDate: "2026-07-01", weekStart: "2026-06-29" },
      ],
    };
    const dailyPoints = [
      {
        date: "2026-06-29",
        effectiveRemainingLoad: 20,
        recommendedLoadStatus: "complete" as const,
        recommendedLoad: 30,
        targetFitnessCtl: 42,
      },
    ];
    const { rerender } = render(
      <TrainingPathLoadChartSection dailyPoints={dailyPoints} model={modelWithoutGoal} />,
    );

    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.queryByText("Recommended projection")).toBeNull();
    expect(mockDailyChartProps.at(-1)).not.toHaveProperty("showRecommendedProjection");

    rerender(<TrainingPathLoadChartSection dailyPoints={dailyPoints} model={modelWithGoal} />);

    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.queryByText("Recommended projection")).toBeNull();
    expect(mockDailyChartProps.at(-1)).not.toHaveProperty("showRecommendedProjection");
  });
});
