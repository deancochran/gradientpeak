import { getDocumentAsync } from "expo-document-picker";

import { fireEvent, renderNative } from "../test/render-native";
import { boundedNumberInputFixtures } from "./bounded-number-input/fixtures";
import { BoundedNumberInput } from "./bounded-number-input/index.native";
import { dateInputFixtures } from "./date-input/fixtures";
import { DateInput } from "./date-input/index.native";
import { durationInputFixtures } from "./duration-input/fixtures";
import { DurationInput } from "./duration-input/index.native";
import { fileInputFixtures } from "./file-input/fixtures";
import { FileInput } from "./file-input/index.native";
import { integerStepperFixtures } from "./integer-stepper/fixtures";
import { IntegerStepper } from "./integer-stepper/index.native";
import { numberSliderInputFixtures } from "./number-slider-input/fixtures";
import { NumberSliderInput } from "./number-slider-input/index.native";
import { paceInputFixtures } from "./pace-input/fixtures";
import { PaceInput } from "./pace-input/index.native";
import { paceSecondsFieldFixtures } from "./pace-seconds-field/fixtures";
import { PaceSecondsField } from "./pace-seconds-field/index.native";
import { percentSliderInputFixtures } from "./percent-slider-input/fixtures";
import { PercentSliderInput } from "./percent-slider-input/index.native";
import { timeInputFixtures } from "./time-input/fixtures";
import { TimeInput } from "./time-input/index.native";
import { weightInputFieldFixtures } from "./weight-input-field/fixtures";
import { WeightInputField } from "./weight-input-field/index.native";

type NativeRenderWithTypeQueries = ReturnType<typeof renderNative> & {
  queryAllByType?: (type: string) => unknown[];
  UNSAFE_getAllByType: (type: string) => unknown[];
};

function getNativeNodesByType(rendered: ReturnType<typeof renderNative>, type: string) {
  return (rendered as NativeRenderWithTypeQueries).UNSAFE_getAllByType(type);
}

function queryNativeNodesByType(rendered: ReturnType<typeof renderNative>, type: string) {
  return (rendered as NativeRenderWithTypeQueries).queryAllByType?.(type) ?? [];
}

describe("extracted inputs native", () => {
  it("DateInput clears a selected value", () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderNative(
      <DateInput {...dateInputFixtures.raceDay} clearable onChange={onChange} />,
    );

    fireEvent.press(getByLabelText("Clear date"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("DateInput opens the native picker in a modal by default instead of inline below the field", () => {
    const onChange = jest.fn();
    const rendered = renderNative(<DateInput {...dateInputFixtures.raceDay} onChange={onChange} />);

    expect(queryNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(0);

    fireEvent.press(rendered.getByTestId("race-day-input"));

    expect(getNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(1);
    expect(rendered.getByText("Done")).toBeTruthy();
  });

  it("FileInput returns picked files", async () => {
    const onFilesChange = jest.fn();
    const { getByText } = renderNative(
      <FileInput {...fileInputFixtures.avatar} onFilesChange={onFilesChange} />,
    );

    await fireEvent.press(getByText("Choose file"));

    expect(getDocumentAsync).toHaveBeenCalled();
    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "mock-file.fit",
        type: "application/octet-stream",
        uri: "file:///mock-file.fit",
      }),
    ]);
  });

  it("BoundedNumberInput commits preset values", () => {
    const onChange = jest.fn();
    const { getByText } = renderNative(
      <BoundedNumberInput
        {...boundedNumberInputFixtures.ftp}
        onChange={onChange}
        presets={[{ label: "Sweet Spot", value: "285" }]}
      />,
    );

    fireEvent.press(getByText("Sweet Spot"));

    expect(onChange).toHaveBeenCalledWith("285");
  });

  it("IntegerStepper increments with the plus button", () => {
    const onChange = jest.fn();
    const { getByText } = renderNative(
      <IntegerStepper {...integerStepperFixtures.weeks} onChange={onChange} />,
    );

    fireEvent.press(getByText("+"));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("DurationInput forwards typed values", () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = renderNative(
      <DurationInput {...durationInputFixtures.activity} onChange={onChange} />,
    );

    fireEvent(getByDisplayValue(durationInputFixtures.activity.value), "changeText", "1:45:00");

    expect(onChange).toHaveBeenCalledWith("1:45:00");
  });

  it("PaceInput forwards typed values", () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = renderNative(
      <PaceInput {...paceInputFixtures.threshold} onChange={onChange} />,
    );

    fireEvent(getByDisplayValue(paceInputFixtures.threshold.value), "changeText", "4:05");

    expect(onChange).toHaveBeenCalledWith("4:05");
  });

  it("NumberSliderInput commits numeric entry on blur", () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = renderNative(
      <NumberSliderInput
        {...numberSliderInputFixtures.intensity}
        onChange={onChange}
        showNumericInput
      />,
    );

    const input = getByDisplayValue("0.75");
    fireEvent(input, "changeText", "0.95");
    fireEvent(input, "blur");

    expect(onChange).toHaveBeenCalledWith(0.95);
  });

  it("PercentSliderInput commits numeric entry on blur", () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = renderNative(
      <PercentSliderInput {...percentSliderInputFixtures.recovery} onChange={onChange} />,
    );

    const input = getByDisplayValue("12");
    fireEvent(input, "changeText", "15");
    fireEvent(input, "blur");

    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("PaceSecondsField converts pace text into seconds", () => {
    const onChangeSeconds = jest.fn();
    const { getByDisplayValue } = renderNative(
      <PaceSecondsField {...paceSecondsFieldFixtures.easy} onChangeSeconds={onChangeSeconds} />,
    );

    const input = getByDisplayValue("5:30");
    fireEvent(input, "changeText", "5:45");
    fireEvent(input, "blur");

    expect(onChangeSeconds).toHaveBeenLastCalledWith(345);
  });

  it("WeightInputField lets callers switch units", () => {
    const onChangeKg = jest.fn();
    const onUnitChange = jest.fn();
    const { getByText } = renderNative(
      <WeightInputField
        {...weightInputFieldFixtures.athlete}
        onChangeKg={onChangeKg}
        onUnitChange={onUnitChange}
      />,
    );

    fireEvent.press(getByText("LBS"));

    expect(onUnitChange).toHaveBeenCalledWith("lbs");
  });

  it("TimeInput clears a selected value", () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderNative(
      <TimeInput {...timeInputFixtures.startTime} clearable onChange={onChange} />,
    );

    fireEvent.press(getByLabelText("Clear time"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("TimeInput opens the native picker in a modal by default instead of inline below the field", () => {
    const onChange = jest.fn();
    const rendered = renderNative(
      <TimeInput {...timeInputFixtures.startTime} onChange={onChange} />,
    );

    expect(queryNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(0);

    fireEvent.press(rendered.getByTestId("start-time-input"));

    expect(getNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(1);
    expect(rendered.getByText("Done")).toBeTruthy();
  });
});
