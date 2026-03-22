import { useEffect, useState } from "react";
import { formatNumberForInput, parseBoundedNumber } from "../../lib/fitness-inputs";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { BoundedNumberInputProps } from "./shared";

function BoundedNumberInput({
  accessibilityHint,
  decimals = 2,
  error,
  helperText,
  id,
  label,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onChange,
  onNumberChange,
  placeholder,
  presets,
  required = false,
  unitLabel,
  value,
}: BoundedNumberInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitValue = (nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      setDraftValue("");
      onChange("");
      onNumberChange?.(undefined);
      return;
    }

    const parsed = parseBoundedNumber(trimmed, { min, max, decimals });
    if (parsed === undefined) {
      return;
    }

    const normalized = formatNumberForInput(parsed, decimals);
    setDraftValue(normalized);
    onChange(normalized);
    onNumberChange?.(parsed);
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
        <Input
          accessibilityLabel={label}
          className={error ? "border-destructive bg-destructive/5" : undefined}
          id={`${id}-field`}
          onBlur={() => commitValue(draftValue)}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            onChange(event.currentTarget.value);
            onNumberChange?.(
              parseBoundedNumber(event.currentTarget.value, {
                min,
                max,
                decimals,
              }),
            );
          }}
          placeholder={placeholder}
          type="text"
          value={draftValue}
        />
        {unitLabel ? <span className="text-xs text-muted-foreground">{unitLabel}</span> : null}
      </div>
      {presets?.length ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={`${id}-${preset.label}`}
              size="sm"
              type="button"
              variant={value === preset.value ? "default" : "outline"}
              onClick={() => commitValue(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { BoundedNumberInput };
