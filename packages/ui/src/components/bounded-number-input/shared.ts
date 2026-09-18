import type { TestProps } from "../../lib/test-props";

export interface PresetOption {
  label: string;
  value: string;
}

export interface BoundedNumberInputProps extends TestProps {
  label?: string;
  value: string;
  /** Change when explicitly resetting even if the controlled value is unchanged. */
  resetKey?: string | number;
  onChange: (value: string) => void;
  /** Bounded numeric projection; the editable string is preserved until blur. */
  onNumberChange?: (value: number | undefined) => void;
  /** Reports whether the visible draft is nonblank but not a valid bounded number. */
  onInvalidChange?: (invalid: boolean) => void;
  /** Opt out of legacy range clamping when projecting a typed draft. */
  clampProjection?: boolean;
  name?: string;
  min?: number;
  max?: number;
  decimals?: number;
  unitLabel?: string;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  presets?: PresetOption[];
  /** Optional deliberate +/- adjustments; typed values remain free-form drafts. */
  adjustmentStep?: number;
  stepAnchor?: number;
  showAdjustmentButtons?: boolean;
  accessibilityHint?: string;
  disabled?: boolean;
  onBlur?: () => void;
}
