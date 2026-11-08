import { Children, isValidElement, useState } from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepDurationField, type StepDurationValue } from "./StepDurationField";

function pickerValues(label: string) {
  return Children.toArray(screen.getByLabelText(label).props.children)
    .filter(isValidElement<{ value: string }>)
    .map((child) => child.props.value);
}

describe("StepDurationField compact rows", () => {
  it.each([
    ["run", ["time", "distance"]],
    ["bike", ["time", "distance"]],
    ["swim", ["time", "distance"]],
    ["strength", ["time", "repetitions"]],
    ["other", ["time"]],
  ] as const)("offers only permissible %s duration choices", async (activityCategory, expected) => {
    await renderNative(
      <StepDurationField
        activityCategory={activityCategory}
        form={{
          getValues: () => ({ duration: { type: "time", seconds: 60 } }),
          setValue: jest.fn(),
        }}
      />,
    );
    expect(pickerValues("Duration type")).toEqual(expect.arrayContaining(expected));
    expect(pickerValues("Duration type")).not.toContain("untilFinished");
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
    expect(screen.queryByText("Change completion type")).toBeNull();
  });

  it("changes type in-place and gives repetitions its existing default", async () => {
    const setValue = jest.fn();
    function Owner() {
      const [duration, setDuration] = useState<StepDurationValue | null>(null);
      return (
        <StepDurationField
          activityCategory="strength"
          form={{
            getValues: () => ({ duration }),
            setValue: (_name, next, options) => {
              setValue(_name, next, options);
              setDuration(next);
            },
          }}
        />
      );
    }
    await renderNative(<Owner />);
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "repetitions");
    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "repetitions", count: 1 },
      { shouldDirty: true, shouldValidate: true },
    );
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
    expect(screen.getByTestId("completion-type-row")).toBeTruthy();
  });

  it("keeps blank time and distance value rows visible until their first native value is chosen", async () => {
    const setValue = jest.fn();
    function Owner() {
      const [duration, setDuration] = useState<StepDurationValue | null>(null);
      return (
        <StepDurationField
          form={{
            getValues: () => ({ duration }),
            setValue: (_name, next, options) => {
              setValue(_name, next, options);
              setDuration(next);
            },
          }}
        />
      );
    }
    await renderNative(<Owner />);
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "time");
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("Not set");
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent(screen.getByLabelText("Duration value minutes"), "valueChange", 5);
    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "time", seconds: 300 },
      { shouldDirty: true, shouldValidate: true },
    );

    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "distance");
    expect(screen.getByLabelText("Distance unit")).toBeTruthy();
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("Not set");
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent(screen.getByLabelText("Duration value units"), "valueChange", 1);
    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "distance", meters: 1000 },
      { shouldDirty: true, shouldValidate: true },
    );
  });

  it("changes existing completion types without retaining the previous value and preserves same-type values", async () => {
    const setValue = jest.fn();
    function Owner() {
      const [duration, setDuration] = useState<StepDurationValue | null>({
        type: "time",
        seconds: 60,
      });
      return (
        <StepDurationField
          activityCategory="strength"
          form={{
            getValues: () => ({ duration }),
            setValue: (_name, next, options) => {
              setValue(_name, next, options);
              setDuration(next);
            },
          }}
        />
      );
    }
    await renderNative(<Owner />);
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "time");
    expect(setValue).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "repetitions");
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "time");
    expect(setValue).toHaveBeenLastCalledWith("duration", null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
  });

  it("shows the applicable row through time-to-distance-to-time replacements", async () => {
    const setValue = jest.fn();
    function Owner() {
      const [duration, setDuration] = useState<StepDurationValue | null>({
        type: "time",
        seconds: 60,
      });
      return (
        <StepDurationField
          form={{
            getValues: () => ({ duration }),
            setValue: (_name, next, options) => {
              setValue(_name, next, options);
              setDuration(next);
            },
          }}
        />
      );
    }
    await renderNative(<Owner />);
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "distance");
    expect(setValue).toHaveBeenLastCalledWith("duration", null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(screen.getByLabelText("Distance unit")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Duration type"), "valueChange", "time");
    expect(setValue).toHaveBeenLastCalledWith("duration", null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(screen.getByLabelText("Duration value")).toBeTruthy();
  });

  it("keeps a time value exact and edits it only in its native overlay", async () => {
    const setValue = jest.fn();
    await renderNative(
      <StepDurationField
        form={{ getValues: () => ({ duration: { type: "time", seconds: 86399 } }), setValue }}
      />,
    );
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("23:59:59");
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent(screen.getByLabelText("Duration value minutes"), "valueChange", 5);
    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "time", seconds: 83159 },
      { shouldDirty: true, shouldValidate: true },
    );
  });

  it("preserves an invalid zero kilometer selection and blocks its unit switch until corrected", async () => {
    const setValue = jest.fn();
    await renderNative(
      <StepDurationField
        form={{ getValues: () => ({ duration: { type: "distance", meters: 1000 } }), setValue }}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Duration value"));
    await fireEvent(screen.getByLabelText("Duration value units"), "valueChange", 0);
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("0");
    expect(screen.getByText("Correct the completion value before saving.")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Distance unit"), "valueChange", "meters");
    expect(screen.getByLabelText("Distance unit: Kilometers")).toBeTruthy();
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("0");

    await fireEvent(screen.getByLabelText("Duration value units"), "valueChange", 1);
    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "distance", meters: 1000 },
      { shouldDirty: true, shouldValidate: true },
    );
    await fireEvent(screen.getByLabelText("Distance unit"), "valueChange", "meters");
    expect(screen.getByLabelText("Duration value").props.accessibilityValue.text).toBe("1000");
  });

  it("ignores a queued value callback while inactive", async () => {
    const setValue = jest.fn();
    const form = {
      getValues: () => ({ duration: { type: "repetitions" as const, count: 8 } }),
      setValue,
    };
    const view = await renderNative(
      <StepDurationField active activityCategory="strength" form={form} />,
    );
    await fireEvent.press(screen.getByLabelText("Duration value"));
    const stale = screen.getByLabelText("Duration value thousands").props.onValueChange;
    await view.rerender(
      <StepDurationField active={false} activityCategory="strength" form={form} />,
    );
    stale(9);
    expect(setValue).not.toHaveBeenCalled();
  });
});
