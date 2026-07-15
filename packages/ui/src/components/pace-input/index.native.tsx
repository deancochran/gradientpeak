import { useEffect, useState } from "react";
import { normalizePaceInput, parseMmSsToSeconds } from "../../lib/fitness-inputs";
import { View } from "../../lib/react-native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { PaceInputProps } from "./shared";

function PaceInput({
  accessibilityHint,
  disabled = false,
  error,
  helperText = "Use mm:ss per kilometer",
  id,
  label,
  name: _name,
  onBlur,
  onChange,
  onPaceSecondsChange,
  placeholder = "e.g., 4:15",
  required = false,
  unitLabel = "/km",
  value,
  testId,
}: PaceInputProps) {
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
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel={label}
          accessibilityHint={[
            required ? "Required" : undefined,
            accessibilityHint ?? "Enter pace in mm:ss format, for example 4:15",
            helperText,
            error ? `Error: ${error}` : undefined,
          ]
            .filter(Boolean)
            .join(". ")}
          accessibilityState={{ disabled }}
          aria-invalid={!!error}
          aria-required={required}
          className={error ? "flex-1 border-destructive bg-destructive/5" : "flex-1"}
          editable={!disabled}
          value={draftValue}
          onBlur={() => {
            if (!disabled) {
              const normalized = normalizePaceInput(draftValue);
              if (normalized) {
                if (normalized !== draftValue) {
                  setDraftValue(normalized);
                  onChange(normalized);
                }
                onPaceSecondsChange?.(parseMmSsToSeconds(normalized));
              }
            }
            onBlur?.();
          }}
          onChangeText={(nextValue) => {
            if (disabled) return;
            setDraftValue(nextValue);
            onChange(nextValue);
            onPaceSecondsChange?.(parseMmSsToSeconds(nextValue));
          }}
          keyboardType="numbers-and-punctuation"
          placeholder={placeholder}
          testId={testId}
        />
        <Text className="text-xs text-muted-foreground">{unitLabel}</Text>
      </View>
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { PaceInput };
