import type * as React from "react";
import type { ComponentProps } from "react";
import type {
  Control,
  FieldPath,
  FieldPathValue,
  FieldValues,
  RegisterOptions,
} from "react-hook-form";
import type { TextInputProps } from "../../lib/react-native";
import type { BoundedNumberInputProps } from "../bounded-number-input/shared";
import type { DateInputProps } from "../date-input/shared";
import type { DurationInputProps } from "../duration-input/shared";
import type { IntegerStepperProps } from "../integer-stepper/shared";
import type { PaceInputProps } from "../pace-input/shared";
import type { Option } from "../select/shared";
import type { TimeInputProps } from "../time-input/shared";
import type { WeightInputFieldProps } from "../weight-input-field/shared";

type SharedTextFieldInputProps = {
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  keyboardType?: TextInputProps["keyboardType"];
  maxLength?: TextInputProps["maxLength"];
  placeholder?: TextInputProps["placeholder"];
  readOnly?: boolean;
  secureTextEntry?: TextInputProps["secureTextEntry"];
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
};

type SharedSwitchFieldProps = {
  className?: string;
};

export interface ControlledFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  rules?: RegisterOptions<TFieldValues, TName>;
  testId?: string;
}

export type FormTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  placeholder?: string;
  parseValue?: (value: string) => FieldPathValue<TFieldValues, TName>;
  formatValue?: (value: FieldPathValue<TFieldValues, TName>) => string;
} & Omit<
    SharedTextFieldInputProps,
    | "accessibilityLabel"
    | "disabled"
    | "editable"
    | "id"
    | "onChange"
    | "onChangeText"
    | "testId"
    | "value"
  >;

export type FormNumberFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  allowDecimal?: boolean;
  formatValue?: (value: FieldPathValue<TFieldValues, TName>) => string;
  max?: number;
  min?: number;
  parseValue?: (value: string) => FieldPathValue<TFieldValues, TName>;
  placeholder?: string;
};

export type FormSwitchFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  switchLabel?: string;
} & Omit<
    SharedSwitchFieldProps,
    "accessibilityLabel" | "checked" | "disabled" | "id" | "onBlur" | "onCheckedChange" | "testId"
  >;

export type FormBoundedNumberFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  helperText?: string;
  min?: number;
  max?: number;
  decimals?: number;
  unitLabel?: string;
  presets?: BoundedNumberInputProps["presets"];
  placeholder?: string;
};

export type FormIntegerStepperFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<
    IntegerStepperProps,
    "error" | "helperText" | "id" | "label" | "onChange" | "testId" | "value"
  >;

export type FormTextareaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  className?: string;
  formatValue?: (value: FieldPathValue<TFieldValues, TName>) => string;
  maxLength?: TextInputProps["maxLength"];
  numberOfLines?: TextInputProps["numberOfLines"];
  parseValue?: (value: string) => FieldPathValue<TFieldValues, TName>;
  placeholder?: TextInputProps["placeholder"];
};

export type FormSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> & {
  formatValue?: (value: FieldPathValue<TFieldValues, TName>) => string | undefined;
  options: Option[];
  parseValue?: (value: string) => FieldPathValue<TFieldValues, TName>;
  placeholder?: string;
};

export type FormDateInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<DateInputProps, "error" | "helperText" | "id" | "label" | "onChange" | "required" | "value">;

export type FormTimeInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<TimeInputProps, "error" | "helperText" | "id" | "label" | "onChange" | "required" | "value">;

export type FormDurationFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<
    DurationInputProps,
    | "error"
    | "helperText"
    | "id"
    | "label"
    | "onChange"
    | "onDurationSecondsChange"
    | "required"
    | "value"
  >;

export type FormPaceFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<
    PaceInputProps,
    | "error"
    | "helperText"
    | "id"
    | "label"
    | "onChange"
    | "onPaceSecondsChange"
    | "required"
    | "value"
  >;

export type FormWeightInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControlledFieldProps<TFieldValues, TName> &
  Omit<
    WeightInputFieldProps,
    "error" | "helperText" | "id" | "label" | "onChangeKg" | "required" | "valueKg"
  >;

export function defaultFormatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}
