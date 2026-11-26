import {
  clampNumber,
  formatNumberForInput,
  parseBoundedNumber,
  parseNumberOrUndefined,
} from "@repo/core/utils/fitness-inputs";
import { alignNumberToStep, nudgeNumberByStep } from "@repo/core/utils/numeric-ux-policy";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";
import { Input } from "../input/index.native";
import { Label } from "../label/index.native";
import { Slider } from "../slider/index.native";
import { Text } from "../text/index.native";
import type { NumberSliderInputProps } from "./shared";

function NumberSliderInput({
  ref,
  accessibilityHint,
  adjustmentMax,
  adjustmentMin,
  adjustmentStep,
  compactHeader = false,
  decimals = 2,
  error,
  exactValueMax,
  exactValueMin,
  headerLeading,
  headerTrailing,
  helperText,
  id,
  inlineValueEditor = false,
  isExactValueValid,
  label,
  max,
  min,
  onChange,
  onExactValueInvalidChange,
  showCurrentValueInRange = true,
  showAdjustmentButtons = false,
  showNumericInput = false,
  showSlider = true,
  step,
  stepAnchor = 0,
  testId,
  unitLabel,
  value,
  exactDraft,
  onExactDraftChange,
  alwaysShowInput = false,
  isCurrent,
}: NumberSliderInputProps & {
  ref?: Ref<{ focus: () => void }>;
  /** Owner-held raw text survives native modal teardown. */
  exactDraft?: string;
  onExactDraftChange?: (draft: string) => void;
  alwaysShowInput?: boolean;
  isCurrent?: () => boolean;
}) {
  const canonicalMaximum = exactValueMax ?? max;
  const canonicalMinimum = exactValueMin ?? min;
  const effectiveAdjustmentStep = adjustmentStep ?? step;
  const sliderMinimum = step ? Math.ceil((min - stepAnchor) / step) : min;
  const sliderMaximum = step ? Math.floor((max - stepAnchor) / step) : max;
  const sliderValue = step
    ? Math.max(sliderMinimum, Math.min(sliderMaximum, Math.round((value - stepAnchor) / step)))
    : value;
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));
  const [localInlineDraft, setLocalInlineDraft] = useState(String(value));
  const inlineDraftValue = exactDraft ?? localInlineDraft;
  const setInlineDraftValue = (draft: string) => {
    if (isCurrent && !isCurrent()) return;
    setLocalInlineDraft(draft);
    onExactDraftChange?.(draft);
  };
  const [isEditingInlineValue, setIsEditingInlineValue] = useState(exactDraft !== undefined);
  const inputRef = useRef<TextInput>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (!isEditingInlineValue) setInlineDraftValue(String(value));
      setIsEditingInlineValue(true);
      setFocusRequest((request) => request + 1);
    },
  }));
  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus?.();
  }, [focusRequest]);

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  const validateInlineValue = (nextDraft: string) => {
    if (isCurrent && !isCurrent()) return false;
    const parsed = parseNumberOrUndefined(nextDraft);
    if (
      parsed === undefined ||
      parsed < canonicalMinimum ||
      parsed > canonicalMaximum ||
      (isExactValueValid && !isExactValueValid(parsed))
    ) {
      onExactValueInvalidChange?.(true);
      return false;
    }
    onExactValueInvalidChange?.(false);
    onChange(parsed);
    return true;
  };

  const commitInlineValue = () => {
    if (isCurrent && !isCurrent()) return;
    const parsed = parseNumberOrUndefined(inlineDraftValue);
    if (
      parsed === undefined ||
      parsed < canonicalMinimum ||
      parsed > canonicalMaximum ||
      (isExactValueValid && !isExactValueValid(parsed))
    ) {
      onExactValueInvalidChange?.(true);
      return;
    }
    onExactValueInvalidChange?.(false);
    setIsEditingInlineValue(false);
  };

  const formatWithUnit = (numericValue: number) => {
    const formatted =
      !showSlider && inlineValueEditor
        ? String(numericValue)
        : formatNumberForInput(numericValue, decimals);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  };
  const applyAdjustment = (next: number) => {
    setInlineDraftValue(String(next));
    setIsEditingInlineValue(false);
    onExactValueInvalidChange?.(false);
    onChange(next);
  };
  const adjustValue = (direction: -1 | 1) => {
    if (!effectiveAdjustmentStep) return;
    const next = nudgeNumberByStep(value, direction, {
      min: adjustmentMin ?? min,
      max: adjustmentMax ?? max,
      step: effectiveAdjustmentStep,
      anchor: stepAnchor,
    });
    if (next !== value) applyAdjustment(next);
  };

  const currentValue = showCurrentValueInRange ? (
    inlineValueEditor && (alwaysShowInput || isEditingInlineValue) ? (
      <Input
        ref={inputRef}
        accessibilityHint={
          accessibilityHint ?? `Enter a number between ${canonicalMinimum} and ${canonicalMaximum}`
        }
        accessibilityLabel={label ? `${label} exact value` : "Exact value"}
        className="min-h-11 w-24 px-2 text-center text-sm"
        keyboardType={alwaysShowInput ? "decimal-pad" : "numbers-and-punctuation"}
        onBlur={commitInlineValue}
        onChangeText={(nextDraft) => {
          setInlineDraftValue(nextDraft);
          validateInlineValue(nextDraft);
        }}
        onSubmitEditing={commitInlineValue}
        {...(testId ? { testId: `${testId}-inline-value` } : {})}
        value={inlineDraftValue}
      />
    ) : (
      <Pressable
        accessibilityHint={inlineValueEditor ? "Tap to enter an exact value" : undefined}
        accessibilityLabel={label ? `${label}: ${formatWithUnit(value)}` : formatWithUnit(value)}
        accessibilityRole={inlineValueEditor ? "button" : undefined}
        {...(compactHeader ? { className: "min-h-11 min-w-11 shrink justify-center px-2" } : {})}
        hitSlop={8}
        onPress={
          inlineValueEditor
            ? () => {
                setInlineDraftValue(String(value));
                setIsEditingInlineValue(true);
              }
            : undefined
        }
        testID={testId ? `${testId}-current-value` : undefined}
      >
        <Text className="text-xs font-medium text-foreground">{formatWithUnit(value)}</Text>
      </Pressable>
    )
  ) : null;

  return (
    <View className="gap-2">
      {compactHeader ? (
        <View className="min-h-11 flex-row items-center justify-between gap-2">
          {headerLeading ??
            (label ? (
              <Label {...(id === undefined ? {} : { nativeID: id })}>
                <Text className="text-sm text-foreground">{label}</Text>
              </Label>
            ) : null)}
          {currentValue}
          {headerTrailing}
        </View>
      ) : label ? (
        <Label {...(id === undefined ? {} : { nativeID: id })}>
          <Text className="text-sm text-foreground">{label}</Text>
        </Label>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {!compactHeader ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-muted-foreground">{formatWithUnit(min)}</Text>
          {currentValue}
          <Text className="text-xs text-muted-foreground">{formatWithUnit(max)}</Text>
        </View>
      ) : null}
      {showSlider || showAdjustmentButtons ? (
        <View className="flex-row items-center gap-2">
          {showAdjustmentButtons ? (
            <Pressable
              accessibilityLabel={`Decrease ${label ?? "value"}`}
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-md border border-border"
              disabled={!effectiveAdjustmentStep || value <= (adjustmentMin ?? min)}
              onPress={() => adjustValue(-1)}
            >
              <Text className="text-lg text-foreground">-</Text>
            </Pressable>
          ) : null}
          {showSlider ? (
            <View className="flex-1">
              <Slider
                maximumValue={sliderMaximum}
                minimumValue={sliderMinimum}
                onValueChange={(nextValue) => {
                  const clamped = step
                    ? nextValue * step + stepAnchor
                    : clampNumber(nextValue, min, max);
                  const next = step
                    ? alignNumberToStep(clamped, {
                        min,
                        max,
                        step,
                        anchor: stepAnchor,
                      })
                    : Number(clamped.toFixed(decimals));
                  applyAdjustment(next);
                  setDraftValue(formatNumberForInput(next, decimals));
                }}
                {...(step ? { step: 1 } : {})}
                {...(testId ? { testId: `${testId}-slider` } : {})}
                value={sliderValue}
              />
            </View>
          ) : null}
          {showAdjustmentButtons ? (
            <Pressable
              accessibilityLabel={`Increase ${label ?? "value"}`}
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-md border border-border"
              disabled={!effectiveAdjustmentStep || value >= (adjustmentMax ?? max)}
              onPress={() => adjustValue(1)}
            >
              <Text className="text-lg text-foreground">+</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showNumericInput ? (
        <View className="flex-row items-center gap-2">
          <Input
            accessibilityHint={accessibilityHint ?? `Enter a number between ${min} and ${max}`}
            className="flex-1"
            value={draftValue}
            onBlur={() => {
              const parsed = parseBoundedNumber(draftValue, { min, max, decimals });
              if (parsed === undefined) {
                setDraftValue(formatNumberForInput(value, decimals));
                return;
              }
              onChange(parsed);
              setDraftValue(formatNumberForInput(parsed, decimals));
            }}
            onChangeText={setDraftValue}
            keyboardType="numbers-and-punctuation"
          />
          {unitLabel ? <Text className="text-xs text-muted-foreground">{unitLabel}</Text> : null}
        </View>
      ) : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export { NumberSliderInput };
