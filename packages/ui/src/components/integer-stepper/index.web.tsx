import { useImperativeHandle, useRef } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { IntegerStepperProps } from "./shared";
import { useIntegerStepper } from "./use-integer-stepper";

function IntegerStepper(props: IntegerStepperProps) {
  const {
    ref,
    accessibilityHint,
    disabled = false,
    error: providedError,
    helperText,
    id,
    label,
    max = 20,
    min = 0,
    testId,
  } = props;
  const labelText = label || "value";
  const input = useRef<HTMLInputElement>(null);
  const focus = () => input.current?.focus();
  useImperativeHandle(ref, () => ({ focus }));
  const state = useIntegerStepper(props, focus);
  const { text: draftValue, currentValue, decreaseDisabled, increaseDisabled } = state;
  const error =
    providedError ?? (state.invalid ? `Enter a whole number from ${min} to ${max}.` : undefined);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

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
              state.decrease();
            }
          }}
        >
          -
        </Button>
        <Input
          ref={input}
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
          onBlur={state.blur}
          onChange={(event) => state.change(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!decreaseDisabled) state.decrease();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!increaseDisabled) state.increase();
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
              state.increase();
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
