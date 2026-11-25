import type { DurationSegmentPolicy } from "@repo/core/utils/fitness-inputs";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface DurationInputProps extends TestProps, DurationSegmentPolicy {
  ref?: Ref<{ focus: () => void }>;
  formControl?: object;
  fieldName?: string;
  resetKey?: string | number;
  onInvalidChange?: (invalid: boolean) => void;
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  onBlur?: () => void;
  onDurationSecondsChange?: (seconds: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  accessibilityHint?: string;
}
