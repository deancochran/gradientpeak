import { useEffect, useState } from "react";
import { clampNumber, formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import { Slider } from "../slider/index.web";
import type { NumberSliderInputProps } from "./shared";

function NumberSliderInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max,
  min,
  onChange,
  showCurrentValueInRange = true,
  showNumericInput = false,
  step,
  unitLabel,
  value,
}: NumberSliderInputProps) {
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  const formatWithUnit = (numericValue: number) => {
    const formatted = formatNumberForInput(numericValue, decimals);
    return unitLabel ? `${formatted} ${unitLabel}` : formatted;
  };

  return (
    <div className="grid gap-2">
      {label ? <Label htmlFor={`${id}-field`}>{label}</Label> : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{formatWithUnit(min)}</span>
        {showCurrentValueInRange ? (
          <span className="text-xs font-medium">{formatWithUnit(value)}</span>
        ) : null}
        <span className="text-xs text-muted-foreground">{formatWithUnit(max)}</span>
      </div>
      <Slider
        maximumValue={max}
        minimumValue={min}
        onValueChange={(nextValue) => {
          const clamped = clampNumber(nextValue, min, max);
          const rounded = Number(clamped.toFixed(decimals));
          onChange(rounded);
          setDraftValue(formatNumberForInput(rounded, decimals));
        }}
        step={step}
        value={value}
      />
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
