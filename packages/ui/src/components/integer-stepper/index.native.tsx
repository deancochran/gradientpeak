import {
  clampInteger,
  parseBoundedInteger,
  parseNumberOrUndefined,
} from "@repo/core/utils/fitness-inputs";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Text } from "../text/index.native";
import type { IntegerStepperProps } from "./shared";

interface NativeIntegerStepperProps extends IntegerStepperProps {
  ref?: Ref<{ focus: () => void }>;
  presentation?: "default" | "tactile";
  onInvalidChange?: (invalid: boolean) => void;
  onDraftChange?: (draft: string) => void;
  exactDraft?: string;
}

function IntegerStepper({
  accessibilityHint,
  disabled = false,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  step = 1,
  testId,
  value,
  ref,
  presentation = "default",
  onInvalidChange,
  onDraftChange,
  exactDraft,
}: NativeIntegerStepperProps) {
  const [exact, setExact] = useState(exactDraft !== undefined);
  const input = useRef<React.ComponentRef<typeof Input>>(null);
  const [focusRequested, setFocusRequested] = useState(false);
  useImperativeHandle(ref, () => ({
    focus: () => {
      setExact(true);
      setFocusRequested(true);
    },
  }));
  useEffect(() => {
    if (focusRequested && exact) {
      input.current?.focus?.();
      setFocusRequested(false);
    }
  }, [focusRequested, exact]);
  const labelText = label || "value";
  const normalizedStep = Number.isInteger(step) && step > 0 ? step : 1;
  const [localDraftValue, setDraftValue] = useState(String(value));
  const draftValue = exactDraft ?? localDraftValue;

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitDraft = (nextDraft: string) => {
    if (disabled) {
      return;
    }

    const parsed = parseBoundedInteger(nextDraft, { min, max });
    if (parsed === undefined) {
      if (presentation === "default") setDraftValue(String(value));
      return;
    }

    const normalized = clampInteger(parsed, min, max);
    setDraftValue(String(normalized));
    onChange(normalized);
  };

  const parseDraft = (raw: string) => {
    if (presentation === "default") return parseBoundedInteger(raw, { min, max });
    const parsed = parseNumberOrUndefined(raw);
    return parsed !== undefined && Number.isInteger(parsed) && parsed >= min && parsed <= max
      ? parsed
      : undefined;
  };
  const parsedDraft = parseDraft(draftValue);
  const currentValue = parsedDraft ?? value;
  const decreaseValue = clampInteger(currentValue - normalizedStep, min, max);
  const increaseValue = clampInteger(currentValue + normalizedStep, min, max);
  const invalid = parsedDraft === undefined;
  const decreaseDisabled =
    disabled || decreaseValue === currentValue || (presentation === "tactile" && invalid);
  const increaseDisabled =
    disabled || increaseValue === currentValue || (presentation === "tactile" && invalid);
  const changeValue = (nextValue: number, isChangeDisabled: boolean) => {
    if (isChangeDisabled) {
      return;
    }

    setDraftValue(String(nextValue));
    onDraftChange?.(String(nextValue));
    onInvalidChange?.(false);
    onChange(nextValue);
  };

  return (
    <View className="gap-2">
      {label ? (
        <Label {...(id ? { nativeID: id } : {})}>
          <Text className="text-sm font-medium text-foreground">{label}</Text>
        </Label>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Button
          accessibilityLabel={`Decrease ${labelText}`}
          disabled={decreaseDisabled}
          variant="outline"
          className={presentation === "tactile" ? "min-h-12 min-w-12" : "min-h-11 min-w-11"}
          size="sm"
          onPress={() => {
            if (!decreaseDisabled) {
              changeValue(decreaseValue, decreaseDisabled);
            }
          }}
        >
          <Text>-</Text>
        </Button>
        {presentation === "tactile" && !exact ? (
          <Text
            accessibilityLabel={`${labelText}: ${draftValue}`}
            className="flex-1 text-center text-2xl font-semibold"
          >
            {draftValue} {labelText}
          </Text>
        ) : (
          <Input
            ref={input}
            accessibilityHint={accessibilityHint ?? `Enter whole number between ${min} and ${max}`}
            accessibilityLabel={labelText}
            accessibilityState={{ disabled }}
            accessibilityValue={{ max, min, now: currentValue }}
            className="flex-1 text-center"
            editable={!disabled}
            value={draftValue}
            onBlur={() => {
              if (presentation === "default") commitDraft(draftValue);
            }}
            onChangeText={(nextDraft) => {
              if (!disabled) {
                setDraftValue(nextDraft);
                if (presentation === "tactile") {
                  onDraftChange?.(nextDraft);
                  const parsed = parseDraft(nextDraft);
                  onInvalidChange?.(parsed === undefined);
                  if (parsed !== undefined) onChange(parsed);
                }
              }
            }}
            keyboardType="numeric"
            {...(testId ? { testId } : {})}
          />
        )}
        <Button
          accessibilityLabel={`Increase ${labelText}`}
          disabled={increaseDisabled}
          variant="outline"
          className={presentation === "tactile" ? "min-h-12 min-w-12" : "min-h-11 min-w-11"}
          size="sm"
          onPress={() => {
            if (!increaseDisabled) {
              changeValue(increaseValue, increaseDisabled);
            }
          }}
        >
          <Text>+</Text>
        </Button>
      </View>
      {presentation === "tactile" ? (
        <Button
          variant="ghost"
          disabled={disabled}
          onPress={() => {
            if (!exact || !invalid) setExact(!exact);
          }}
          accessibilityLabel={exact ? `Use ${labelText} buttons` : `Enter exact ${labelText}`}
        >
          <Text>{exact ? "Use buttons" : "Enter exact value"}</Text>
        </Button>
      ) : null}
      {presentation === "tactile" && invalid ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Enter a whole number from {min} to {max}.
        </Text>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { IntegerStepper };
