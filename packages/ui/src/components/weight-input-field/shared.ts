import type { WeightUnit } from "../../lib/fitness-inputs";
import type { TestProps } from "../../lib/test-props";

export interface WeightInputFieldProps extends TestProps {
  label: string;
  valueKg: number | null | undefined;
  onChangeKg: (valueKg: number | null) => void;
  unit: WeightUnit;
  onUnitChange?: (unit: WeightUnit) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
}
