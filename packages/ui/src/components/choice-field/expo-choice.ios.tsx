import { Button, Host, Picker, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  disabled,
  frame,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { type ChoiceControlProps, type ChoiceValue, resolveChoice } from "./shared";

export function ExpoChoiceControl<T extends ChoiceValue>(props: ChoiceControlProps<T>) {
  const selected = resolveChoice(props.value, props.options);
  const index = props.options.findIndex(
    (option) => option.value === props.value && !option.disabled,
  );
  // InlinePickerStyle is contextual to Form/List. Native buttons in a VStack
  // guarantee immediate choices outside those containers, without a nested menu.
  // Also keep an empty segmented field unselected without adding a third segment.
  const rows = props.mode === "list" || (props.mode === "segmented" && selected.status !== "valid");
  return (
    <Host
      matchContents={{ vertical: true }}
      style={{ width: "100%", minHeight: 48 }}
      ignoreSafeArea="all"
    >
      {rows ? (
        <VStack alignment="leading" spacing={8}>
          {props.options.map((option) => (
            <Button
              key={`${typeof option.value}:${option.value}`}
              label={option.label}
              systemImage={props.value === option.value ? "checkmark.circle.fill" : "circle"}
              modifiers={[
                buttonStyle("plain"),
                frame({ minHeight: 44, alignment: "leading" }),
                accessibilityLabel(option.label),
                accessibilityHint(option.description ?? props.label),
                accessibilityAddTraits(props.value === option.value ? ["isSelected"] : []),
                disabled(Boolean(props.disabled || option.disabled)),
              ]}
              onPress={() => {
                if (!props.disabled && !option.disabled) props.onChange(option.value);
              }}
            />
          ))}
        </VStack>
      ) : (
        <Picker<number>
          label={props.label}
          selection={index}
          modifiers={[
            pickerStyle(props.mode === "segmented" ? "segmented" : "menu"),
            accessibilityLabel(props.label),
            disabled(Boolean(props.disabled)),
          ]}
          onSelectionChange={(position) => {
            const option = props.options[position];
            if (!props.disabled && option && !option.disabled) props.onChange(option.value);
          }}
        >
          {props.mode === "menu" && selected.status !== "valid" ? (
            <Text modifiers={[tag(-1), disabled(true)]}>Choose {props.label.toLowerCase()}</Text>
          ) : null}
          {props.options.map((option, position) => (
            <Text
              key={`${typeof option.value}:${option.value}`}
              modifiers={[tag(position), disabled(Boolean(option.disabled))]}
            >
              {option.label}
            </Text>
          ))}
        </Picker>
      )}
    </Host>
  );
}
