import type { TestProps } from "../../lib/test-props";

export interface PaceSecondsFieldProps extends TestProps {
  label: string;
  valueSeconds: number | null | undefined;
  onChangeSeconds: (value: number | null) => void;
  helperText?: string;
  placeholder?: string;
  unitLabel?: string;
  required?: boolean;
}
