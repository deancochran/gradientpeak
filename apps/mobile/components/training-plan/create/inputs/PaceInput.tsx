import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  normalizePaceInput,
  parseMmSsToSeconds,
} from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

interface PaceInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPaceSecondsChange?: (secondsPerKm: number | undefined) => void;
  helperText?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  accessibilityHint?: string;
}

export function PaceInput({
  id,
  label,
  value,
  onChange,
  onPaceSecondsChange,
  helperText = "Use mm:ss per kilometer",
  error,
  placeholder = "e.g., 4:15",
  required = false,
  accessibilityHint,
}: PaceInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const handleTextChange = (nextValue: string) => {
    setDraftValue(nextValue);
    onChange(nextValue);
    onPaceSecondsChange?.(parseMmSsToSeconds(nextValue));
  };

  const handleBlur = () => {
    const normalized = normalizePaceInput(draftValue);
    if (!normalized) {
      return;
    }

    if (normalized !== draftValue) {
      setDraftValue(normalized);
      onChange(normalized);
    }
    onPaceSecondsChange?.(parseMmSsToSeconds(normalized));
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
          onBlur={handleBlur}
          keyboardType="numbers-and-punctuation"
          placeholder={placeholder}
          accessibilityHint={
            accessibilityHint ?? "Enter pace in mm:ss format, for example 4:15"
          }
        />
        <Text className="text-xs text-muted-foreground">/km</Text>
      </View>
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
