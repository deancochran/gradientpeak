import { type ActivityPlanStep, getPermissibleTargetTypes } from "@repo/core";
import { Children, createRef, isValidElement } from "react";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepEditorFields, type StepEditorFieldsHandle } from "./StepEditorFields";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(async () => undefined),
}));

const step: ActivityPlanStep = {
  type: "step",
  id: "00000000-0000-4000-8000-000000000010",
  name: "Main set",
  instructions: "Stay smooth.",
  duration: { type: "time", seconds: 60 },
  targets: [
    { type: "watts", intensity: 250 },
    { type: "cadence", intensity: 90 },
  ],
};

async function chooseDurationType(value: string) {
  await fireEvent.press(screen.getByLabelText("Duration type"));
  await fireEvent(screen.getByTestId("Duration type-picker"), "valueChange", value);
}

describe("StepEditorFields screen form", () => {
  it("keeps a targetless draft editable but rejects it on save", async () => {
    const ref = createRef<StepEditorFieldsHandle>();
    await renderNative(
      <StepEditorFields
        ref={ref}
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [] }}
      />,
    );
    await act(() => expect(ref.current?.validate()).toBeNull());
    expect(screen.getByText(/Choose a target before saving this step\./)).toBeTruthy();
  });
  it("shows one duration error only after save validation of a selected blank value", async () => {
    const ref = createRef<StepEditorFieldsHandle>();
    await renderNative(
      <StepEditorFields
        ref={ref}
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, duration: null, targets: [{ type: "RPE", intensity: 5 }] }}
      />,
    );
    await chooseDurationType("distance");
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    await act(() => expect(ref.current?.validate()).toBeNull());
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Correct the completion value before saving.")).toBeTruthy();
  });
  it("allows Rest after choosing Time before its value is entered", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, duration: null, targets: [{ type: "RPE", intensity: 5 }] }}
      />,
    );
    await chooseDurationType("time");
    await fireEvent.press(screen.getByLabelText("Target type"));
    const values = Children.toArray(screen.getByTestId("Target type-picker").props.children)
      .filter(isValidElement<{ value: string }>)
      .map((child) => child.props.value);
    expect(values).toContain("rest");
  });
  it("labels the first target action without the redundant another copy", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [] }}
      />,
    );
    expect(screen.getByText("Add target")).toBeTruthy();
    expect(screen.queryByText("Add another target")).toBeNull();
  });
  it("validates timed rest without an intensity input or another target", async () => {
    const ref = createRef<StepEditorFieldsHandle>();
    await renderNative(
      <StepEditorFields
        ref={ref}
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "rest" }] }}
      />,
    );
    expect(screen.queryByLabelText("Target value")).toBeNull();
    expect(screen.queryByLabelText("Add target")).toBeNull();
    await act(() => {
      expect(ref.current?.validate()).toMatchObject({
        duration: { type: "time", seconds: 60 },
        targets: [{ type: "rest" }],
      });
    });
  });
  it("keeps one target selector and remover while changing between rest and numeric targets", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "rest" }] }}
      />,
    );
    expect(screen.getAllByLabelText("Target type")).toHaveLength(1);
    expect(screen.getAllByLabelText("Remove target 1")).toHaveLength(1);
    expect(screen.queryByLabelText("Target value")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Target type"));
    const picker = screen.getByTestId("Target type-picker");
    await fireEvent(picker, "valueChange", "bpm");
    expect(screen.getAllByLabelText("Target type")).toHaveLength(1);
    expect(screen.getAllByLabelText("Remove target 1")).toHaveLength(1);
    expect(screen.getByLabelText("Target value")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Target type"));
    await fireEvent(screen.getByTestId("Target type-picker"), "valueChange", "rest");
    expect(screen.getAllByLabelText("Target type")).toHaveLength(1);
    expect(screen.getAllByLabelText("Remove target 1")).toHaveLength(1);
    expect(screen.queryByLabelText("Target value")).toBeNull();
  });
  it.each([
    { type: "distance" as const, meters: 800 },
    { type: "repetitions" as const, count: 8 },
  ])("does not offer or accept rest for a $type step", async (duration) => {
    const ref = createRef<StepEditorFieldsHandle>();
    await renderNative(
      <StepEditorFields
        ref={ref}
        activityCategory={duration.type === "repetitions" ? "strength" : "bike"}
        onDirtyChange={() => undefined}
        step={{
          ...step,
          duration,
          targets: [{ type: "RPE", intensity: 5 }],
        }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target type"));
    const picker = screen.getByTestId("Target type-picker");
    const values = Children.toArray(picker.props.children)
      .filter(isValidElement<{ value: string }>)
      .map((child) => child.props.value);
    expect(values).not.toContain("rest");
    await fireEvent(picker, "valueChange", "rest");
    expect(screen.getAllByLabelText("Target type")[0]?.props.accessibilityValue.text).toBe("RPE");
  });
  it("keeps a legacy rest mismatch repairable and unlocks duration choices after changing rest", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, duration: { type: "distance", meters: 800 }, targets: [{ type: "rest" }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target type"));
    await fireEvent(screen.getByTestId("Target type-picker"), "valueChange", "rest");
    expect(
      screen
        .getAllByLabelText("Target type")
        .some((node) => node.props.accessibilityValue?.text === "Rest"),
    ).toBe(true);
    await fireEvent(screen.getByTestId("Target type-picker"), "valueChange", "bpm");
    expect(screen.getByLabelText("Target type").props.accessibilityValue.text).toBe(
      "Heart rate · bpm",
    );
    await fireEvent.press(screen.getByLabelText("Duration type"));
    const picker = screen.getByTestId("Duration type-picker");
    const options = Children.toArray(picker.props.children)
      .filter(isValidElement<{ value: string; disabled?: boolean }>)
      .map((child) => ({ disabled: child.props.disabled, value: child.props.value }));
    expect(options.find((option) => option.value === "distance")?.disabled).not.toBe(true);
  });
  it("locks completion to time while rest is selected and unlocks it after removal", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "rest" }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration type"));
    const picker = screen.getByTestId("Duration type-picker");
    await fireEvent(picker, "valueChange", "distance");
    expect(screen.getAllByLabelText("Duration type")[0]?.props.accessibilityValue.text).toBe(
      "Time",
    );
    await fireEvent.press(screen.getByLabelText("Remove target 1"));
    await chooseDurationType("distance");
    expect(screen.getAllByLabelText("Duration type")[0]?.props.accessibilityValue.text).toBe(
      "Distance",
    );
  });
  it("keeps populated optional step details open with persistent current-value rows", async () => {
    const { container } = await renderNative(
      <StepEditorFields activityCategory="bike" onDirtyChange={() => undefined} step={step} />,
    );
    expect(screen.getByLabelText("Name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Coaching cue (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Duration type").props.accessibilityValue.text).toBe("Time");
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("0:01:00");
    expect(screen.getByText("0:01:00")).toBeTruthy();
    expect(screen.getByLabelText("Target 1 type").props.accessibilityValue.text).toBe(
      "Power · watts",
    );
    expect(screen.getByLabelText("Target 1 value").props.accessibilityValue.text).toBe("250");
    expect(screen.getByText("250 watts")).toBeTruthy();
    expect(screen.getByLabelText("Target 2 type").props.accessibilityValue.text).toBe("Cadence");
    expect(screen.getByLabelText("Target 2 value")).toBeTruthy();
    expect(screen.getByText("90 rpm")).toBeTruthy();
    expect(
      container
        .queryAll(
          (node) => typeof node.props.testID === "string" && node.props.testID.endsWith("-section"),
        )
        .map((node) => node.props.testID),
    ).toEqual([
      "step-details-section",
      "step-notes-section",
      "step-duration-section",
      "step-intensity-section",
    ]);
    expect(screen.queryByLabelText("Duration value minutes")).toBeNull();
    expect(screen.queryByTestId("step-picker-modal")).toBeNull();
  });

  it.each([
    [{ type: "time", seconds: 0 }, "0:0:0"],
    [{ type: "distance", meters: 1000 }, "1 km"],
    [{ type: "repetitions", count: 8 }, "8 reps"],
  ] as const)("keeps the %s completion label and current value visible at rest", async (duration, value) => {
    await renderNative(
      <StepEditorFields
        activityCategory={duration.type === "repetitions" ? "strength" : "bike"}
        onDirtyChange={() => undefined}
        step={{ ...step, duration, targets: [{ type: "RPE", intensity: 5 }] }}
      />,
    );
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.queryByLabelText("Duration value minutes")).toBeNull();
  });

  it("keeps identity inputs editable and target controls in responsive compact rows", async () => {
    await renderNative(
      <StepEditorFields activityCategory="bike" onDirtyChange={() => undefined} step={step} />,
    );
    await fireEvent.changeText(screen.getByLabelText("Name (optional)"), "Warm up");
    await fireEvent.changeText(screen.getByLabelText("Coaching cue (optional)"), "Easy cadence.");
    expect(screen.getByLabelText("Name (optional)").props.value).toBe("Warm up");
    expect(screen.getByLabelText("Coaching cue (optional)").props.value).toBe("Easy cadence.");
    expect(screen.getByTestId("target-controls-0").props.className).toContain("flex-row");
    expect(screen.getByTestId("target-controls-0").props.className).not.toContain("flex-wrap");
    expect(screen.getByLabelText("Remove target 1").props.className).toContain("min-h-11");
  });

  it("uses spm and a new-only running cadence default without changing saved values", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="run"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "RPE", intensity: 5 }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target type"));
    await fireEvent(screen.getByTestId("Target type-picker"), "valueChange", "cadence");
    expect(screen.getByText("160 spm")).toBeTruthy();
  });

  it("renders persisted running cadence values in spm without converting them", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="run"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "cadence", intensity: 80 }] }}
      />,
    );
    expect(screen.getByText("80 spm")).toBeTruthy();
  });

  it("keeps empty optional details directly editable", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={{ ...step, name: undefined, instructions: undefined }}
      />,
    );
    expect(screen.getByLabelText("Name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Coaching cue (optional)")).toBeTruthy();
  });

  it("uses single-line notes and rejects pasted paragraphs without discarding the draft", async () => {
    const ref = createRef<StepEditorFieldsHandle>();
    await renderNative(
      <StepEditorFields
        ref={ref}
        activityCategory="bike"
        onDirtyChange={() => undefined}
        step={step}
      />,
    );
    expect(screen.getByTestId("step-notes-input").props.multiline).not.toBe(true);
    for (const invalid of ["Easy\n\nStay relaxed.", "Easy\n", "a".repeat(161)]) {
      await fireEvent.changeText(screen.getByTestId("step-notes-input"), invalid);
      await act(() => {
        expect(ref.current?.validate()).toBeNull();
      });
      expect(screen.getByTestId("step-notes-input").props.value).toBe(invalid);
    }
    await fireEvent.changeText(screen.getByTestId("step-notes-input"), "");
    await act(() => {
      expect(ref.current?.validate()).not.toHaveProperty("instructions");
    });
  });

  it.each([
    "run",
    "bike",
    "swim",
    "strength",
    "other",
  ] as const)("exposes %s permitted target options", async (activityCategory) => {
    await renderNative(
      <StepEditorFields
        activityCategory={activityCategory}
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "RPE", intensity: 5 }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Target type"));
    const picker = screen.getByTestId("Target type-picker");
    const options = Children.toArray(picker.props.children)
      .filter(isValidElement<{ value: string }>)
      .map((child) => child.props.value);
    expect(options).toEqual(expect.arrayContaining(getPermissibleTargetTypes(activityCategory)));
  });

  it("limits repetition steps to the visible RPE target selector", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="strength"
        onDirtyChange={() => undefined}
        step={{
          ...step,
          duration: { type: "repetitions", count: 8 },
          targets: [{ type: "RPE", intensity: 5 }],
        }}
      />,
    );
    expect(screen.getByLabelText("Target type").props.accessibilityValue.text).toBe("RPE");
    expect(screen.queryByLabelText("Add target")).toBeNull();
  });

  it("renders every half-point RPE choice as compact string choices and updates the target", async () => {
    await renderNative(
      <StepEditorFields
        activityCategory="run"
        onDirtyChange={() => undefined}
        step={{ ...step, targets: [{ type: "RPE", intensity: 4.5 }] }}
      />,
    );
    const trigger = screen.getByLabelText("Target value");
    expect(trigger.props.accessibilityValue.text).toBe("4.5");
    await fireEvent.press(trigger);
    const picker = screen.getByTestId("Target value-picker");
    const values = Children.toArray(picker.props.children)
      .filter(isValidElement<{ value: number | string }>)
      .map((child) => child.props.value);
    expect(values).toEqual([
      "",
      ...Array.from({ length: 19 }, (_, index) => String(1 + index / 2)),
    ]);
    expect(picker.props.selectedValue).toBe("4.5");
    await fireEvent(picker, "valueChange", "5.5");
    expect(screen.getByLabelText("Target value").props.accessibilityValue.text).toBe("5.5");
  });
});
