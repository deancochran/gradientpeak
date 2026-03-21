import React, { useEffect, useState } from "react";
import { clampNumber, formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Slider } from "../slider/index.native";
import { Text } from "../text/index.native";
import type { NumberSliderInputProps } from "./shared";

function NumberSliderInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max,
  min,
  onChange,
  showCurrentValueInRange = true,
  showNumericInput = false,
  step,
  unitLabel,
  value,
}: NumberSliderInputProps) {
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  const formatWithUnit = (numericValue: number) => {
    const formatted = formatNumberForInput(numericValue, decimals);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  };

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm text-foreground">{label}</Text>
        </Label>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">{formatWithUnit(min)}</Text>
        {showCurrentValueInRange ? (
          <Text className="text-xs font-medium text-foreground">{formatWithUnit(value)}</Text>
        ) : null}
        <Text className="text-xs text-muted-foreground">{formatWithUnit(max)}</Text>
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
            accessibilityHint={accessibilityHint ?? `Enter a number between ${min} and ${max}`}
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
          {unitLabel ? <Text className="text-xs text-muted-foreground">{unitLabel}</Text> : null}
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { NumberSliderInput };
