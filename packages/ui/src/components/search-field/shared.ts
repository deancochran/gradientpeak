export interface SearchFieldProps {
  accessibilityLabel: string;
  className?: string;
  clearTestId?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  maxLength?: number;
  onSubmit?: () => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  testId?: string;
  value: string;
}

export interface SearchFieldWebProps extends SearchFieldProps {
  name?: string;
}
