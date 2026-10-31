import { useImperativeHandle, useRef } from "react";
import { type TextInput, View } from "react-native";
import { omitUndefined } from "../../lib/omit-undefined";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { NativeQuantityInput } from "../native-quantity-input/index.native";
import { Text } from "../text/index.native";
import type { BoundedNumberInputProps } from "./shared";
import { useBoundedNumberInput } from "./use-bounded-number-input";

/** Native bounded numbers use the shared platform picker; web keeps exact keyboard entry. */
function BoundedNumberInput(props: BoundedNumberInputProps) {
  const bounded =
    Number.isFinite(props.min) &&
    Number.isFinite(props.max) &&
    (props.max ?? 0) >= (props.min ?? 0) &&
    Number.isSafeInteger(Math.ceil(props.min ?? Number.NaN)) &&
    Number.isSafeInteger(Math.ceil(props.max ?? Number.NaN));
  if (!bounded) return <GenericNativeNumberInput {...props} />;
  return (
    <NativeQuantityInput
      label={props.label ?? "Value"}
      value={props.value}
      onChange={props.onChange}
      {...omitUndefined({
        ref: props.ref,
        onNumberChange: props.onNumberChange,
        onInputResult: props.onInputResult,
        onInvalidChange: props.onInvalidChange,
        onBlur: props.onBlur,
        formControl: props.formControl,
        fieldName: props.fieldName,
        resetKey: props.resetKey,
        min: props.min,
        max: props.max,
        decimals: props.decimals,
        precision: props.precision,
        unitLabel: props.unitLabel,
        required: props.required,
        disabled: props.disabled,
        error: props.error,
        helperText: props.helperText,
        accessibilityHint: props.accessibilityHint,
        testId: props.testId ?? props.testID,
        presentation: props.presentation,
        isCurrent: props.isCurrent,
      })}
    />
  );
}

/** Unbounded and malformed legacy descriptors retain a typed input; they are not quantity dials. */
function GenericNativeNumberInput(props: BoundedNumberInputProps) {
  const inputRef = useRef<TextInput>(null);
  const input = useBoundedNumberInput(props, () => inputRef.current?.focus?.());
  useImperativeHandle(props.ref, () => ({ focus: () => inputRef.current?.focus?.() }));
  return (
    <View className="gap-2">
      <Input
        ref={inputRef}
        accessibilityLabel={props.label}
        accessibilityHint={props.accessibilityHint}
        editable={!props.disabled}
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        value={input.text}
        onChangeText={input.change}
        onBlur={input.blur}
        keyboardType={(props.decimals ?? 2) > 0 ? "decimal-pad" : "numeric"}
        placeholder={props.placeholder}
        testId={props.testID ?? props.testId}
      />
      {props.presets?.map((preset) => (
        <Button
          key={preset.label}
          disabled={props.disabled}
          onPress={() => input.change(preset.value)}
        >
          <Text>{preset.label}</Text>
        </Button>
      ))}
      {props.unitLabel ? <Text>{props.unitLabel}</Text> : null}
      {props.error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {props.error}
        </Text>
      ) : null}
    </View>
  );
}

export { BoundedNumberInput };
