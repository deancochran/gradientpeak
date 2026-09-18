import {
  formatNumberForInput,
  parseBoundedNumber,
  parseNumberOrUndefined,
} from "@repo/core/utils/fitness-inputs";
import { nudgeNumberByStep } from "@repo/core/utils/numeric-ux-policy";
import { type Ref, useImperativeHandle, useRef } from "react";
import { type TextInput, View } from "react-native";
import { useInputDraft } from "../../hooks/use-input-draft";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { BoundedNumberInputProps } from "./shared";

function BoundedNumberInput({
  ref,
  accessibilityHint,
  adjustmentStep,
  clampProjection = true,
  decimals = 2,
  disabled = false,
  error,
  helperText,
  id,
  label,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onChange,
  onInvalidChange,
  onBlur,
  onNumberChange,
  placeholder,
  presets,
  required = false,
  resetKey,
  showAdjustmentButtons = false,
  stepAnchor = 0,
  testID,
  testId,
  unitLabel,
  value,
}: BoundedNumberInputProps & { ref?: Ref<{ focus: () => void }> }) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus?.() }));
  const [draftValue, setDraftValue] = useInputDraft(value, resetKey);
  const parseProjection = (nextValue: string) => {
    const parsed = clampProjection
      ? parseBoundedNumber(nextValue, { min, max, decimals })
      : parseNumberOrUndefined(nextValue);
    return parsed === undefined ||
      (!clampProjection &&
        (parsed < min || parsed > max || (decimals === 0 && !Number.isInteger(parsed))))
      ? undefined
      : parsed;
  };
  const parsedValue = parseProjection(draftValue);
  const fieldHint = [
    required ? "Required" : undefined,
    accessibilityHint ?? `Enter a number between ${min} and ${max}`,
    helperText,
    error ? `Error: ${error}` : undefined,
  ]
    .filter(Boolean)
    .join(". ");

  const commitValue = (nextValue: string) => {
    if (disabled) {
      return;
    }

    const trimmed = nextValue.trim();
    if (!trimmed) {
      setDraftValue("");
      onChange("");
      onNumberChange?.(undefined);
      onInvalidChange?.(false);
      return;
    }

    const parsed = parseProjection(trimmed);
    if (parsed === undefined) {
      onInvalidChange?.(true);
      return;
    }

    const normalized = clampProjection ? formatNumberForInput(parsed, decimals) : String(parsed);
    setDraftValue(normalized);
    onChange(normalized);
    onNumberChange?.(parsed);
    onInvalidChange?.(false);
  };
  const adjust = (direction: -1 | 1) => {
    if (disabled || adjustmentStep === undefined || parsedValue === undefined) return;
    commitValue(
      String(
        nudgeNumberByStep(parsedValue, direction, {
          min,
          max,
          step: adjustmentStep,
          anchor: stepAnchor,
        }),
      ),
    );
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
        {showAdjustmentButtons ? (
          <Button
            accessibilityLabel={`Decrease ${label ?? "value"}`}
            disabled={
              disabled ||
              adjustmentStep === undefined ||
              parsedValue === undefined ||
              parsedValue <= min
            }
            onPress={() => adjust(-1)}
            size="sm"
            variant="outline"
          >
            <Text>-</Text>
          </Button>
        ) : null}
        <Input
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={fieldHint}
          className={error ? "flex-1 border-destructive bg-destructive/5" : "flex-1"}
          editable={!disabled}
          accessibilityState={{ disabled }}
          aria-invalid={!!error}
          aria-required={required}
          value={draftValue}
          onBlur={() => {
            commitValue(draftValue);
            onBlur?.();
          }}
          onChangeText={(nextValue) => {
            if (disabled) {
              return;
            }

            const parsed = parseProjection(nextValue);
            setDraftValue(nextValue, [parsed === undefined ? "" : String(parsed)]);
            onChange(nextValue);
            onNumberChange?.(parsed);
            onInvalidChange?.(nextValue.trim() !== "" && parsed === undefined);
          }}
          keyboardType={decimals > 0 ? "decimal-pad" : "numeric"}
          placeholder={placeholder}
          testId={testID ?? testId}
        />
        {unitLabel ? <Text className="text-xs text-muted-foreground">{unitLabel}</Text> : null}
        {showAdjustmentButtons ? (
          <Button
            accessibilityLabel={`Increase ${label ?? "value"}`}
            disabled={
              disabled ||
              adjustmentStep === undefined ||
              parsedValue === undefined ||
              parsedValue >= max
            }
            onPress={() => adjust(1)}
            size="sm"
            variant="outline"
          >
            <Text>+</Text>
          </Button>
        ) : null}
      </View>
      {presets?.length ? (
        <View className="flex-row flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={`${id}-${preset.label}`}
              size="sm"
              variant={value === preset.value ? "default" : "outline"}
              disabled={disabled}
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
