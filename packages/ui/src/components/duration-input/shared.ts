import type { TestProps } from "../../lib/test-props";

export interface DurationInputProps extends TestProps {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  onBlur?: () => void;
  onDurationSecondsChange?: (seconds: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  accessibilityHint?: string;
}
