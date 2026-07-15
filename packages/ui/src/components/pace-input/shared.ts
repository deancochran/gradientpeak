import type { TestProps } from "../../lib/test-props";

export interface PaceInputProps extends TestProps {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  onBlur?: () => void;
  onPaceSecondsChange?: (secondsPerKm: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  unitLabel?: string;
  accessibilityHint?: string;
}
