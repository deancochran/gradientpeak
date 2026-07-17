import {
  SearchField as SharedSearchField,
  type SearchFieldProps as SharedSearchFieldProps,
} from "@repo/ui/components/search-field";

export type MobileSearchFieldProps = Omit<
  SharedSearchFieldProps,
  "disabled" | "onValueChange" | "testId"
> & {
  disabled?: boolean;
  editable?: boolean;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  testID?: string;
};

export function SearchField({
  disabled,
  editable,
  onChangeText,
  onClear,
  testID,
  ...props
}: MobileSearchFieldProps) {
  return (
    <SharedSearchField
      {...props}
      disabled={disabled || editable === false}
      onValueChange={(value) => {
        if (value.length === 0 && onClear) {
          onClear();
          return;
        }
        onChangeText(value);
      }}
      testId={testID}
    />
  );
}

export { SharedSearchField };
