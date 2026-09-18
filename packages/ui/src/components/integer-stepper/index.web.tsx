import { clampInteger, parseBoundedInteger } from "@repo/core/utils/fitness-inputs";
import { useEffect, useState } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { IntegerStepperProps } from "./shared";

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
}: IntegerStepperProps) {
  const labelText = label || "value";
  const normalizedStep = Number.isInteger(step) && step > 0 ? step : 1;
  const [draftValue, setDraftValue] = useState(String(value));
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitDraft = (nextDraft: string) => {
    if (disabled) {
      return;
    }

    const parsed = parseBoundedInteger(nextDraft, { min, max });
    if (parsed === undefined) {
      setDraftValue(String(value));
      return;
    }

    const normalized = clampInteger(parsed, min, max);
    setDraftValue(String(normalized));
    onChange(normalized);
  };

  const parsedDraft = parseBoundedInteger(draftValue, { min, max });
  const currentValue = parsedDraft ?? value;
  const decreaseValue = clampInteger(currentValue - normalizedStep, min, max);
  const increaseValue = clampInteger(currentValue + normalizedStep, min, max);
  const decreaseDisabled = disabled || decreaseValue === currentValue;
  const increaseDisabled = disabled || increaseValue === currentValue;
  const changeValue = (nextValue: number, isChangeDisabled: boolean) => {
    if (isChangeDisabled) {
      return;
    }

    setDraftValue(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div className="grid gap-2">
      {label ? <Label htmlFor={`${id}-field`}>{label}</Label> : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11"
          size="sm"
          disabled={decreaseDisabled}
          onClick={() => {
            if (!decreaseDisabled) {
              changeValue(decreaseValue, decreaseDisabled);
            }
          }}
        >
          -
        </Button>
        <Input
          accessibilityLabel={labelText}
          aria-description={accessibilityHint}
          aria-describedby={
            [helperText ? descriptionId : undefined, error ? errorId : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={!!error}
          className="flex-1 text-center"
          disabled={disabled}
          id={`${id}-field`}
          inputMode="numeric"
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={currentValue}
          onBlur={() => commitDraft(draftValue)}
          onChange={(event) => {
            if (!disabled) {
              setDraftValue(event.currentTarget.value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              changeValue(decreaseValue, decreaseDisabled);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              changeValue(increaseValue, increaseDisabled);
            }
          }}
          role="spinbutton"
          {...(testId ? { testId } : {})}
          type="text"
          value={draftValue}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11"
          size="sm"
          disabled={increaseDisabled}
          onClick={() => {
            if (!increaseDisabled) {
              changeValue(increaseValue, increaseDisabled);
            }
          }}
        >
          +
        </Button>
      </div>
      {helperText ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { IntegerStepper };
