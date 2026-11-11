import { useImperativeHandle, useRef } from "react";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import { Slider } from "../slider/index.web";
import type { PercentSliderInputProps } from "./shared";
import { usePercentSliderInput } from "./use-percent-slider-input";

function PercentSliderInput(props: PercentSliderInputProps) {
  const {
    ref,
    disabled = false,
    error: providedError,
    helperText,
    id,
    label,
    max = 20,
    min = 0,
    required = false,
    showNumericInput = true,
    step = 0.25,
    testID,
    testId,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const focus = () => inputRef.current?.focus();
  useImperativeHandle(ref, () => ({ focus }));
  const input = usePercentSliderInput(props, focus);
  const error =
    providedError ??
    (input.result.status === "invalid"
      ? `Enter a valid percent from ${min} to ${max}.`
      : undefined);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

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
        <span className="text-xs font-medium">
          {input.display ? `${input.display}%` : "Not set"}
        </span>
        <span className="text-xs text-muted-foreground">{max}%</span>
      </div>
      <Slider
        accessibilityLabel={label ? `${label} slider` : undefined}
        disabled={disabled}
        maximumValue={max}
        minimumValue={min}
        onValueChange={input.slide}
        step={step}
        testId={testId ? `${testId}-slider` : testID ? `${testID}-slider` : undefined}
        value={input.sliderValue}
      />
      {showNumericInput ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
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
            onBlur={input.blur}
            onChange={(event) => input.change(event.currentTarget.value)}
            required={required}
            testId={testId ?? testID}
            type="text"
            value={input.text}
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
