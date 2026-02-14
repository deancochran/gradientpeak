import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  normalizeDurationInput,
  parseHmsToSeconds,
} from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

interface DurationInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDurationSecondsChange?: (seconds: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  accessibilityHint?: string;
}

export function DurationInput({
  id,
  label,
  value,
  onChange,
  onDurationSecondsChange,
  helperText = "Use h:mm:ss format",
  error,
  placeholder = "e.g., 1:35:00",
  required = false,
  accessibilityHint,
}: DurationInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const handleTextChange = (nextValue: string) => {
    setDraftValue(nextValue);
    onChange(nextValue);
    onDurationSecondsChange?.(parseHmsToSeconds(nextValue));
  };

  const handleBlur = () => {
    const normalized = normalizeDurationInput(draftValue);
    if (!normalized) {
      return;
    }

    if (normalized !== draftValue) {
      setDraftValue(normalized);
      onChange(normalized);
    }
    onDurationSecondsChange?.(parseHmsToSeconds(normalized));
  };

  return (
    <View className="gap-2">
      <Label nativeID={id}>
        <Text className="text-sm font-medium">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <Input
        aria-labelledby={id}
        value={draftValue}
        onChangeText={handleTextChange}
        onBlur={handleBlur}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        accessibilityHint={
          accessibilityHint ?? "Enter a duration in h:mm:ss format"
        }
      />
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
