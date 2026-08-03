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
  TrainingPlanEventCard: ({ onPress, testID }: { onPress?: () => void; testID: string }) =>
    React.createElement("Pressable", { onPress, testID }),
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
  it("exposes assigned activity actions in a non-wrapping grid", () => {
    const onDuplicate = jest.fn();
    const onMoveByDays = jest.fn();
    const onRemove = jest.fn();

    renderNative(
      <TrainingPlanBuilderEventCard
        event={session}
        onDuplicate={onDuplicate}
        onEdit={jest.fn()}
        onMoveByDays={onMoveByDays}
        onRemove={onRemove}
      />,
    );

    fireEvent.press(screen.getByLabelText("Duplicate"));
    fireEvent.press(screen.getByLabelText("Move later"));
    fireEvent.press(screen.getByLabelText("Remove"));

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

  it("uses checked radio semantics and full weekday labels in the session editor", () => {
    renderNative(
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
});
