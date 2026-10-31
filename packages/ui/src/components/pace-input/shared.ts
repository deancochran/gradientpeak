import type { PaceSegmentLayout } from "@repo/core/utils/fitness-inputs";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface PaceInputProps extends TestProps {
  /** Render wheels in an already-owned field surface instead of opening a Modal. */
  presentation?: "native" | "native-overlay" | undefined;
  layout?: PaceSegmentLayout | undefined;
  ref?: Ref<{ focus: () => void }> | undefined;
  resetKey?: string | number | undefined;
  formControl?: object | undefined;
  fieldName?: string | undefined;
  disabled?: boolean | undefined;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string | undefined;
  onBlur?: (() => void) | undefined;
  onPaceSecondsChange?: ((secondsPerKm: number | undefined) => void) | undefined;
  helperText?: string | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  unitLabel?: string | undefined;
  accessibilityHint?: string | undefined;
  /** Compact, labelled summary row for a form that owns the surrounding section. */
  triggerVariant?: "input" | "row" | undefined;
}
