import type { ActivityPlanIntervalStep } from "@repo/core";
import { createElement } from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepEditSheet } from "./StepEditSheet";

jest.mock("@/components/shared/AppFormModal", () => ({
  AppConfirmModal: () => null,
  AppFormModal: ({
    children,
    primaryAction,
  }: {
    children: React.ReactNode;
    primaryAction: React.ReactNode;
  }) => createElement("AppFormModal", null, children, primaryAction),
}));

const step: ActivityPlanIntervalStep = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Main set",
  description: "Legacy description",
  notes: "Existing instructions",
  duration: { type: "time", seconds: 60 },
  targets: [{ type: "RPE", intensity: 5 }],
};

describe("StepEditSheet", () => {
  it("uses one instructions input and clears legacy text without changing duration", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditSheet
        isVisible
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onDuplicate={jest.fn()}
        onSave={onSave}
        step={step}
        stepIndex={0}
      />,
    );

    expect(screen.getByLabelText("Instructions").props.value).toBe(
      "Existing instructions\n\nDescription:\nLegacy description",
    );
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByLabelText("Notes")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Instructions"), "");
    await fireEvent.press(screen.getByTestId("step-edit-sheet-save-button"));

    const [savedStep] = onSave.mock.calls[0] ?? [];
    expect(savedStep).toMatchObject({
      duration: { type: "time", seconds: 60 },
      notes: undefined,
    });
    expect(savedStep).not.toHaveProperty("description");
  });
});
