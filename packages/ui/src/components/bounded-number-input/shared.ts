import type { TestProps } from "../../lib/test-props";

export interface PresetOption {
  label: string;
  value: string;
}

export interface BoundedNumberInputProps extends TestProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onNumberChange?: (value: number | undefined) => void;
  min?: number;
  max?: number;
  decimals?: number;
  unitLabel?: string;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  presets?: PresetOption[];
  accessibilityHint?: string;
}
