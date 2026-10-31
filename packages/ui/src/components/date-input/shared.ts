import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface DateInputProps extends TestProps {
  ref?: Ref<{ focus: () => void }> | undefined;
  onBlur?: (() => void) | undefined;
  resetKey?: string | number | undefined;
  formControl?: object | undefined;
  label: string;
  /** Undefined is the controlled empty date value. */
  value?: string | undefined;
  onChange: (value: string | undefined) => void;
  name?: string | undefined;
  helperText?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  minimumDate?: Date | undefined;
  maximumDate?: Date | undefined;
  placeholder?: string | undefined;
  clearable?: boolean | undefined;
  accessibilityHint?: string | undefined;
  pickerPresentation?: "inline" | "modal" | undefined;
  disabled?: boolean | undefined;
}
