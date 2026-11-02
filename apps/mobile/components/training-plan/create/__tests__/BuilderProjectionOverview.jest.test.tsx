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

  it("is the projection surface rendered by the production strategy composer", async () => {
    const props = {
      chartReview,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddActivity: jest.fn(),
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

    expect(screen.getByTestId("builder-strategy-composer")).toBeTruthy();
    expect(screen.getByTestId("builder-projection-overview")).toBeTruthy();
    expect(screen.getByTestId("builder-edit-plan").props.accessibilityLabel).toContain(
      "Current name: Summer build. Current description: Base block.",
    );
    expect(screen.queryByTestId("full-builder-training-path")).toBeNull();

    await rerender(
      <BuilderStrategyComposer
        {...props}
        state={{ ...props.state, details: { ...props.state.details, description: "", name: "" } }}
      />,
    );
    expect(screen.getByTestId("builder-edit-plan").props.accessibilityLabel).toContain(
      "Current name: No name set. Current description: No description set.",
    );
  });

  it("keeps schedule setup visible and wires its primary actions", async () => {
    const onAddActivity = jest.fn();
    const props = {
      chartReview,
      saveReadiness: { detail: "Ready to review", label: "Review plan", status: "review" },
      onAddActivity,
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

    expect(screen.getByText("Needs assignment")).toBeTruthy();
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

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });
});
