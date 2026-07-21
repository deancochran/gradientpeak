import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { TrainingPathLoadChartSection } from "./TrainingPathLoadChartSection";

jest.mock("./DailyTrainingAdjustmentChart", () => {
  const ReactRuntime = jest.requireActual("react") as typeof React;
  return {
    DailyTrainingAdjustmentChart: ({ testID }: { testID?: string }) =>
      ReactRuntime.createElement("View", { testID }),
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
  it("keeps an existing chart mounted while a wider date range loads", () => {
    const props = {
      dailyPoints: [{ date: "2026-06-02", targetLoadTss: 50 }],
    };
    const { rerender } = render(<TrainingPathLoadChartSection {...props} />);

    expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();

    rerender(<TrainingPathLoadChartSection {...props} loading />);

    expect(screen.getByTestId("training-path-daily-adjustment-chart")).toBeTruthy();
    expect(screen.queryByText("Loading training path…")).toBeNull();
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

  it("keeps the primary legend visible and exposes 44-point chart controls", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[{ date: "2026-06-02", targetLoadTss: 50 }]}
        onOpenSettings={jest.fn()}
      />,
    );

    expect(screen.getByTestId("training-path-primary-legend")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.queryByText("Completed, load unavailable")).toBeNull();
    expect(screen.queryByText("Actual fitness")).toBeNull();

    const helpButton = screen.getByTestId("training-path-legend-button");
    const settingsButton = screen.getByTestId("training-path-settings-button");
    expect(helpButton.props.className).toContain("h-11 w-11");
    expect(settingsButton.props.className).toContain("h-11 w-11");

    fireEvent.press(helpButton);
    expect(screen.getByTestId("training-path-legend-modal")).toBeTruthy();
    expect(screen.getByText("Completed, load unavailable")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getByText("Actual fitness")).toBeTruthy();
    expect(screen.getByText("Projected fitness")).toBeTruthy();
    expect(screen.getByText("Target fitness")).toBeTruthy();
    expect(screen.getByText("Selected day")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByText("Goal")).toBeNull();
  });

  it("explains an unavailable completed load beside the chart when it is present", () => {
    render(
      <TrainingPathLoadChartSection
        dailyPoints={[
          {
            date: "2026-06-02",
            targetLoadTss: 50,
            hasCompletedActivityWithoutLoad: true,
          },
        ]}
      />,
    );

    expect(screen.getByText("Completed, load unavailable")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
  });
});
