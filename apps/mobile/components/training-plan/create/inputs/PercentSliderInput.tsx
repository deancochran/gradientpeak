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

interface PercentSliderInputProps {
  id: string;
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
}

export function PercentSliderInput({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 20,
  step = 0.25,
  decimals = 2,
  helperText,
  error,
  accessibilityHint,
}: PercentSliderInputProps) {
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

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm">{label}</Text>
        </Label>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">{min}%</Text>
        <Text className="text-xs font-medium">
          {formatNumberForInput(value, decimals)}%
        </Text>
        <Text className="text-xs text-muted-foreground">{max}%</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={handleSliderChange}
      />
      <View className="flex-row items-center gap-2">
        <Input
          className="flex-1"
          aria-labelledby={id}
          value={draftValue}
          onChangeText={setDraftValue}
          onBlur={() => commitValue(draftValue)}
          keyboardType="numbers-and-punctuation"
          accessibilityHint={
            accessibilityHint ?? `Enter percent between ${min} and ${max}`
          }
        />
        <Text className="text-xs text-muted-foreground">%</Text>
      </View>
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
