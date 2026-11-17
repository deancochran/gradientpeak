import type { ActivityPlanStep } from "@repo/core";
import { createElement, useState } from "react";
import { Alert } from "react-native";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepEditorDialog } from "./StepEditorDialog";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock("@/components/shared/AppFormModal", () => ({
  AppFormModal: ({
    children,
    primaryAction,
    ...props
  }: {
    children: React.ReactNode;
    primaryAction: React.ReactNode;
  }) => createElement("AppFormModal", props, children, primaryAction),
}));

const step: ActivityPlanStep = {
  type: "step",
  id: "00000000-0000-4000-8000-000000000010",
  name: "Main set",
  instructions: "Stay smooth.",
  duration: { type: "time", seconds: 60 },
  targets: [{ type: "RPE", intensity: 4 }],
};

describe("StepEditorDialog", () => {
  it("is one full-screen save transaction with all applicable form inputs visible", async () => {
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={step}
      />,
    );
    expect(screen.getByTestId("step-editor-modal").props.presentationStyle).toBe("fullScreen");
    expect(screen.getByLabelText("Name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Notes (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Duration type: Time")).toBeTruthy();
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
    expect(screen.getByLabelText("Target type: RPE")).toBeTruthy();
    expect(screen.getByLabelText("Target value")).toBeTruthy();
    expect(screen.queryByText("Hide instructions")).toBeNull();
    expect(screen.queryByText("Change target type")).toBeNull();
    expect(screen.queryByTestId("step-picker-modal")).toBeNull();
  });

  it("updates the displayed target value control immediately when its type changes", async () => {
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={step}
      />,
    );
    await fireEvent(screen.getByLabelText("Target type"), "valueChange", "bpm");
    expect(screen.getByLabelText("Target type: Heart rate · bpm")).toBeTruthy();
    expect(screen.getByLabelText("Target value")).toBeTruthy();
    expect(screen.queryByTestId("step-picker-modal")).toBeNull();
  });

  it("presents a running speed target as Pace while saving its canonical speed in km/h", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, targets: [{ type: "speed", intensity: 10 }] }}
      />,
    );
    expect(screen.getByLabelText("Target type: Pace")).toBeTruthy();
    expect(screen.getByLabelText("Target pace").props.accessibilityValue.text).toBe("6:00 /km");
    expect(screen.queryByLabelText("Target pace minutes")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Target pace"));
    await fireEvent(screen.getByLabelText("Target pace minutes"), "valueChange", 5);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [{ type: "speed", intensity: 12 }] }),
    );
  });

  it("keeps an existing zero running speed visible as an actionable invalid pace until corrected", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, targets: [{ type: "speed", intensity: 0 }] }}
      />,
    );
    expect(screen.getByLabelText("Target pace").props.accessibilityValue.text).toBe("Not set");
    expect(
      screen.getByText(
        "This saved zero speed cannot be shown as pace. Choose a positive pace or another target type before saving.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "A zero speed target cannot be represented as pace. Choose a positive pace or another target type.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Target pace"));
    await fireEvent(screen.getByLabelText("Target pace minutes"), "valueChange", 5);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [{ type: "speed", intensity: 12 }] }),
    );
  });

  it("keeps swimming speed in km/h and replaces it with the selected heart-rate default", async () => {
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="swim"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={{ ...step, targets: [{ type: "speed", intensity: 25 }] }}
      />,
    );
    expect(screen.getByLabelText("Target type: Speed · km/h")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Target type"), "valueChange", "bpm");
    expect(screen.getByLabelText("Target type: Heart rate · bpm")).toBeTruthy();
    expect(screen.getByLabelText("Target value").props.accessibilityValue.text).toBe("120");
  });

  it("adds and removes targets with visible controls", async () => {
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={step}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Add target"));
    expect(screen.getAllByTestId(/target-row-/)).toHaveLength(2);
    expect(screen.getByLabelText("Target 2 type: Pace")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove target 2"));
    expect(screen.getAllByTestId(/target-row-/)).toHaveLength(1);
  });

  it("does not let a captured removed-target picker callback change a replacement target", async () => {
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={step}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Add target"));
    const stale = screen.getByLabelText("Target 2 type").props.onValueChange;
    await fireEvent.press(screen.getByLabelText("Remove target 2"));
    await fireEvent.press(screen.getByLabelText("Add target"));
    stale("bpm");
    expect(screen.getByLabelText("Target 2 type: Pace")).toBeTruthy();
  });

  it.each([
    [{ type: "distance", meters: 0 }, []],
    [{ type: "repetitions", count: 0 }, []],
    [{ type: "time", seconds: 60 }, [{ type: "RPE", intensity: null }]],
    [{ type: "time", seconds: 60 }, [{ type: "bpm", intensity: 999 }]],
    [{ type: "time", seconds: 60 }, [{ type: "RPE", intensity: 4.25 }]],
  ] as const)("rejects an invalid persisted step fixture", async (duration, targets) => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, duration, targets } as unknown as ActivityPlanStep}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("saves valid edits", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={step}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Main set" }));
  });

  it("rejects a missing completion while still allowing a step with no targets", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, duration: null, targets: [] }}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it.each([
    "time",
    "distance",
  ] as const)("saves a blank step after choosing and entering %s", async (kind) => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, duration: null, targets: [] }}
      />,
    );
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", kind);
    await fireEvent.press(screen.getByLabelText("Duration value"));
    if (kind === "time")
      await fireEvent(screen.getByLabelText("Duration value minutes"), "valueChange", 5);
    else await fireEvent(screen.getByLabelText("Duration value units"), "valueChange", 1);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        duration:
          kind === "time" ? { type: "time", seconds: 300 } : { type: "distance", meters: 1000 },
      }),
    );
  });

  it("rejects save when a newly selected distance has no value", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, duration: null, targets: [] }}
      />,
    );
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "distance");
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("rejects a zero distance selected from the native picker instead of retaining its old value", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, duration: { type: "distance", meters: 1000 }, targets: [] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent(screen.getByLabelText("Duration value units"), "valueChange", 0);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Finish or correct the exact value before saving.")).toBeTruthy();
  });

  it("rejects a zero pace selected from the native picker instead of retaining its old target", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, targets: [{ type: "speed", intensity: 10 }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target pace"));
    await fireEvent(screen.getByLabelText("Target pace minutes"), "valueChange", 0);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Finish or correct the exact value before saving.")).toBeTruthy();
  });

  it("disables save and close during an async save, then permits retry after rejection", async () => {
    let reject: ((error: Error) => void) | undefined;
    const onSave = jest.fn(
      () =>
        new Promise<void>((_resolve, rejectSave) => {
          reject = rejectSave;
        }),
    );
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={step}
      />,
    );
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(screen.getByTestId("step-editor-save-button").props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByTestId("step-editor-modal").props.dismissDisabled).toBe(true);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => reject?.(new Error("Try again")));
    expect(screen.getByTestId("step-editor-save-button").props.accessibilityState.disabled).toBe(
      false,
    );
    expect(screen.getByTestId("step-editor-modal").props.dismissDisabled).toBe(false);
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("clears an existing time duration and rejects save instead of retaining the old value", async () => {
    const onSave = jest.fn();
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={onSave}
        step={{ ...step, targets: [] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent.press(screen.getByLabelText("Clear Duration value"));
    await fireEvent.press(screen.getByTestId("step-editor-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a completion type and value before saving.")).toBeTruthy();
  });

  it("confirms whole-screen cancel and does not save", async () => {
    const close = jest.fn();
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, actions) =>
        actions?.find((action) => action.text === "Discard edits")?.onPress?.(),
      );
    await renderNative(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={close}
        onSave={jest.fn()}
        step={step}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Name (optional)"), "Changed");
    await fireEvent(screen.getByTestId("step-editor-modal"), "close");
    expect(close).toHaveBeenCalledWith(false);
    alert.mockRestore();
  });

  it("restores the original existing draft after cancel and reopen", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, actions) =>
        actions?.find((action) => action.text === "Discard edits")?.onPress?.(),
      );
    function Owner() {
      const [open, setOpen] = useState(true);
      return (
        <StepEditorDialog
          open={open}
          activityCategory="run"
          onOpenChange={setOpen}
          onSave={jest.fn()}
          step={step}
        />
      );
    }
    const view = await renderNative(<Owner />);
    await fireEvent.changeText(screen.getByLabelText("Name (optional)"), "Changed");
    await fireEvent(screen.getByTestId("step-editor-modal"), "close");
    await view.rerender(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={step}
      />,
    );
    expect(screen.getByLabelText("Name (optional)").props.value).toBe("Main set");
    alert.mockRestore();
  });

  it("discards an invalid native pace draft when the parent closes and reopens the editor", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _message, actions) =>
        actions?.find((action) => action.text === "Discard edits")?.onPress?.(),
      );
    function Owner() {
      const [open, setOpen] = useState(true);
      return (
        <StepEditorDialog
          open={open}
          activityCategory="run"
          onOpenChange={setOpen}
          onSave={jest.fn()}
          step={{ ...step, targets: [{ type: "speed", intensity: 10 }] }}
        />
      );
    }
    const view = await renderNative(<Owner />);
    await fireEvent.press(screen.getByLabelText("Target pace"));
    await fireEvent(screen.getByLabelText("Target pace minutes"), "valueChange", 0);
    await fireEvent(screen.getByTestId("step-editor-modal"), "close");
    await view.rerender(
      <StepEditorDialog
        open
        activityCategory="run"
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
        step={{ ...step, targets: [{ type: "speed", intensity: 10 }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target pace"));
    expect(screen.getByLabelText("Target pace minutes").props.selectedValue).toBe(6);
    alert.mockRestore();
  });
});
