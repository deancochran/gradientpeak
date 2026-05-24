import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import type { ComponentProps } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";

type NumberSliderProps = ComponentProps<typeof NumberSliderInput>;
type PercentSliderProps = ComponentProps<typeof PercentSliderInput>;

interface ConfigNumberSliderFieldProps<TValues extends FieldValues>
  extends Omit<NumberSliderProps, "value" | "onChange"> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  toSliderValue?: (value: number) => number;
  toFieldValue?: (value: number) => number;
  onSliderChange?: (value: number) => void;
}

interface ConfigPercentSliderFieldProps<TValues extends FieldValues>
  extends Omit<PercentSliderProps, "value" | "onChange"> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
}

export function ConfigNumberSliderField<TValues extends FieldValues>({
  control,
  name,
  toSliderValue = (value) => value,
  toFieldValue = (value) => value,
  onSliderChange,
  ...sliderProps
}: ConfigNumberSliderFieldProps<TValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <NumberSliderInput
          {...sliderProps}
          value={toSliderValue(Number(field.value))}
          onChange={(value) => {
            onSliderChange?.(value);
            field.onChange(toFieldValue(value));
          }}
        />
      )}
    />
  );
}

export function ConfigPercentSliderField<TValues extends FieldValues>({
  control,
  name,
  ...sliderProps
}: ConfigPercentSliderFieldProps<TValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <PercentSliderInput
          {...sliderProps}
          value={Number(field.value) * 100}
          onChange={(percent) => {
            field.onChange(Number((percent / 100).toFixed(2)));
          }}
          showNumericInput={false}
        />
      )}
    />
  );
}
