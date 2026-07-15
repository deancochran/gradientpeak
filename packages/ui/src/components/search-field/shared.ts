export interface SearchFieldProps {
  accessibilityLabel: string;
  className?: string;
  clearTestId?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  maxLength?: number;
  name?: string;
  onSubmit?: () => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  testId?: string;
  value: string;
}
