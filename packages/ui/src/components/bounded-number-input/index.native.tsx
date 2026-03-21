import React, { useEffect, useState } from "react";
import { formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { BoundedNumberInputProps } from "./shared";

function BoundedNumberInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onChange,
  onNumberChange,
  placeholder,
  presets,
  required = false,
  unitLabel,
  value,
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

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm font-medium text-foreground">
            {label}
            {required ? <Text className="text-destructive"> *</Text> : null}
          </Text>
        </Label>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint ?? `Enter a number between ${min} and ${max}`}
          className={error ? "flex-1 border-destructive bg-destructive/5" : "flex-1"}
          value={draftValue}
          onBlur={() => commitValue(draftValue)}
          onChangeText={(nextValue) => {
            setDraftValue(nextValue);
            onChange(nextValue);
            onNumberChange?.(
              parseBoundedNumber(nextValue, {
                min,
                max,
                decimals,
              }),
            );
          }}
          keyboardType="numbers-and-punctuation"
          placeholder={placeholder}
        />
        {unitLabel ? <Text className="text-xs text-muted-foreground">{unitLabel}</Text> : null}
      </View>
      {presets?.length ? (
        <View className="flex-row flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={`${id}-${preset.label}`}
              size="sm"
              variant={value === preset.value ? "default" : "outline"}
              onPress={() => commitValue(preset.value)}
            >
              <Text>{preset.label}</Text>
            </Button>
          ))}
        </View>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { BoundedNumberInput };
