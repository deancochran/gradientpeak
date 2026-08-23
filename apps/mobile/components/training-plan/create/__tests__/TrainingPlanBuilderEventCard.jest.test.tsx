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
    testID,
  }: {
    metrics: Array<{ label: string; value: string }>;
    onPress?: () => void;
    testID: string;
  }) =>
    React.createElement(
      "Pressable",
      { onPress, testID },
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
  localId: "session-1",
  offsetDays: 0,
};

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
    expect(screen.getByText("Common Load: Partial")).toBeTruthy();
    expect(screen.getByText("Normalized intensity: Partial")).toBeTruthy();
    expect(screen.queryByText(/^Duration: 0m$/)).toBeNull();
    expect(screen.queryByText(/^Common Load: 0$/)).toBeNull();
    expect(screen.queryByText(/^Normalized intensity: 0\.00$/)).toBeNull();
  });

  it("does not revive missing canonical estimates from session intent", async () => {
    await renderNative(
      <TrainingPlanBuilderEventCard
        event={{
          ...session,
          intent: {
            type: "threshold",
            driver: "completion-duration",
            targetDurationSeconds: 3_600,
            targetLoad: 88,
          },
        }}
        estimate={null}
        onDuplicate={jest.fn()}
        onEdit={jest.fn()}
        onMoveByDays={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Duration: Unavailable")).toBeTruthy();
    expect(screen.getByText("Common Load: Unavailable")).toBeTruthy();
    expect(screen.getByText("Normalized intensity: Unavailable")).toBeTruthy();
    expect(screen.queryByText(/^Duration: 0m$/)).toBeNull();
    expect(screen.queryByText(/^Common Load: 0$/)).toBeNull();
    expect(screen.queryByText(/^Normalized intensity: 0\.00$/)).toBeNull();
    expect(screen.queryByText(/60m|88|0\.90/)).toBeNull();
  });
});
