import type { ActivityPlanStep } from "@repo/core";
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

const step: ActivityPlanStep = {
  type: "step",
  id: "00000000-0000-4000-8000-000000000010",
  name: "Main set",
  instructions: "Existing instructions",
  duration: { type: "time", seconds: 60 },
  targets: [{ type: "RPE", intensity: 5 }],
};

describe("StepEditSheet", () => {
  it("uses one V4 instructions input and clears it without changing duration", async () => {
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

    expect(screen.getByLabelText("Instructions").props.value).toBe("Existing instructions");
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByLabelText("Notes")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Instructions"), "");
    await fireEvent.press(screen.getByTestId("step-edit-sheet-save-button"));

    const [savedStep] = onSave.mock.calls[0] ?? [];
    expect(savedStep).toMatchObject({ duration: { type: "time", seconds: 60 } });
    expect(savedStep).not.toHaveProperty("instructions");
    expect(savedStep).not.toHaveProperty("notes");
  });
});
