import type { TestProps } from "../../lib/test-props";

export interface PaceInputProps extends TestProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPaceSecondsChange?: (secondsPerKm: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  unitLabel?: string;
  accessibilityHint?: string;
}
