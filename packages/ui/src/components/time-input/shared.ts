import type { TestProps } from "../../lib/test-props";

export interface TimeInputProps extends TestProps {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  name?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  clearable?: boolean;
  accessibilityHint?: string;
  pickerPresentation?: "inline" | "modal";
  is24Hour?: boolean;
}
