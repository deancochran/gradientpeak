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

describe("StepEditorFields screen form", () => {
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
  it("orders Duration, Intensity, optional details, then Notes with persistent current-value rows", async () => {
    const { container } = await renderNative(
      <StepEditorFields activityCategory="bike" onDirtyChange={() => undefined} step={step} />,
    );
    expect(screen.getByLabelText("Name (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Notes (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Duration type: Time")).toBeTruthy();
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("0:01:00");
    expect(screen.getByText("Duration value")).toBeTruthy();
    expect(screen.getByText("0:01:00")).toBeTruthy();
    expect(screen.getByLabelText("Target 1 type").props.accessibilityValue.text).toBe(
      "Power · watts",
    );
    expect(screen.getByLabelText("Target 1 value").props.accessibilityValue.text).toBe("250");
    expect(screen.getByText("Target 1 value")).toBeTruthy();
    expect(screen.getByText("250 watts")).toBeTruthy();
    expect(screen.getByLabelText("Target 2 type").props.accessibilityValue.text).toBe(
      "Cadence · rpm",
    );
    expect(screen.getByLabelText("Target 2 value")).toBeTruthy();
    expect(screen.getByText("Target 2 value")).toBeTruthy();
    expect(screen.getByText("90 rpm")).toBeTruthy();
    expect(screen.getByText("DURATION")).toBeTruthy();
    expect(screen.getByText("INTENSITY")).toBeTruthy();
    expect(screen.getByText("NOTES")).toBeTruthy();
    expect(
      container
        .queryAll(
          (node) => typeof node.props.testID === "string" && node.props.testID.endsWith("-section"),
        )
        .map((node) => node.props.testID),
    ).toEqual([
      "step-duration-section",
      "step-intensity-section",
      "step-details-section",
      "step-notes-section",
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
        step={{ ...step, duration, targets: [] }}
      />,
    );
    expect(screen.getByText("Duration value")).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.queryByLabelText("Duration value minutes")).toBeNull();
  });

  it("keeps identity inputs editable and target controls in responsive compact rows", async () => {
    await renderNative(
      <StepEditorFields activityCategory="bike" onDirtyChange={() => undefined} step={step} />,
    );
    await fireEvent.changeText(screen.getByLabelText("Name (optional)"), "Warm up");
    await fireEvent.changeText(screen.getByLabelText("Notes (optional)"), "Easy cadence.");
    expect(screen.getByLabelText("Name (optional)").props.value).toBe("Warm up");
    expect(screen.getByLabelText("Notes (optional)").props.value).toBe("Easy cadence.");
    expect(screen.getByTestId("target-row-0").props.className).toContain("gap-2");
    expect(screen.getByLabelText("Remove target 1").props.className).toContain("min-h-12");
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
    expect(screen.getByLabelText("Target type: RPE")).toBeTruthy();
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
