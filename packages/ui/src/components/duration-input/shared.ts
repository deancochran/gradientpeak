import type { TestProps } from "../../lib/test-props";

export interface DurationInputProps extends TestProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDurationSecondsChange?: (seconds: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  accessibilityHint?: string;
}
