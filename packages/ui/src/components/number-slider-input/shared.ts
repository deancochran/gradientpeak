import type { ReactNode } from "react";
import type { TestProps } from "../../lib/test-props";

export interface NumberSliderInputProps extends TestProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Increment used by visible +/- controls. Defaults to `step` when enabled. */
  adjustmentStep?: number;
  /** Canonical adjustment bounds may exceed the slider's practical viewport. */
  adjustmentMin?: number;
  adjustmentMax?: number;
  /** Grid origin for deliberate slider and +/- changes; defaults to zero, not `min`. */
  stepAnchor?: number;
  showAdjustmentButtons?: boolean;
  /** Hide the slider for exact-entry consumers, displaying unrounded values; defaults to true. */
  showSlider?: boolean;
  decimals?: number;
  unitLabel?: string;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
  showNumericInput?: boolean;
  showCurrentValueInRange?: boolean;
  /** Places the current value beside the label and omits endpoint labels. */
  compactHeader?: boolean;
  /** Replaces the visible compact-header label while retaining its current-value control. */
  headerLeading?: ReactNode;
  /** Adds a compact action after the current-value control in a compact header. */
  headerTrailing?: ReactNode;
  /** Replaces the current-value label with a compact exact-entry field when tapped. */
  inlineValueEditor?: boolean;
  /** Canonical bounds for inline entry, independent of the slider's practical viewport. */
  exactValueMin?: number;
  exactValueMax?: number;
  /** Supports values with domain-specific validity beyond numeric bounds. */
  isExactValueValid?: (value: number) => boolean;
  /** Lets a containing form prevent submission while an inline draft is invalid. */
  onExactValueInvalidChange?: (invalid: boolean) => void;
}
