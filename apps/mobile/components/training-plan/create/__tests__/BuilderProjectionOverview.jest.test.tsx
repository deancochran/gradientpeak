import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
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
        weekEnd: "2026-07-26",
        weekStart: "2026-07-20",
      },
    ],
  },
} as unknown as ComponentProps<typeof BuilderProjectionOverview>["chartReview"];

describe("BuilderProjectionOverview", () => {
  it("shows a compact accessible outcome and opens the full chart explicitly", async () => {
    await render(<BuilderProjectionOverview chartReview={chartReview} />);

    expect(screen.getByText("Fitness 40 → 48")).toBeTruthy();
    expect(screen.getByText("240 Load/wk")).toBeTruthy();
    expect(screen.getByText("Summer race · 2026-09-12")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-summary").props.accessibilityLabel).toContain(
      "Peak planned load 240 Load per week",
    );
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Review full training projection"));
    expect(screen.getByTestId("builder-projection-modal")).toBeTruthy();
    expect(screen.getByTestId("full-builder-training-path")).toBeTruthy();

    await fireEvent.press(screen.getByText("Close projection"));
    expect(screen.queryByTestId("builder-projection-modal")).toBeNull();
  });

  it("leads the strategy composer with inline details instead of projection", async () => {
    const props = {
      chartReview,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddActivity: jest.fn(),
      onUpdateDetails: jest.fn(),
      onUpdateVisibility: jest.fn(),
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

    await render(<BuilderStrategyComposer {...props} />);

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    expect(screen.queryByTestId("builder-projection-overview")).toBeNull();
    expect(screen.getByLabelText("Plan name").props.value).toBe("Summer build");
    expect(screen.getByLabelText("Description").props.value).toBe("Base block");
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Renamed plan");
    expect(props.onUpdateDetails).toHaveBeenCalledWith({
      name: "Renamed plan",
      description: "Base block",
    });
    await fireEvent.changeText(screen.getByLabelText("Description"), "");
    expect(props.onUpdateDetails).toHaveBeenLastCalledWith({
      name: "Renamed plan",
      description: "",
    });
  });

  it("retains advanced readiness and actions for existing plan editing", async () => {
    const onAddActivity = jest.fn();
    const props = {
      chartReview,
      showEditConfiguration: true,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddActivity,
      onUpdateDetails: jest.fn(),
      onUpdateVisibility: jest.fn(),
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

    const { rerender } = await render(<BuilderStrategyComposer {...props} />);

    expect(screen.queryByTestId("builder-configuration-grid")).toBeNull();
    expect(screen.getByText("Athlete")).toBeTruthy();
    expect(screen.getByText("Goals")).toBeTruthy();
    expect(screen.getByText("Preferences")).toBeTruthy();
    expect(screen.getByTestId("builder-readiness")).toBeTruthy();
    expect(screen.getByText("Review plan")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add activity"));

    expect(onAddActivity).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Schedule preview")).toBeNull();

    await rerender(
      <BuilderStrategyComposer
        {...props}
        state={{
          ...props.state,
          structure: {
            sessions: [
              {
                activityPlan: null,
                id: "00000000-0000-4000-8000-000000000020",
                localId: "00000000-0000-4000-8000-000000000020",
                offsetDays: 0,
                demand: {
                  activity_category: "other",
                  training_intent: "general_maintenance",
                  target_duration_minutes: null,
                  target_common_load: null,
                  importance: "normal",
                },
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Review plan")).toBeTruthy();
    expect(screen.getByTestId("builder-add-activity").props.className).toContain("w-full");

    await rerender(
      <BuilderStrategyComposer
        {...props}
        state={{
          ...props.state,
          structure: {
            sessions: [
              {
                activityPlan: {
                  accessible: true,
                  id: "activity-1",
                  name: "Activity",
                  prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
                    load: 50,
                  }),
                  published: true,
                },
                id: "00000000-0000-4000-8000-000000000020",
                localId: "00000000-0000-4000-8000-000000000020",
                offsetDays: 0,
                demand: {
                  activity_category: "other",
                  training_intent: "general_maintenance",
                  target_duration_minutes: null,
                  target_common_load: null,
                  importance: "normal",
                },
              },
            ],
          },
        }}
      />,
    );

    await fireEvent.press(screen.getByText("Add activity"));
    expect(onAddActivity).toHaveBeenCalledTimes(2);
  });
});
