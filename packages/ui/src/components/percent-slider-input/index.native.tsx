import React, { useEffect, useState } from "react";
import { clampNumber, formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Slider } from "../slider/index.native";
import { Text } from "../text/index.native";
import type { PercentSliderInputProps } from "./shared";

function PercentSliderInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  showNumericInput = true,
  step = 0.25,
  value,
}: PercentSliderInputProps) {
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm text-foreground">{label}</Text>
        </Label>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">{min}%</Text>
        <Text className="text-xs font-medium text-foreground">
          {formatNumberForInput(value, decimals)}%
        </Text>
        <Text className="text-xs text-muted-foreground">{max}%</Text>
      </View>
      <Slider
        maximumValue={max}
        minimumValue={min}
        onValueChange={(nextValue) => {
          const clamped = clampNumber(nextValue, min, max);
          const rounded = Number(clamped.toFixed(decimals));
          onChange(rounded);
          setDraftValue(formatNumberForInput(rounded, decimals));
        }}
        step={step}
        value={value}
      />
      {showNumericInput ? (
        <View className="flex-row items-center gap-2">
          <Input
            accessibilityHint={accessibilityHint ?? `Enter percent between ${min} and ${max}`}
            className="flex-1"
            value={draftValue}
            onBlur={() => {
              const parsed = parseBoundedNumber(draftValue, { min, max, decimals });
              if (parsed === undefined) {
                setDraftValue(formatNumberForInput(value, decimals));
                return;
              }
              onChange(parsed);
              setDraftValue(formatNumberForInput(parsed, decimals));
            }}
            onChangeText={setDraftValue}
            keyboardType="numbers-and-punctuation"
          />
          <Text className="text-xs text-muted-foreground">%</Text>
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { PercentSliderInput };
