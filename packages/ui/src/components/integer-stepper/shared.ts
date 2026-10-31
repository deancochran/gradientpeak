import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
import type { Ref } from "react";
import type { TestProps } from "../../lib/test-props";

export interface IntegerStepperProps extends TestProps {
  label?: string;
  value: number | null | undefined;
  ref?: Ref<{ focus: () => void }>;
  formControl?: object;
  fieldName?: string;
  resetKey?: string | number;
  required?: boolean;
  onBlur?: () => void;
  onInputResult?: (result: NumericInputResult) => void;
  onInvalidChange?: (invalid: boolean) => void;
  onDraftChange?: (raw: string) => void;
  exactDraft?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}
