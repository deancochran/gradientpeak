import type { TestProps } from "../../lib/test-props";

export interface PaceSecondsFieldProps extends TestProps {
  label: string;
  valueSeconds: number | null | undefined;
  onChangeSeconds: (value: number | null) => void;
  error?: string;
  formControl?: object;
  helperText?: string;
  onBlur?: () => void;
  placeholder?: string;
  unitLabel?: string;
  required?: boolean;
}
