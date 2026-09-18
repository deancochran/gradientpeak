import {
  type ActivityPlanPlanningEstimate,
  type ActivityPrescriptionQuantificationBundle,
  createUnavailableActivityPlanPlanningEstimate,
} from "@repo/core";
import React from "react";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import {
  TrainingPlanBuilderEventCard,
  TrainingPlanBuilderEventEditor,
} from "../TrainingPlanBuilderEventCard";

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: { children: React.ReactNode }) => children,
  FormTextField: () => null,
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("Text", props, children),
}));
jest.mock("@repo/ui/hooks", () => ({
  __esModule: true,
  useZodForm: () => ({ control: {} }),
  useInputDraft: (value: string) => [value, jest.fn()],
}));
jest.mock("react-hook-form", () => ({ useWatch: () => "" }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronLeft: () => null,
  ChevronRight: () => null,
}));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: () => null,
}));
jest.mock("@/components/training-plan/TrainingPlanEventCard", () => ({
  __esModule: true,
  TrainingPlanEventCard: ({
    metrics,
    onPress,
    subtitle,
    testID,
  }: {
    metrics: Array<{ label: string; value: string }>;
    onPress?: () => void;
    subtitle?: string | null;
    testID: string;
  }) =>
    React.createElement(
      "Pressable",
      { onPress, testID },
      subtitle ? React.createElement("Text", { key: "subtitle" }, `Meta: ${subtitle}`) : null,
      metrics.map((metric) =>
        React.createElement("Text", { key: metric.label }, `${metric.label}: ${metric.value}`),
      ),
    ),
}));

const session = {
  activityPlan: {
    accessible: true,
    id: "activity-1",
    name: "Intervals",
    prescriptionQuantification: createPrescriptionQuantificationBundleFixture(),
    published: true,
  },
  id: "00000000-0000-4000-8000-000000000030",
  localId: "session-1",
  offsetDays: 0,
  demand: {
    activity_category: "other" as const,
    training_intent: "general_maintenance" as const,
    target_duration_minutes: null,
    target_common_load: null,
    importance: "normal" as const,
  },
};

function withEstimatedDuration(
  quantification: ActivityPrescriptionQuantificationBundle,
): ActivityPrescriptionQuantificationBundle {
  const copy = structuredClone(quantification);
  const firstMember = copy.members[0];
  if (!firstMember) throw new Error("Expected a prescription quantification member");
  firstMember.duration.elapsed.evidenceRole = "estimated";
  return copy;
}

function withObjectiveIntensity(
  quantification: ActivityPrescriptionQuantificationBundle,
  value: number,
): ActivityPlanPlanningEstimate {
  const estimate = createUnavailableActivityPlanPlanningEstimate({
    activityCategory: "run",
    asOf: "2026-07-21T12:00:00.000Z",
    planId: "11111111-1111-4111-8111-111111111111",
    scheduledEventId: "session-1",
    stage: "scheduled",
  });
  if (!estimate.planProjection) throw new Error("Expected an unavailable plan projection");
  return {
    ...estimate,
    prescriptionQuantification: quantification,
    planProjection: {
      ...estimate.planProjection,
      objectiveIntensity: {
        status: "available",
        value,
        unit: "ratio",
        reason: null,
        completionPolicy: "time",
        weightingBasis: "duration_seconds",
        contributorCoverage: { contributing: 1, total: 1 },
        provenance: "plan_intent",
        basis: "compiled_occurrences",
      },
    },
  };
}

describe("TrainingPlanBuilderEventCard actions", () => {
  it("exposes assigned activity actions in a non-wrapping grid", async () => {
    const onDuplicate = jest.fn();
    const onMoveByDays = jest.fn();
    const onRemove = jest.fn();

    await renderNative(
      <TrainingPlanBuilderEventCard
        event={session}
        onDuplicate={onDuplicate}
        onEdit={jest.fn()}
        onMoveByDays={onMoveByDays}
        onRemove={onRemove}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Duplicate"));
    await fireEvent.press(screen.getByLabelText("Move later"));
    await fireEvent.press(screen.getByLabelText("Remove"));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onMoveByDays).toHaveBeenCalledWith(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Move earlier").props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(screen.getByTestId("builder-activity-actions-session-1").props.className).not.toContain(
      "flex-wrap",
    );
  });

  it("uses checked radio semantics and full weekday labels in the session editor", async () => {
    await renderNative(
      <TrainingPlanBuilderEventEditor
        event={session}
        onChange={jest.fn()}
        onDuplicate={jest.fn()}
        onOpenActivityPicker={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Monday").props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByLabelText("Tuesday").props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByLabelText("No time").props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByLabelText("Activity day").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getByLabelText("Activity time").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getByLabelText("Move earlier").props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it("keeps exact authored values unmarked and marks complete calculated values", async () => {
    const quantification = createPrescriptionQuantificationBundleFixture({ estimated: false });
    await renderNative(
      <TrainingPlanBuilderEventCard
        event={{
          ...session,
          activityPlan: { ...session.activityPlan, prescriptionQuantification: quantification },
        }}
        estimate={withObjectiveIntensity(quantification, 2_439 / 3_500)}
        onDuplicate={jest.fn()}
        onEdit={jest.fn()}
        onMoveByDays={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Duration: 1h")).toBeTruthy();
    expect(screen.getByText("Common Load: ~64")).toBeTruthy();
    expect(screen.getByText("Intensity: ~0.70")).toBeTruthy();
    expect(screen.getByText("Meta: 1h · Common Load ~64")).toBeTruthy();
  });

  it("marks a complete estimated duration", async () => {
    const quantification = withEstimatedDuration(
      createPrescriptionQuantificationBundleFixture({ estimated: false }),
    );
    await renderNative(
      <TrainingPlanBuilderEventCard
        event={{
          ...session,
          activityPlan: { ...session.activityPlan, prescriptionQuantification: quantification },
        }}
        onDuplicate={jest.fn()}
        onEdit={jest.fn()}
        onMoveByDays={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Duration: ~1h")).toBeTruthy();
    expect(screen.getByText("Common Load: ~64")).toBeTruthy();
    expect(screen.getByText("Intensity: —")).toBeTruthy();
    expect(screen.getByText("Meta: ~1h · Common Load ~64")).toBeTruthy();
  });

  it("renders partial planned estimates without substituting zero metrics", async () => {
    await renderNative(
      <TrainingPlanBuilderEventCard
        event={{
          ...session,
          activityPlan: {
            ...session.activityPlan,
            prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
              status: "partial",
            }),
          },
        }}
        onDuplicate={jest.fn()}
        onEdit={jest.fn()}
        onMoveByDays={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Duration: 1h")).toBeTruthy();
    expect(screen.getByText("Common Load: —")).toBeTruthy();
    expect(screen.getByText("Intensity: —")).toBeTruthy();
    expect(screen.queryByText(/^Duration: 0m$/)).toBeNull();
    expect(screen.queryByText(/^Common Load: 0$/)).toBeNull();
    expect(screen.queryByText(/^Common Load: ~32$/)).toBeNull();
    expect(screen.queryByText(/^Intensity: ~0\.80$/)).toBeNull();
  });

  it("does not revive missing canonical estimates from session demand", async () => {
    await renderNative(
      <TrainingPlanBuilderEventCard
        event={{
          ...session,
          demand: {
            activity_category: "bike",
            training_intent: "threshold_development",
            target_duration_minutes: 60,
            target_common_load: 88,
            importance: "normal",
          },
        }}
        estimate={null}
        onDuplicate={jest.fn()}
        onEdit={jest.fn()}
        onMoveByDays={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Duration: —")).toBeTruthy();
    expect(screen.getByText("Common Load: —")).toBeTruthy();
    expect(screen.getByText("Intensity: —")).toBeTruthy();
    expect(screen.queryByText(/^Duration: 0m$/)).toBeNull();
    expect(screen.queryByText(/^Common Load: 0$/)).toBeNull();
    expect(screen.queryByText(/^Intensity: 0\.00$/)).toBeNull();
    expect(screen.queryByText(/60m|88|0\.90/)).toBeNull();
  });
});
