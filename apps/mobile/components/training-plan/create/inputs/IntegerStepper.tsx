import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  clampInteger,
  parseBoundedInteger,
} from "@/lib/training-plan-form/input-parsers";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

interface IntegerStepperProps {
  id: string;
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helperText?: string;
  error?: string;
  accessibilityHint?: string;
}

export function IntegerStepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 20,
  step = 1,
  helperText,
  error,
  accessibilityHint,
}: IntegerStepperProps) {
  const labelText = label || "value";
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitDraft = (nextDraft: string) => {
    const parsed = parseBoundedInteger(nextDraft, { min, max });
    if (parsed === undefined) {
      setDraftValue(String(value));
      return;
    }

    const normalized = clampInteger(parsed, min, max);
    setDraftValue(String(normalized));
    onChange(normalized);
  };

  const decrement = () => {
    onChange(clampInteger(value - step, min, max));
  };

  const increment = () => {
    onChange(clampInteger(value + step, min, max));
  };

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm font-medium">{label}</Text>
        </Label>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={decrement}
          accessibilityLabel={`Decrease ${labelText}`}
        >
          <Text>-</Text>
        </Button>
        <Input
          className="flex-1 text-center"
          aria-labelledby={id}
          value={draftValue}
          onChangeText={setDraftValue}
          onBlur={() => commitDraft(draftValue)}
          keyboardType="numeric"
          accessibilityHint={
            accessibilityHint ?? `Enter whole number between ${min} and ${max}`
          }
        />
        <Button
          variant="outline"
          size="sm"
          onPress={increment}
          accessibilityLabel={`Increase ${labelText}`}
        >
          <Text>+</Text>
        </Button>
      </View>
      {helperText ? (
        <Text className="text-xs text-muted-foreground">{helperText}</Text>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
