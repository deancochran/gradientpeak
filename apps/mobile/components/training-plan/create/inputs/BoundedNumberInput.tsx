import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  formatNumberForInput,
  parseBoundedNumber,
} from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

interface PresetOption {
  label: string;
  value: string;
}

interface BoundedNumberInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onNumberChange?: (value: number | undefined) => void;
  min?: number;
  max?: number;
  decimals?: number;
  unitLabel?: string;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  presets?: PresetOption[];
  accessibilityHint?: string;
}

export function BoundedNumberInput({
  id,
  label,
  value,
  onChange,
  onNumberChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  decimals = 2,
  unitLabel,
  helperText,
  error,
  placeholder,
  required = false,
  presets,
  accessibilityHint,
}: BoundedNumberInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitValue = (nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      setDraftValue("");
      onChange("");
      onNumberChange?.(undefined);
      return;
    }

    const parsed = parseBoundedNumber(trimmed, { min, max, decimals });
    if (parsed === undefined) {
      return;
    }

    const normalized = formatNumberForInput(parsed, decimals);
    setDraftValue(normalized);
    onChange(normalized);
    onNumberChange?.(parsed);
  };

  const handleTextChange = (nextValue: string) => {
    setDraftValue(nextValue);
    onChange(nextValue);
    onNumberChange?.(
      parseBoundedNumber(nextValue, {
        min,
        max,
        decimals,
      }),
    );
  };

  return (
    <View className="gap-2">
      <Label nativeID={id}>
        <Text className="text-sm font-medium">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <View className="flex-row items-center gap-2">
        <Input
          className="flex-1"
          aria-labelledby={id}
          value={draftValue}
          onChangeText={handleTextChange}
          onBlur={() => commitValue(draftValue)}
          keyboardType="numbers-and-punctuation"
          placeholder={placeholder}
          accessibilityHint={
            accessibilityHint ?? `Enter a number between ${min} and ${max}`
          }
        />
        {unitLabel ? (
          <Text className="text-xs text-muted-foreground">{unitLabel}</Text>
        ) : null}
      </View>
      {presets?.length ? (
        <View className="flex-row flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={`${id}-${preset.label}`}
              variant={value === preset.value ? "default" : "outline"}
              size="sm"
              onPress={() => commitValue(preset.value)}
              accessibilityLabel={`${label} preset ${preset.label}`}
            >
              <Text>{preset.label}</Text>
            </Button>
          ))}
        </View>
      ) : null}
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
