import { useEffect, useState } from "react";
import { normalizeDurationInput, parseHmsToSeconds } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { DurationInputProps } from "./shared";

function DurationInput({
  accessibilityHint,
  disabled = false,
  error,
  helperText = "Use h:mm:ss format",
  id,
  label,
  name: _name,
  onBlur,
  onChange,
  onDurationSecondsChange,
  placeholder = "e.g., 1:35:00",
  required = false,
  value,
  testId,
}: DurationInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <View className="gap-2">
      <Label nativeID={id}>
        <Text className="text-sm font-medium text-foreground">
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      </Label>
      <Input
        accessibilityLabel={label}
        accessibilityHint={[
          required ? "Required" : undefined,
          accessibilityHint ?? "Enter a duration in h:mm:ss format",
          helperText,
          error ? `Error: ${error}` : undefined,
        ]
          .filter(Boolean)
          .join(". ")}
        accessibilityState={{ disabled }}
        aria-invalid={!!error}
        aria-required={required}
        className={error ? "border-destructive bg-destructive/5" : undefined}
        editable={!disabled}
        value={draftValue}
        onBlur={() => {
          if (!disabled) {
            const normalized = normalizeDurationInput(draftValue);
            if (normalized) {
              if (normalized !== draftValue) {
                setDraftValue(normalized);
                onChange(normalized);
              }
              onDurationSecondsChange?.(parseHmsToSeconds(normalized));
            }
          }
          onBlur?.();
        }}
        onChangeText={(nextValue) => {
          if (disabled) return;
          setDraftValue(nextValue);
          onChange(nextValue);
          onDurationSecondsChange?.(parseHmsToSeconds(nextValue));
        }}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        testId={testId}
      />
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { DurationInput };
