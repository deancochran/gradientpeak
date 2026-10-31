import type { NumericInputPrecision, NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface PercentSliderInputProps extends TestProps {
  label?: string;
  value: number | null | undefined;
  ref?: Ref<{ focus: () => void }>;
  formControl?: object;
  fieldName?: string;
  resetKey?: string | number;
  precision?: NumericInputPrecision;
  onBlur?: () => void;
  onInputResult?: (result: NumericInputResult) => void;
  onInvalidChange?: (invalid: boolean) => void;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  required?: boolean;
  showNumericInput?: boolean;
}
