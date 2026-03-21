import type { TestProps } from "../../lib/test-props";

export interface DateInputProps extends TestProps {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  clearable?: boolean;
  accessibilityHint?: string;
  pickerPresentation?: "inline" | "modal";
}
