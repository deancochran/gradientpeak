import { useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { omitUndefined } from "../../lib/omit-undefined";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Slider } from "../slider/index.native";
import { Text } from "../text/index.native";
import type { PercentSliderInputProps } from "./shared";
import { usePercentSliderInput } from "./use-percent-slider-input";

function PercentSliderInput(props: PercentSliderInputProps) {
  const {
    ref,
    accessibilityHint,
    disabled = false,
    error: providedError,
    helperText,
    id,
    label,
    max = 20,
    min = 0,
    required = false,
    showNumericInput = true,
    step = 0.25,
    testID,
    testId,
  } = props;
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);
  const focus = () => inputRef.current?.focus?.();
  useImperativeHandle(ref, () => ({ focus }));
  const input = usePercentSliderInput(props, focus);
  const error =
    providedError ??
    (input.result.status === "invalid"
      ? `Enter a valid percent from ${min} to ${max}.`
      : undefined);
  const fieldHint = [
    required ? "Required" : undefined,
    accessibilityHint ?? `Enter percent between ${min} and ${max}`,
    helperText,
    error ? `Error: ${error}` : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <View className="gap-2">
      {label ? (
        <Label {...omitUndefined({ nativeID: id })}>
          <Text className="text-sm text-foreground">
            {label}
            {required ? <Text className="text-destructive"> *</Text> : null}
          </Text>
        </Label>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">{min}%</Text>
        <Text className="text-xs font-medium text-foreground">
          {input.display ? `${input.display}%` : "Not set"}
        </Text>
        <Text className="text-xs text-muted-foreground">{max}%</Text>
      </View>
      <Slider
        accessibilityLabel={label ? `${label} slider` : undefined}
        disabled={disabled}
        maximumValue={max}
        minimumValue={min}
        onValueChange={input.slide}
        step={step}
        testId={testId ? `${testId}-slider` : testID ? `${testID}-slider` : undefined}
        value={input.sliderValue}
      />
      {showNumericInput ? (
        <View className="flex-row items-center gap-2">
          <Input
            ref={inputRef}
            accessibilityLabel={label}
            accessibilityHint={fieldHint}
            aria-invalid={!!error}
            accessibilityState={{ disabled }}
            aria-required={required}
            className="flex-1"
            editable={!disabled}
            value={input.text}
            onBlur={input.blur}
            onChangeText={input.change}
            keyboardType="numbers-and-punctuation"
            testId={testId ?? testID}
          />
          <Text className="text-xs text-muted-foreground">%</Text>
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { PercentSliderInput };
