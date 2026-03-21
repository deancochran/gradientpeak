import type { TestProps } from "../../lib/test-props";

export interface PercentSliderInputProps extends TestProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
  showNumericInput?: boolean;
}
