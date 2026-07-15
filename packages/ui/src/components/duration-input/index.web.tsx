import { useEffect, useState } from "react";
import { normalizeDurationInput, parseHmsToSeconds } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { DurationInputProps } from "./shared";

function DurationInput({
  accessibilityHint: _accessibilityHint,
  disabled = false,
  error,
  helperText = "Use h:mm:ss format",
  id,
  label,
  name,
  onBlur,
  onChange,
  onDurationSecondsChange,
  placeholder = "e.g., 1:35:00",
  required = false,
  value,
  testId,
}: DurationInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const inputId = `${id}-field`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        accessibilityLabel={label}
        aria-describedby={
          [helperText ? descriptionId : undefined, error ? errorId : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={!!error}
        aria-required={required}
        className={error ? "border-destructive bg-destructive/5" : undefined}
        disabled={disabled}
        id={inputId}
        name={name}
        onBlur={() => {
          if (!disabled) {
            const normalized = normalizeDurationInput(draftValue);
            if (normalized) {
              if (normalized !== draftValue) {
                setDraftValue(normalized);
                onChange(normalized);
              }
              onDurationSecondsChange?.(parseHmsToSeconds(normalized));
            }
          }
          onBlur?.();
        }}
        onChange={(event) => {
          if (disabled) return;
          setDraftValue(event.currentTarget.value);
          onChange(event.currentTarget.value);
          onDurationSecondsChange?.(parseHmsToSeconds(event.currentTarget.value));
        }}
        placeholder={placeholder}
        required={required}
        testId={testId}
        type="text"
        value={draftValue}
      />
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

export { DurationInput };
