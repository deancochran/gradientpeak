import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";
import { BuilderProjectionOverview } from "../BuilderProjectionOverview";
import { BuilderStrategyComposer } from "../BuilderStrategyComposer";

jest.mock("@/components/shared/AppFormModal", () => ({
  AppFormModal: ({
    children,
    onClose,
    testID,
  }: ComponentProps<typeof View> & { onClose: () => void }) => (
    <View testID={testID}>
      <Text onPress={onClose}>Close projection</Text>
      {children}
    </View>
  ),
}));

jest.mock("../BuilderTrainingPathReviewSection", () => ({
  BuilderTrainingPathReviewSection: () => <View testID="full-builder-training-path" />,
}));

const chartReview = {
  chart: {
    dailyPoints: [],
    domains: { fitness: [0, 80], load: [0, 300] },
    emptyState: null,
    goalMarkers: [
      {
        id: "goal-1",
        label: "Summer race",
        targetDate: "2026-09-12",
        weekStart: "2026-09-07",
      },
    ],
    selectedWeekSummary: null,
    todayKey: "2026-07-18",
    weeks: [
      {
        completedLoad: 100,
        fatigue: null,
        fitness: 40,
        form: null,
        isCurrent: true,
        isSelected: true,
        label: "Jul 13",
        plannedLoad: 180,
        riskZone: null,
        scheduledFitness: 42,
        targetFitness: 43,
        targetLoad: 200,
        tentativePlannedLoad: 20,
        weekEnd: "2026-07-19",
        weekStart: "2026-07-13",
      },
      {
        completedLoad: null,
        fatigue: null,
        fitness: null,
        form: null,
        isCurrent: false,
        isSelected: false,
        label: "Jul 20",
        plannedLoad: 240,
        riskZone: null,
        scheduledFitness: 48,
        targetFitness: 49,
        targetLoad: 260,
        tentativePlannedLoad: 0,
        weekEnd: "2026-07-26",
        weekStart: "2026-07-20",
      },
    ],
  },
} as unknown as ComponentProps<typeof BuilderProjectionOverview>["chartReview"];

describe("BuilderProjectionOverview", () => {
  it("shows a compact accessible outcome and opens the full chart explicitly", () => {
    render(<BuilderProjectionOverview chartReview={chartReview} />);

    expect(screen.getByText("Fitness 40 → 48")).toBeTruthy();
    expect(screen.getByText("240 Load/wk")).toBeTruthy();
    expect(screen.getByText("Summer race · 2026-09-12")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-summary").props.accessibilityLabel).toContain(
      "Peak planned load 240 Load per week",
    );
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    fireEvent.press(screen.getByLabelText("Review full training projection"));
    expect(screen.getByTestId("builder-projection-modal")).toBeTruthy();
    expect(screen.getByTestId("full-builder-training-path")).toBeTruthy();

    fireEvent.press(screen.getByText("Close projection"));
    expect(screen.queryByTestId("builder-projection-modal")).toBeNull();
  });

  it("is the projection surface rendered by the production strategy composer", () => {
    const props = {
      chartReview,
      canUseStructureProposal: true,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddWorkout: jest.fn(),
      onApplyStructureProposal: jest.fn(),
      onOpenSchedulePreview: jest.fn(),
      planningBriefRows: [
        {
          key: "athleteContext",
          label: "Athlete context",
          value: "Using current profile defaults",
          detail: "",
        },
        { key: "goals", label: "Plan goals", value: "No goals selected", detail: "" },
        {
          key: "planningConstraints",
          label: "Preferences",
          value: "No constraints selected",
          detail: "",
        },
        { key: "schedulePreview", label: "Schedule", value: "Any day", detail: "" },
      ],
      state: {
        details: { description: "Base block", name: "Summer build" },
        structure: { sessions: [] },
      },
    } as unknown as ComponentProps<typeof BuilderStrategyComposer>;

    const { rerender } = render(<BuilderStrategyComposer {...props} />);

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-overview")).toBeTruthy();
    expect(screen.getByTestId("builder-edit-plan").props.accessibilityLabel).toContain(
      "Current name: Summer build. Current description: Base block.",
    );
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    rerender(
      <BuilderStrategyComposer
        {...props}
        state={{ ...props.state, details: { ...props.state.details, description: "", name: "" } }}
      />,
    );
    expect(screen.getByTestId("builder-edit-plan").props.accessibilityLabel).toContain(
      "Current name: No name set. Current description: No description set.",
    );
  });

  it("keeps schedule setup visible and wires its primary actions", () => {
    const onAddWorkout = jest.fn();
    const onApplyStructureProposal = jest.fn();
    const onOpenSchedulePreview = jest.fn();
    const props = {
      chartReview,
      canUseStructureProposal: true,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddWorkout,
      onApplyStructureProposal,
      onOpenSchedulePreview,
      planningBriefRows: [
        {
          key: "athleteContext",
          label: "Athlete context",
          value: "Using current profile defaults",
          detail: "",
        },
        { key: "goals", label: "Plan goals", value: "No goals selected", detail: "" },
        {
          key: "planningConstraints",
          label: "Preferences",
          value: "No constraints selected",
          detail: "",
        },
        { key: "schedulePreview", label: "Schedule", value: "Any day", detail: "" },
      ],
      state: {
        details: { description: "Base block", name: "Summer build" },
        structure: { sessions: [] },
      },
    } as unknown as ComponentProps<typeof BuilderStrategyComposer>;

    const { rerender } = render(<BuilderStrategyComposer {...props} />);

    expect(screen.getByTestId("builder-configuration-grid")).toBeTruthy();
    expect(screen.getByTestId("builder-configuration-grid-row-1").props.className).toContain(
      "flex-row",
    );
    expect(screen.getByTestId("builder-configuration-grid-row-2").props.className).toContain(
      "flex-row",
    );
    expect(screen.getByTestId("builder-configuration-grid").props.className).not.toContain(
      "flex-wrap",
    );
    expect(screen.getByText("Athlete")).toBeTruthy();
    expect(screen.getByText("Goals")).toBeTruthy();
    expect(screen.getByText("Preferences")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getAllByText("Optional")).toHaveLength(2);
    expect(screen.getByText("Needs setup")).toBeTruthy();
    expect(screen.getByTestId("builder-status-goals").props.className).toContain(
      "bg-muted-foreground",
    );
    expect(screen.getByTestId("builder-readiness")).toBeTruthy();
    expect(screen.getByText("Review plan")).toBeTruthy();
    fireEvent.press(screen.getByText("Add workout"));
    fireEvent.press(screen.getByLabelText("Use suggested schedule"));
    fireEvent.press(screen.getByTestId("builder-configuration-schedulePreview"));

    expect(onAddWorkout).toHaveBeenCalledTimes(1);
    expect(onApplyStructureProposal).toHaveBeenCalledTimes(1);
    expect(onOpenSchedulePreview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Use schedule")).toBeTruthy();
    expect(screen.queryByText("Schedule preview")).toBeNull();

    rerender(
      <BuilderStrategyComposer
        {...props}
        canUseStructureProposal={false}
        state={{
          ...props.state,
          structure: { sessions: [{ activityPlan: null, localId: "session-1", offsetDays: 0 }] },
        }}
      />,
    );

    expect(screen.getByText("Needs assignment")).toBeTruthy();
    expect(screen.queryByLabelText("Use suggested schedule")).toBeNull();
    expect(screen.getByTestId("builder-add-workout").props.className).toContain("w-full");

    rerender(
      <BuilderStrategyComposer
        {...props}
        state={{
          ...props.state,
          structure: {
            sessions: [
              {
                activityPlan: {
                  accessible: true,
                  estimatedDurationSeconds: 3600,
                  estimatedTss: 50,
                  id: "workout-1",
                  name: "Workout",
                  published: true,
                },
                localId: "session-1",
                offsetDays: 0,
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });
});
