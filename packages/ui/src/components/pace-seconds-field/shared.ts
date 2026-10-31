import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface PaceSecondsFieldProps extends TestProps {
  ref?: Ref<{ focus: () => void }> | undefined;
  disabled?: boolean | undefined;
  resetKey?: string | number | undefined;
  fieldName?: string | undefined;
  onInputResult?: ((result: NumericInputResult) => void) | undefined;
  label: string;
  valueSeconds: number | null | undefined;
  onChangeSeconds: (value: number | null) => void;
  error?: string | undefined;
  formControl?: object | undefined;
  helperText?: string | undefined;
  onBlur?: (() => void) | undefined;
  placeholder?: string | undefined;
  unitLabel?: string | undefined;
  required?: boolean | undefined;
  showAdjustmentButtons?: boolean | undefined;
}
