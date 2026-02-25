import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import {
  clampNumber,
  formatNumberForInput,
  parseBoundedNumber,
} from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

interface NumberSliderInputProps {
  id: string;
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unitLabel?: string;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
  showNumericInput?: boolean;
  showCurrentValueInRange?: boolean;
}

export function NumberSliderInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  decimals = 2,
  unitLabel,
  helperText,
  error,
  accessibilityHint,
  showNumericInput = false,
  showCurrentValueInRange = true,
}: NumberSliderInputProps) {
  const [draftValue, setDraftValue] = useState(
    formatNumberForInput(value, decimals),
  );

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  const commitValue = (nextValue: string) => {
    const parsed = parseBoundedNumber(nextValue, { min, max, decimals });
    if (parsed === undefined) {
      setDraftValue(formatNumberForInput(value, decimals));
      return;
    }

    onChange(parsed);
    setDraftValue(formatNumberForInput(parsed, decimals));
  };

  const handleSliderChange = (nextValue: number) => {
    const clamped = clampNumber(nextValue, min, max);
    const rounded = Number(clamped.toFixed(decimals));
    onChange(rounded);
    setDraftValue(formatNumberForInput(rounded, decimals));
  };

  const formatWithUnit = (numericValue: number) => {
    const formatted = formatNumberForInput(numericValue, decimals);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  };

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm">{label}</Text>
        </Label>
      ) : null}
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">
          {formatWithUnit(min)}
        </Text>
        {showCurrentValueInRange ? (
          <Text className="text-xs font-medium">{formatWithUnit(value)}</Text>
        ) : null}
        <Text className="text-xs text-muted-foreground">
          {formatWithUnit(max)}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={handleSliderChange}
      />
      {showNumericInput ? (
        <View className="flex-row items-center gap-2">
          <Input
            className="flex-1"
            aria-labelledby={id}
            value={draftValue}
            onChangeText={setDraftValue}
            onBlur={() => commitValue(draftValue)}
            keyboardType="numbers-and-punctuation"
            accessibilityHint={
              accessibilityHint ?? `Enter a number between ${min} and ${max}`
            }
          />
          {unitLabel ? (
            <Text className="text-xs text-muted-foreground">{unitLabel}</Text>
          ) : null}
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
