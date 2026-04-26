import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../test/render-web";
import { boundedNumberInputFixtures } from "./bounded-number-input/fixtures";
import { BoundedNumberInput } from "./bounded-number-input/index.web";
import { dateInputFixtures } from "./date-input/fixtures";
import { DateInput } from "./date-input/index.web";
import { durationInputFixtures } from "./duration-input/fixtures";
import { DurationInput } from "./duration-input/index.web";
import { fileInputFixtures } from "./file-input/fixtures";
import { FileInput } from "./file-input/index.web";
import { integerStepperFixtures } from "./integer-stepper/fixtures";
import { IntegerStepper } from "./integer-stepper/index.web";
import { numberSliderInputFixtures } from "./number-slider-input/fixtures";
import { NumberSliderInput } from "./number-slider-input/index.web";
import { paceInputFixtures } from "./pace-input/fixtures";
import { PaceInput } from "./pace-input/index.web";
import { paceSecondsFieldFixtures } from "./pace-seconds-field/fixtures";
import { PaceSecondsField } from "./pace-seconds-field/index.web";
import { percentSliderInputFixtures } from "./percent-slider-input/fixtures";
import { PercentSliderInput } from "./percent-slider-input/index.web";
import { timeInputFixtures } from "./time-input/fixtures";
import { TimeInput } from "./time-input/index.web";
import { weightInputFieldFixtures } from "./weight-input-field/fixtures";
import { WeightInputField } from "./weight-input-field/index.web";

describe("extracted inputs web", () => {
  it("DateInput clears a selected value", () => {
    const onChange = vi.fn();

    renderWeb(<DateInput {...dateInputFixtures.raceDay} clearable onChange={onChange} />);

    expect(screen.getByTestId(dateInputFixtures.raceDay.testId)).toHaveAttribute(
      "id",
      `${dateInputFixtures.raceDay.id}-field`,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear date/i }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("TimeInput clears a selected value", () => {
    const onChange = vi.fn();

    renderWeb(<TimeInput {...timeInputFixtures.startTime} clearable onChange={onChange} />);

    expect(screen.getByTestId(timeInputFixtures.startTime.testId)).toHaveAttribute(
      "id",
      `${timeInputFixtures.startTime.id}-field`,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear time/i }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("FileInput translates browser files into selected file metadata", () => {
    const onFilesChange = vi.fn();
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    renderWeb(<FileInput {...fileInputFixtures.avatar} onFilesChange={onFilesChange} />);

    fireEvent.change(screen.getByTestId(fileInputFixtures.avatar.testId), {
      currentTarget: { files: [file] },
      target: { files: [file] },
    });

    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        file,
        name: "avatar.png",
        type: "image/png",
      }),
    ]);
  });

  it("BoundedNumberInput commits preset values", () => {
    const onChange = vi.fn();

    renderWeb(
      <BoundedNumberInput
        {...boundedNumberInputFixtures.ftp}
        onChange={onChange}
        presets={[{ label: "Sweet Spot", value: "285" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sweet Spot" }));

    expect(onChange).toHaveBeenCalledWith("285");
  });

  it("IntegerStepper increments with the plus button", () => {
    const onChange = vi.fn();

    renderWeb(<IntegerStepper {...integerStepperFixtures.weeks} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "+" }));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("DurationInput forwards typed values", () => {
    const onChange = vi.fn();

    renderWeb(<DurationInput {...durationInputFixtures.workout} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(durationInputFixtures.workout.label), {
      currentTarget: { value: "1:45:00" },
      target: { value: "1:45:00" },
    });

    expect(onChange).toHaveBeenCalledWith("1:45:00");
  });

  it("PaceInput forwards typed values", () => {
    const onChange = vi.fn();

    renderWeb(<PaceInput {...paceInputFixtures.threshold} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(paceInputFixtures.threshold.label), {
      currentTarget: { value: "4:05" },
      target: { value: "4:05" },
    });

    expect(onChange).toHaveBeenCalledWith("4:05");
  });

  it("NumberSliderInput commits numeric entry on blur", () => {
    const onChange = vi.fn();

    renderWeb(
      <NumberSliderInput
        {...numberSliderInputFixtures.intensity}
        onChange={onChange}
        showNumericInput
      />,
    );

    const input = screen.getByLabelText(numberSliderInputFixtures.intensity.label);
    fireEvent.change(input, {
      currentTarget: { value: "0.95" },
      target: { value: "0.95" },
    });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(0.95);
  });

  it("PercentSliderInput commits numeric entry on blur", () => {
    const onChange = vi.fn();

    renderWeb(<PercentSliderInput {...percentSliderInputFixtures.recovery} onChange={onChange} />);

    const input = screen.getByLabelText(percentSliderInputFixtures.recovery.label);
    fireEvent.change(input, {
      currentTarget: { value: "15" },
      target: { value: "15" },
    });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("PaceSecondsField converts pace text into seconds", () => {
    const onChangeSeconds = vi.fn();

    renderWeb(
      <PaceSecondsField {...paceSecondsFieldFixtures.easy} onChangeSeconds={onChangeSeconds} />,
    );

    const input = screen.getByLabelText(paceSecondsFieldFixtures.easy.label);
    fireEvent.change(input, {
      currentTarget: { value: "5:45" },
      target: { value: "5:45" },
    });
    fireEvent.blur(input);

    expect(onChangeSeconds).toHaveBeenLastCalledWith(345);
  });

  it("WeightInputField lets callers switch units", () => {
    const onChangeKg = vi.fn();
    const onUnitChange = vi.fn();

    renderWeb(
      <WeightInputField
        {...weightInputFieldFixtures.athlete}
        onChangeKg={onChangeKg}
        onUnitChange={onUnitChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "LBS" }));

    expect(onUnitChange).toHaveBeenCalledWith("lbs");
  });
});
