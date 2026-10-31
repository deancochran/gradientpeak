import { useImperativeHandle, useRef } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { BoundedNumberInputProps } from "./shared";
import { useBoundedNumberInput } from "./use-bounded-number-input";

function BoundedNumberInput(props: BoundedNumberInputProps) {
  const {
    ref,
    accessibilityHint,
    adjustmentStep,
    decimals = 2,
    disabled = false,
    error: providedError,
    helperText,
    id,
    label,
    max = Number.POSITIVE_INFINITY,
    min = 0,
    name,
    placeholder,
    presets,
    required = false,
    showAdjustmentButtons = false,
    testID,
    testId,
    unitLabel,
    value,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const focus = () => inputRef.current?.focus();
  useImperativeHandle(ref, () => ({ focus }));
  const input = useBoundedNumberInput(props, focus);
  const draftValue = input.text;
  const parsedValue = input.parsedValue;
  const error =
    providedError ??
    (input.result.status === "invalid"
      ? "Enter a valid number within the allowed range."
      : undefined);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const commitValue = input.change;
  const adjust = input.adjust;

  return (
    <div className="grid gap-2">
      {label ? (
        <Label htmlFor={`${id}-field`}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
      ) : null}
      <div className="flex items-center gap-2">
        {showAdjustmentButtons ? (
          <Button
            aria-label={`Decrease ${label ?? "value"}`}
            disabled={
              disabled ||
              adjustmentStep === undefined ||
              parsedValue === undefined ||
              parsedValue <= min
            }
            onClick={() => adjust(-1)}
            size="sm"
            type="button"
            variant="outline"
          >
            -
          </Button>
        ) : null}
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
          aria-description={accessibilityHint}
          className={error ? "border-destructive bg-destructive/5" : undefined}
          disabled={disabled}
          id={`${id}-field`}
          name={name}
          onBlur={input.blur}
          onChange={(event) => input.change(event.currentTarget.value)}
          placeholder={placeholder}
          required={required}
          testId={testID ?? testId}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          value={draftValue}
        />
        {unitLabel ? <span className="text-xs text-muted-foreground">{unitLabel}</span> : null}
        {showAdjustmentButtons ? (
          <Button
            aria-label={`Increase ${label ?? "value"}`}
            disabled={
              disabled ||
              adjustmentStep === undefined ||
              parsedValue === undefined ||
              parsedValue >= max
            }
            onClick={() => adjust(1)}
            size="sm"
            type="button"
            variant="outline"
          >
            +
          </Button>
        ) : null}
      </div>
      {presets?.length ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={`${id}-${preset.label}`}
              size="sm"
              type="button"
              variant={value === preset.value ? "default" : "outline"}
              disabled={disabled}
              onClick={() => commitValue(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      {helperText ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          Adjust this field: {error}
        </p>
      ) : null}
    </div>
  );
}

export { BoundedNumberInput };
