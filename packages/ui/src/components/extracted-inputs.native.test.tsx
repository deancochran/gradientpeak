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

function getNativeNodesByType(rendered: Awaited<ReturnType<typeof renderNative>>, type: string) {
  return rendered.container.queryAll((node) => node.type === type);
}

function queryNativeNodesByType(rendered: Awaited<ReturnType<typeof renderNative>>, type: string) {
  return rendered.container.queryAll((node) => node.type === type);
}

describe("extracted inputs native", () => {
  it("DateInput clears a selected value", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await renderNative(
      <DateInput {...dateInputFixtures.raceDay} clearable onChange={onChange} />,
    );

    await fireEvent.press(getByLabelText("Clear date"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("DateInput opens the native picker in a modal by default instead of inline below the field", async () => {
    const onChange = jest.fn();
    const rendered = await renderNative(
      <DateInput {...dateInputFixtures.raceDay} onChange={onChange} />,
    );

    expect(queryNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(0);

    await fireEvent.press(rendered.getByTestId("race-day-input"));

    expect(getNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(1);
    expect(rendered.getByText("Done")).toBeTruthy();
  });

  it("FileInput returns picked files", async () => {
    const onFilesChange = jest.fn();
    const { getByText } = await renderNative(
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

  it("BoundedNumberInput commits preset values", async () => {
    const onChange = jest.fn();
    const { getByText } = await renderNative(
      <BoundedNumberInput
        {...boundedNumberInputFixtures.ftp}
        onChange={onChange}
        presets={[{ label: "Sweet Spot", value: "285" }]}
      />,
    );

    await fireEvent.press(getByText("Sweet Spot"));

    expect(onChange).toHaveBeenCalledWith("285");
  });

  it("IntegerStepper increments with the plus button", async () => {
    const onChange = jest.fn();
    const { getByText } = await renderNative(
      <IntegerStepper {...integerStepperFixtures.weeks} onChange={onChange} />,
    );

    await fireEvent.press(getByText("+"));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("DurationInput forwards typed values", async () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = await renderNative(
      <DurationInput {...durationInputFixtures.activity} onChange={onChange} />,
    );

    await fireEvent(
      getByDisplayValue(durationInputFixtures.activity.value),
      "changeText",
      "1:45:00",
    );

    expect(onChange).toHaveBeenCalledWith("1:45:00");
  });

  it("PaceInput forwards typed values", async () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = await renderNative(
      <PaceInput {...paceInputFixtures.threshold} onChange={onChange} />,
    );

    await fireEvent(getByDisplayValue(paceInputFixtures.threshold.value), "changeText", "4:05");

    expect(onChange).toHaveBeenCalledWith("4:05");
  });

  it("NumberSliderInput commits numeric entry on blur", async () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = await renderNative(
      <NumberSliderInput
        {...numberSliderInputFixtures.intensity}
        onChange={onChange}
        showNumericInput
      />,
    );

    const input = getByDisplayValue("0.75");
    await fireEvent(input, "changeText", "0.95");
    await fireEvent(input, "blur");

    expect(onChange).toHaveBeenCalledWith(0.95);
  });

  it("NumberSliderInput keeps invalid inline exact entry visible and commits precise valid entry", async () => {
    const onChange = jest.fn();
    const onExactValueInvalidChange = jest.fn();
    const { getByTestId } = await renderNative(
      <NumberSliderInput
        inlineValueEditor
        max={1}
        min={0}
        onChange={onChange}
        onExactValueInvalidChange={onExactValueInvalidChange}
        testId="intensity"
        value={0.75}
      />,
    );

    const currentValue = getByTestId("intensity-current-value");
    expect(currentValue.props.accessibilityRole).toBe("button");
    expect(currentValue.props.hitSlop).toBe(8);
    await fireEvent.press(currentValue);
    const input = getByTestId("intensity-inline-value");
    await fireEvent(input, "changeText", "1.5");
    expect(onChange).not.toHaveBeenCalled();
    expect(onExactValueInvalidChange).toHaveBeenLastCalledWith(true);
    expect(getByTestId("intensity-inline-value").props.value).toBe("1.5");

    await fireEvent(input, "changeText", "0.955");
    await fireEvent(input, "submitEditing");
    expect(onChange).toHaveBeenLastCalledWith(0.955);
    expect(onExactValueInvalidChange).toHaveBeenLastCalledWith(false);
  });

  it("NumberSliderInput opens and closes exact entry without changing a precise canonical value", async () => {
    const onChange = jest.fn();
    const { getByTestId } = await renderNative(
      <NumberSliderInput
        decimals={2}
        inlineValueEditor
        max={1}
        min={0}
        onChange={onChange}
        testId="precise"
        value={0.123456789}
      />,
    );

    await fireEvent.press(getByTestId("precise-current-value"));
    expect(getByTestId("precise-inline-value").props.value).toBe("0.123456789");
    await fireEvent(getByTestId("precise-inline-value"), "blur");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("PercentSliderInput commits numeric entry on blur", async () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = await renderNative(
      <PercentSliderInput {...percentSliderInputFixtures.recovery} onChange={onChange} />,
    );

    const input = getByDisplayValue("12");
    await fireEvent(input, "changeText", "15");
    await fireEvent(input, "blur");

    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("PaceSecondsField converts pace text into seconds", async () => {
    const onChangeSeconds = jest.fn();
    const { getByDisplayValue, getByTestId } = await renderNative(
      <PaceSecondsField {...paceSecondsFieldFixtures.easy} onChangeSeconds={onChangeSeconds} />,
    );

    const input = getByDisplayValue("5:30");
    expect(getByTestId("easy-pace-seconds-field")).toBe(input);
    await fireEvent(input, "changeText", "5:45");
    await fireEvent(input, "blur");

    expect(onChangeSeconds).toHaveBeenLastCalledWith(345);
  });

  it("WeightInputField lets callers switch units", async () => {
    const onChangeKg = jest.fn();
    const onUnitChange = jest.fn();
    const { getByText } = await renderNative(
      <WeightInputField
        {...weightInputFieldFixtures.athlete}
        onChangeKg={onChangeKg}
        onUnitChange={onUnitChange}
      />,
    );

    await fireEvent.press(getByText("LBS"));

    expect(onUnitChange).toHaveBeenCalledWith("lbs");
  });

  it("TimeInput clears a selected value", async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await renderNative(
      <TimeInput {...timeInputFixtures.startTime} clearable onChange={onChange} />,
    );

    await fireEvent.press(getByLabelText("Clear time"));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("TimeInput opens the native picker in a modal by default instead of inline below the field", async () => {
    const onChange = jest.fn();
    const rendered = await renderNative(
      <TimeInput {...timeInputFixtures.startTime} onChange={onChange} />,
    );

    expect(queryNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(0);

    await fireEvent.press(rendered.getByTestId("start-time-input"));

    expect(getNativeNodesByType(rendered, "DateTimePicker")).toHaveLength(1);
    expect(rendered.getByText("Done")).toBeTruthy();
  });
});
