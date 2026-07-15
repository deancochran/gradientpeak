import { useEffect, useState } from "react";
import { clampNumber, formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import { Slider } from "../slider/index.web";
import type { PercentSliderInputProps } from "./shared";

function PercentSliderInput({
  accessibilityHint,
  decimals = 2,
  disabled = false,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  required = false,
  showNumericInput = true,
  step = 0.25,
  testID,
  testId,
  value,
}: PercentSliderInputProps) {
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  return (
    <div className="grid gap-2">
      {label ? (
        <Label htmlFor={`${id}-field`}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
      ) : null}
      {helperText ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{min}%</span>
        <span className="text-xs font-medium">{formatNumberForInput(value, decimals)}%</span>
        <span className="text-xs text-muted-foreground">{max}%</span>
      </div>
      <Slider
        accessibilityLabel={label ? `${label} slider` : undefined}
        disabled={disabled}
        maximumValue={max}
        minimumValue={min}
        onValueChange={(nextValue) => {
          if (disabled) return;
          const clamped = clampNumber(nextValue, min, max);
          const rounded = Number(clamped.toFixed(decimals));
          onChange(rounded);
          setDraftValue(formatNumberForInput(rounded, decimals));
        }}
        step={step}
        testId={testId ? `${testId}-slider` : testID ? `${testID}-slider` : undefined}
        value={value}
      />
      {showNumericInput ? (
        <div className="flex items-center gap-2">
          <Input
            accessibilityLabel={label}
            aria-describedby={
              [helperText ? descriptionId : undefined, error ? errorId : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={!!error}
            aria-required={required}
            className="flex-1"
            disabled={disabled}
            id={`${id}-field`}
            onBlur={() => {
              if (disabled) return;
              const parsed = parseBoundedNumber(draftValue, { min, max, decimals });
              if (parsed === undefined) {
                setDraftValue(formatNumberForInput(value, decimals));
                return;
              }
              onChange(parsed);
              setDraftValue(formatNumberForInput(parsed, decimals));
            }}
            onChange={(event) => {
              if (!disabled) setDraftValue(event.currentTarget.value);
            }}
            required={required}
            testId={testId ?? testID}
            type="text"
            value={draftValue}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { PercentSliderInput };
