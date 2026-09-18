import { createElement } from "react";
import { Alert } from "react-native";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepDurationField } from "./StepDurationField";

jest.mock("@repo/ui/components/number-slider-input", () => ({
  NumberSliderInput: ({ testId, ...props }: { testId?: string }) =>
    createElement("NumberSliderInput", { ...props, testID: testId }),
}));
jest.mock("@repo/ui/components/select", () => ({
  Select: (props: { children: React.ReactNode; onValueChange?: unknown }) =>
    createElement("Select", { ...props, testID: "select" }),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    createElement("SelectContent", null, children),
  SelectItem: ({ children }: { children: React.ReactNode }) =>
    createElement("SelectItem", null, createElement("Text", null, children)),
  SelectTrigger: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    createElement("SelectTrigger", { testID }, children),
  SelectValue: ({ children }: { children: React.ReactNode }) =>
    createElement("SelectValue", null, children),
}));

describe("StepDurationField", () => {
  it.each([
    "run",
    "bike",
    "swim",
    "strength",
    "other",
  ] as const)("offers supported %s choices without an untilFinished authoring option", async (activityCategory) => {
    await renderNative(
      <StepDurationField
        activityCategory={activityCategory}
        form={{
          getValues: () => ({ duration: { type: "time", seconds: 60 } }),
          setValue: jest.fn(),
        }}
      />,
    );
    expect(screen.queryByText("Until finished")).toBeNull();
    expect(Boolean(screen.queryByText("Distance"))).toBe(
      ["run", "bike", "swim"].includes(activityCategory),
    );
    expect(Boolean(screen.queryByText("Repetitions"))).toBe(activityCategory === "strength");
  });
  it("keeps legacy untilFinished visible until the user replaces it", async () => {
    const setValue = jest.fn();
    await renderNative(
      <StepDurationField
        activityCategory="run"
        form={{ getValues: () => ({ duration: { type: "untilFinished" } }), setValue }}
      />,
    );
    expect(screen.getByText(/untilFinished is not permitted/)).toBeTruthy();
    expect(setValue).not.toHaveBeenCalled();
  });
  it("uses the compact duration dropdown and leaves the duration unchanged when replacement is cancelled", async () => {
    const setValue = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await renderNative(
      <StepDurationField
        form={{ getValues: () => ({ duration: { type: "time", seconds: 600 } }), setValue }}
      />,
    );

    expect(screen.getByTestId("step-duration-type")).toBeTruthy();
    expect(screen.getByTestId("step-duration-value").props.compactHeader).toBe(true);
    expect(screen.getByTestId("step-duration-value").props.showNumericInput).toBeUndefined();
    const durationTypeSelect = screen.getAllByTestId("select")[0];
    if (!durationTypeSelect) throw new Error("Duration type select is missing.");
    await fireEvent(durationTypeSelect, "valueChange", { value: "distance" });
    const actions = alert.mock.calls[0]?.[2] ?? [];
    actions.find((action) => action.text === "Cancel")?.onPress?.();

    expect(setValue).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("converts time and distance slider values into canonical seconds and meters", async () => {
    const timeSetValue = jest.fn();
    await renderNative(
      <StepDurationField
        form={{
          getValues: () => ({ duration: { type: "time", seconds: 60 } }),
          setValue: timeSetValue,
        }}
      />,
    );
    await fireEvent(screen.getByTestId("step-duration-value"), "change", 5);
    expect(timeSetValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "time", seconds: 300 },
      { shouldDirty: true, shouldValidate: true },
    );

    const distanceSetValue = jest.fn();
    await renderNative(
      <StepDurationField
        form={{
          getValues: () => ({ duration: { type: "distance", meters: 1000 } }),
          setValue: distanceSetValue,
        }}
      />,
    );
    await fireEvent(screen.getByTestId("step-duration-value"), "change", 1.5);
    expect(distanceSetValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "distance", meters: 1500 },
      { shouldDirty: true, shouldValidate: true },
    );
  });

  it("expands the time slider viewport for an existing long duration without changing its canonical value", async () => {
    const setValue = jest.fn();
    await renderNative(
      <StepDurationField
        form={{ getValues: () => ({ duration: { type: "time", seconds: 86_399 } }), setValue }}
      />,
    );

    const control = screen.getByTestId("step-duration-value");
    expect(control.props.max).toBe(3600);
    expect(control.props.value).toBe(86_399);
    expect(control.props.adjustmentMax).toBe(86_400);
    expect(setValue).not.toHaveBeenCalled();
  });

  it("converts the visible value on a valid unit switch and refuses to discard an invalid exact draft", async () => {
    await renderNative(
      <StepDurationField
        form={{
          getValues: () => ({ duration: { type: "time", seconds: 600 } }),
          setValue: jest.fn(),
        }}
      />,
    );
    const slider = screen.getByTestId("step-duration-value");
    const units = screen.getAllByTestId("select")[1];
    if (!units) throw new Error("Expected the duration unit selector");
    await fireEvent(slider, "exactValueInvalidChange", true);
    await fireEvent(units, "valueChange", { value: "seconds" });
    expect(screen.getByTestId("step-duration-value").props.unitLabel).toBe("minutes");

    await fireEvent(slider, "exactValueInvalidChange", false);
    await fireEvent(units, "valueChange", { value: "seconds" });
    expect(screen.getByTestId("step-duration-value").props.value).toBe(600);
  });
});
