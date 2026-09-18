import {
  clampNumber,
  formatNumberForInput,
  parseBoundedNumber,
  parseNumberOrUndefined,
} from "@repo/core/utils/fitness-inputs";
import { alignNumberToStep, nudgeNumberByStep } from "@repo/core/utils/numeric-ux-policy";
import { useEffect, useState } from "react";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import { Slider } from "../slider/index.web";
import type { NumberSliderInputProps } from "./shared";

function NumberSliderInput({
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
}: NumberSliderInputProps) {
  const canonicalMaximum = exactValueMax ?? max;
  const canonicalMinimum = exactValueMin ?? min;
  const effectiveAdjustmentStep = adjustmentStep ?? step;
  const sliderMinimum = step ? Math.ceil((min - stepAnchor) / step) : min;
  const sliderMaximum = step ? Math.floor((max - stepAnchor) / step) : max;
  const sliderValue = step
    ? Math.max(sliderMinimum, Math.min(sliderMaximum, Math.round((value - stepAnchor) / step)))
    : value;
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));
  const [inlineDraftValue, setInlineDraftValue] = useState(String(value));
  const [isEditingInlineValue, setIsEditingInlineValue] = useState(false);

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  const validateInlineValue = (nextDraft: string) => {
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
  const adjustValue = (direction: -1 | 1) => {
    if (!effectiveAdjustmentStep) return;
    const next = nudgeNumberByStep(value, direction, {
      min: adjustmentMin ?? min,
      max: adjustmentMax ?? max,
      step: effectiveAdjustmentStep,
      anchor: stepAnchor,
    });
    if (next !== value) onChange(next);
  };

  const currentValue = showCurrentValueInRange ? (
    inlineValueEditor && isEditingInlineValue ? (
      <Input
        accessibilityLabel={label ? `${label} exact value` : "Exact value"}
        aria-description={
          accessibilityHint ?? `Enter a number between ${canonicalMinimum} and ${canonicalMaximum}`
        }
        className="min-h-11 w-24 px-2 text-center text-sm"
        id={`${id}-exact-value`}
        onBlur={commitInlineValue}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setInlineDraftValue(nextDraft);
          validateInlineValue(nextDraft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitInlineValue();
          }
        }}
        testId={testId ? `${testId}-inline-value` : undefined}
        type="text"
        value={inlineDraftValue}
      />
    ) : (
      <button
        aria-label={label ? `${label}: ${formatWithUnit(value)}` : formatWithUnit(value)}
        className={compactHeader ? "min-h-11 px-2 text-xs font-medium" : "text-xs font-medium"}
        onClick={
          inlineValueEditor
            ? () => {
                setInlineDraftValue(String(value));
                setIsEditingInlineValue(true);
              }
            : undefined
        }
        tabIndex={inlineValueEditor ? 0 : -1}
        data-testid={testId ? `${testId}-current-value` : undefined}
        type="button"
      >
        {formatWithUnit(value)}
      </button>
    )
  ) : null;

  return (
    <div className="grid gap-2">
      {compactHeader ? (
        <div className="flex min-h-11 items-center justify-between gap-2">
          {headerLeading ?? (label ? <Label htmlFor={`${id}-field`}>{label}</Label> : null)}
          {currentValue}
          {headerTrailing}
        </div>
      ) : label ? (
        <Label htmlFor={`${id}-field`}>{label}</Label>
      ) : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {!compactHeader ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{formatWithUnit(min)}</span>
          {currentValue}
          <span className="text-xs text-muted-foreground">{formatWithUnit(max)}</span>
        </div>
      ) : null}
      {showSlider || showAdjustmentButtons ? (
        <div className="flex items-center gap-2">
          {showAdjustmentButtons ? (
            <button
              aria-label={`Decrease ${label ?? "value"}`}
              className="min-h-11 min-w-11 rounded-md border"
              disabled={!effectiveAdjustmentStep || value <= (adjustmentMin ?? min)}
              onClick={() => adjustValue(-1)}
              type="button"
            >
              -
            </button>
          ) : null}
          {showSlider ? (
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
                onChange(next);
                onExactValueInvalidChange?.(false);
                setDraftValue(formatNumberForInput(next, decimals));
              }}
              {...(step ? { step: 1 } : {})}
              {...(testId ? { testId: `${testId}-slider` } : {})}
              value={sliderValue}
            />
          ) : null}
          {showAdjustmentButtons ? (
            <button
              aria-label={`Increase ${label ?? "value"}`}
              className="min-h-11 min-w-11 rounded-md border"
              disabled={!effectiveAdjustmentStep || value >= (adjustmentMax ?? max)}
              onClick={() => adjustValue(1)}
              type="button"
            >
              +
            </button>
          ) : null}
        </div>
      ) : null}
      {showNumericInput ? (
        <div className="flex items-center gap-2">
          <Input
            accessibilityLabel={label}
            className="flex-1"
            id={`${id}-field`}
            onBlur={() => {
              const parsed = parseBoundedNumber(draftValue, { min, max, decimals });
              if (parsed === undefined) {
                setDraftValue(formatNumberForInput(value, decimals));
                return;
              }
              onChange(parsed);
              setDraftValue(formatNumberForInput(parsed, decimals));
            }}
            onChange={(event) => setDraftValue(event.currentTarget.value)}
            type="text"
            value={draftValue}
          />
          {unitLabel ? <span className="text-xs text-muted-foreground">{unitLabel}</span> : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export { NumberSliderInput };
