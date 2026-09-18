import type { WeightUnit } from "@repo/core/utils/fitness-inputs";
import type { TestProps } from "../../lib/test-props";

export interface WeightInputFieldProps extends TestProps {
  label: string;
  valueKg: number | null | undefined;
  /** Change to discard an editable draft even when the numeric value is unchanged. */
  resetKey?: string | number;
  onChangeKg: (valueKg: number | null) => void;
  unit: WeightUnit;
  onUnitChange?: (unit: WeightUnit) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
}
