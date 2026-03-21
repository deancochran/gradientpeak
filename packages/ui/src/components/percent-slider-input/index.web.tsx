import { useEffect, useState } from "react";
import { clampNumber, formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import { Slider } from "../slider/index.web";
import type { PercentSliderInputProps } from "./shared";

function PercentSliderInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  showNumericInput = true,
  step = 0.25,
  value,
}: PercentSliderInputProps) {
  const [draftValue, setDraftValue] = useState(formatNumberForInput(value, decimals));

  useEffect(() => {
    setDraftValue(formatNumberForInput(value, decimals));
  }, [decimals, value]);

  return (
    <div className="grid gap-2">
      {label ? <Label htmlFor={`${id}-field`}>{label}</Label> : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{min}%</span>
        <span className="text-xs font-medium">{formatNumberForInput(value, decimals)}%</span>
        <span className="text-xs text-muted-foreground">{max}%</span>
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
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export { PercentSliderInput };
