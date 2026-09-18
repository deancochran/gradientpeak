import type { ActivityPlanIntervalStep } from "@repo/core";
import { createElement } from "react";
import { Alert } from "react-native";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { fromStepEditorTargets, StepEditorDialog, toStepEditorTargets } from "./StepEditorDialog";

jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  AppFormModal: ({
    actionPlacement,
    children,
    primaryAction,
    testID,
    onClose,
  }: {
    actionPlacement?: "footer" | "header";
    children: React.ReactNode;
    primaryAction: React.ReactNode;
    testID?: string;
    onClose: () => void;
  }) =>
    createElement("AppFormModal", { actionPlacement, testID, onClose }, children, primaryAction),
}));

const rpeStep: ActivityPlanIntervalStep = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Main set",
  purpose: "work",
  duration: { type: "time", seconds: 60 },
  notes: "Keep the optional note.",
  targets: [{ type: "RPE", intensity: 4 }],
};

describe("StepEditorDialog", () => {
  it("preserves same-step edits across a refreshed object and confirms discard", async () => {
    const close = jest.fn();
    const save = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={close}
        onSave={save}
        step={rpeStep}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Name"), "Local step");
    await view.rerender(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={close}
        onSave={save}
        step={{ ...rpeStep, name: "Refresh" }}
      />,
    );
    expect(screen.getByLabelText("Name").props.value).toBe("Local step");
    await fireEvent(screen.getByTestId("step-editor-modal"), "close");
    expect(close).not.toHaveBeenCalled();
    const choices = alert.mock.calls.at(-1)?.[2];
    expect(choices?.some((choice) => choice.text === "Keep editing")).toBe(true);
    await act(() => choices?.find((choice) => choice.text === "Discard")?.onPress?.());
    expect(close).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("blocks invalid repetition exact drafts without replacing them on blur", async () => {
    const save = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="strength"
        onOpenChange={jest.fn()}
        onSave={save}
        step={{ ...rpeStep, duration: { type: "repetitions", count: 8 } }}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Reps"), "1.5");
    await fireEvent(screen.getByLabelText("Reps"), "blur");
    expect(screen.getByLabelText("Reps").props.value).toBe("1.5");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Reps"), "9");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ duration: { type: "repetitions", count: 9 } }),
    );
  });
  it("does not infer legacy purpose and lets the user explicitly repair it", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...rpeStep, name: "Warmup", purpose: undefined }}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Choose an explicit step purpose/)).toBeTruthy();
    await fireEvent(screen.getByTestId("step-purpose"), "valueChange", {
      value: "technique",
      label: "technique",
    });
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Warmup", purpose: "technique" }),
    );
  });

  it.each([
    { type: "RPE" as const, intensity: 5.25 },
    { type: "%MaxHR" as const, intensity: 101 },
    { type: "speed" as const, intensity: 0 },
    { type: "cadence" as const, intensity: 90 },
  ])("rejects an invalid $type prescription while retaining it for correction", async (target) => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...rpeStep, duration: { type: "distance", meters: 100 }, targets: [target] }}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Target 1 value exact value").props.value).toBe(
      String(target.intensity),
    );
  });

  it("retains targets and duration when category changes while editing a draft", async () => {
    const onSave = jest.fn();
    const step: ActivityPlanIntervalStep = {
      ...rpeStep,
      targets: [{ type: "watts", intensity: 250 }],
      duration: { type: "distance", meters: 1000 },
    };
    const view = await renderNative(
      <StepEditorDialog
        open
        activityCategory="bike"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={step}
      />,
    );
    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent.changeText(screen.getByTestId("target-value-0-inline-value"), "275");
    await view.rerender(
      <StepEditorDialog
        open
        activityCategory="strength"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={step}
      />,
    );
    expect(screen.getByTestId("target-value-0-inline-value").props.value).toBe("275");
    expect(screen.getByText(/distance is not permitted/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires exactly one RPE for repetition steps and preserves extra targets until removed", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="strength"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{
          ...rpeStep,
          duration: { type: "repetitions", count: 8 },
          targets: [
            { type: "RPE", intensity: 5 },
            { type: "bpm", intensity: 120 },
          ],
        }}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("target-remove-1")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("target-remove-1"));
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [{ type: "RPE", intensity: 5 }] }),
    );
  });
  it("preserves canonical target values while editing", () => {
    expect(toStepEditorTargets([{ type: "speed", intensity: 18 }])).toEqual([
      { type: "speed", intensity: 18 },
    ]);
    expect(fromStepEditorTargets([{ type: "cadence", intensity: 90 }])).toEqual([
      { type: "cadence", intensity: 90 },
    ]);
  });

  it("saves valid duration and target exact edits without requiring blur", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        open
        step={rpeStep}
      />,
    );

    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await fireEvent.changeText(screen.getByTestId("step-duration-value-inline-value"), "5");
    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent.changeText(screen.getByTestId("target-value-0-inline-value"), "4.5");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: { type: "time", seconds: 300 },
        notes: "Keep the optional note.",
        targets: [{ type: "RPE", intensity: 4.5 }],
      }),
    );
  });

  it("keeps stored instructions collapsed until explicitly edited, then collapses and saves them", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        open
        step={rpeStep}
      />,
    );

    expect(screen.queryByPlaceholderText("Add step instructions")).toBeNull();
    await fireEvent.press(screen.getByText("Instructions: Keep the optional note."));
    expect(screen.getByDisplayValue("Keep the optional note.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Hide instructions"));
    expect(screen.queryByPlaceholderText("Add step instructions")).toBeNull();
    expect(screen.getByText("Instructions: Keep the optional note.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Keep the optional note." }),
    );
  });

  it("uses one unit-bearing target row without visible Type or Value labels", async () => {
    await renderNative(
      <StepEditorDialog
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        open
        step={rpeStep}
      />,
    );

    expect(screen.getByLabelText("Target 1 type")).toBeTruthy();
    expect(screen.getByLabelText("Target 1 value: 4 RPE")).toBeTruthy();
    expect(screen.queryAllByTestId("target-value-0-slider")).toHaveLength(0);
    expect(screen.queryByText("Type")).toBeNull();
    expect(screen.queryByText("Value")).toBeNull();
    expect(screen.queryByTestId("target-value-0-inline-value")).toBeNull();
    expect(screen.getByLabelText("Remove target 1")).toBeTruthy();
    expect(screen.queryByTestId("target-actions-0")).toBeNull();
    expect(screen.getByTestId("step-editor-modal").props.actionPlacement).toBe("header");
  });

  it("shows an existing high target value without silently changing it", async () => {
    await renderNative(
      <StepEditorDialog
        activityCategory="bike"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        open
        step={{ ...rpeStep, targets: [{ type: "watts", intensity: 2500 }] }}
      />,
    );

    expect(screen.getByLabelText("Target 1 value: 2500 watts")).toBeTruthy();
    expect(screen.queryByTestId("target-value-0-inline-value")).toBeNull();
  });

  it("blocks Done while invalid duration or target exact edits remain focused", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        open
        step={rpeStep}
      />,
    );

    await fireEvent.press(screen.getByTestId("step-duration-value-current-value"));
    await fireEvent.changeText(screen.getByTestId("step-duration-value-inline-value"), "1.001");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Finish or correct the exact value before saving.")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("step-duration-value-inline-value"), "5");
    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent.changeText(screen.getByTestId("target-value-0-inline-value"), "0");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("removes only the removed target's invalid marker", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        activityCategory="bike"
        onOpenChange={jest.fn()}
        onSave={onSave}
        open
        step={{
          ...rpeStep,
          targets: [
            { type: "watts", intensity: 200 },
            { type: "cadence", intensity: 90 },
          ],
        }}
      />,
    );

    await fireEvent.press(screen.getByTestId("target-value-0-current-value"));
    await fireEvent.changeText(screen.getByTestId("target-value-0-inline-value"), "5000");
    await fireEvent.press(screen.getByTestId("target-value-1-current-value"));
    await fireEvent.changeText(screen.getByTestId("target-value-1-inline-value"), "5000");
    await fireEvent.press(screen.getByTestId("target-remove-0"));
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Finish or correct the exact value before saving.")).toBeTruthy();
  });
});
