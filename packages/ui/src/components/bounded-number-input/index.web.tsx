import {
  formatNumberForInput,
  parseBoundedNumber,
  parseNumberOrUndefined,
} from "@repo/core/utils/fitness-inputs";
import { nudgeNumberByStep } from "@repo/core/utils/numeric-ux-policy";
import { useInputDraft } from "../../hooks/use-input-draft";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { BoundedNumberInputProps } from "./shared";

function BoundedNumberInput({
  accessibilityHint,
  adjustmentStep,
  clampProjection = true,
  decimals = 2,
  disabled = false,
  error,
  helperText,
  id,
  label,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  name,
  onChange,
  onInvalidChange,
  onBlur,
  onNumberChange,
  placeholder,
  presets,
  required = false,
  resetKey,
  showAdjustmentButtons = false,
  stepAnchor = 0,
  testID,
  testId,
  unitLabel,
  value,
}: BoundedNumberInputProps) {
  const [draftValue, setDraftValue] = useInputDraft(value, resetKey);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const parseProjection = (nextValue: string) => {
    const parsed = clampProjection
      ? parseBoundedNumber(nextValue, { min, max, decimals })
      : parseNumberOrUndefined(nextValue);
    return parsed === undefined ||
      (!clampProjection &&
        (parsed < min || parsed > max || (decimals === 0 && !Number.isInteger(parsed))))
      ? undefined
      : parsed;
  };
  const parsedValue = parseProjection(draftValue);

  const commitValue = (nextValue: string) => {
    if (disabled) {
      return;
    }

    const trimmed = nextValue.trim();
    if (!trimmed) {
      setDraftValue("");
      onChange("");
      onNumberChange?.(undefined);
      onInvalidChange?.(false);
      return;
    }

    const parsed = parseProjection(trimmed);
    if (parsed === undefined) {
      onInvalidChange?.(true);
      return;
    }

    const normalized = clampProjection ? formatNumberForInput(parsed, decimals) : String(parsed);
    setDraftValue(normalized);
    onChange(normalized);
    onNumberChange?.(parsed);
    onInvalidChange?.(false);
  };
  const adjust = (direction: -1 | 1) => {
    if (disabled || adjustmentStep === undefined || parsedValue === undefined) return;
    commitValue(
      String(
        nudgeNumberByStep(parsedValue, direction, {
          min,
          max,
          step: adjustmentStep,
          anchor: stepAnchor,
        }),
      ),
    );
  };

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
          onBlur={() => {
            commitValue(draftValue);
            onBlur?.();
          }}
          onChange={(event) => {
            if (disabled) {
              return;
            }

            const nextValue = event.currentTarget.value;
            const parsed = parseProjection(nextValue);
            setDraftValue(nextValue, [parsed === undefined ? "" : String(parsed)]);
            onChange(nextValue);
            onNumberChange?.(parsed);
            onInvalidChange?.(nextValue.trim() !== "" && parsed === undefined);
          }}
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
