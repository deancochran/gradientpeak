import { NativePicker } from "../native-picker/index.native";
import type { ChoiceControlProps, ChoiceValue } from "./shared";

/** Unsupported native platforms only. Metro selects .ios/.android on mobile. */
export function ExpoChoiceControl<T extends ChoiceValue>(props: ChoiceControlProps<T>) {
  return (
    <NativePicker
      label={props.label}
      value={props.value ?? ""}
      options={props.options.filter((option) => !option.disabled)}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      {...(props.testId === undefined ? {} : { testID: props.testId })}
      onChange={(value) => {
        const option = props.options.find((candidate) => candidate.value === value);
        if (option && !option.disabled) props.onChange(option.value);
      }}
    />
  );
}
