import type { NumericInputPrecision, NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface PresetOption {
  label: string;
  value: string;
}

export interface BoundedNumberInputProps extends TestProps {
  ref?: Ref<{ focus: () => void }> | undefined;
  formControl?: object | undefined;
  fieldName?: string | undefined;
  onInputResult?: ((result: NumericInputResult) => void) | undefined;
  precision?: NumericInputPrecision | undefined;
  label?: string | undefined;
  value: string;
  /** Change when explicitly resetting even if the controlled value is unchanged. */
  resetKey?: string | number | undefined;
  onChange: (value: string) => void;
  /** Bounded numeric projection; the editable string is preserved until blur. */
  onNumberChange?: ((value: number | undefined) => void) | undefined;
  /** Reports whether the visible draft is nonblank but not a valid bounded number. */
  onInvalidChange?: ((invalid: boolean) => void) | undefined;
  /** @deprecated Typed input is never clamped. Bounds apply only to explicit adjustments. */
  clampProjection?: boolean | undefined;
  name?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  decimals?: number | undefined;
  unitLabel?: string | undefined;
  helperText?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  presets?: PresetOption[] | undefined;
  /** Optional deliberate +/- adjustments; typed values remain free-form drafts. */
  adjustmentStep?: number | undefined;
  stepAnchor?: number | undefined;
  showAdjustmentButtons?: boolean | undefined;
  /** Native panel composition renders picker columns in an already-open owner. */
  presentation?: "overlay" | "panel" | undefined;
  isCurrent?: (() => boolean) | undefined;
  accessibilityHint?: string | undefined;
  disabled?: boolean | undefined;
  onBlur?: (() => void) | undefined;
}
