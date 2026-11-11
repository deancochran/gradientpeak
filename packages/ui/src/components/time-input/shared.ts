import type { TestProps } from "../../lib/test-props";

export interface TimeInputProps extends TestProps {
  label: string;
  /** Undefined is the controlled empty time value. */
  value?: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled?: boolean | undefined;
  name?: string | undefined;
  helperText?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  placeholder?: string | undefined;
  clearable?: boolean | undefined;
  accessibilityHint?: string | undefined;
  pickerPresentation?: "inline" | "modal" | undefined;
  is24Hour?: boolean | undefined;
}
