import type { TestProps } from "../../lib/test-props";

export interface IntegerStepperProps extends TestProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
}
