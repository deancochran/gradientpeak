import React, { useEffect, useState } from "react";
import { clampInteger, parseBoundedInteger } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { IntegerStepperProps } from "./shared";

function IntegerStepper({
  accessibilityHint,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  step = 1,
  value,
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

  return (
    <View className="gap-2">
      {label ? (
        <Label nativeID={id}>
          <Text className="text-sm font-medium text-foreground">{label}</Text>
        </Label>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() => onChange(clampInteger(value - step, min, max))}
        >
          <Text>-</Text>
        </Button>
        <Input
          accessibilityHint={accessibilityHint ?? `Enter whole number between ${min} and ${max}`}
          className="flex-1 text-center"
          value={draftValue}
          onBlur={() => commitDraft(draftValue)}
          onChangeText={setDraftValue}
          keyboardType="numeric"
        />
        <Button
          variant="outline"
          size="sm"
          onPress={() => onChange(clampInteger(value + step, min, max))}
        >
          <Text>+</Text>
        </Button>
      </View>
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { IntegerStepper };
