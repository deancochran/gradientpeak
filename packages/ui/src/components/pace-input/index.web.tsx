import { useEffect, useState } from "react";
import { normalizePaceInput, parseMmSsToSeconds } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { PaceInputProps } from "./shared";

function PaceInput({
  accessibilityHint: _accessibilityHint,
  disabled = false,
  error,
  helperText = "Use mm:ss per kilometer",
  id,
  label,
  name,
  onBlur,
  onChange,
  onPaceSecondsChange,
  placeholder = "e.g., 4:15",
  required = false,
  unitLabel = "/km",
  value,
  testId,
}: PaceInputProps) {
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
          className={error ? "flex-1 border-destructive bg-destructive/5" : "flex-1"}
          disabled={disabled}
          id={inputId}
          name={name}
          onBlur={() => {
            if (!disabled) {
              const normalized = normalizePaceInput(draftValue);
              if (normalized) {
                if (normalized !== draftValue) {
                  setDraftValue(normalized);
                  onChange(normalized);
                }
                onPaceSecondsChange?.(parseMmSsToSeconds(normalized));
              }
            }
            onBlur?.();
          }}
          onChange={(event) => {
            if (disabled) return;
            setDraftValue(event.currentTarget.value);
            onChange(event.currentTarget.value);
            onPaceSecondsChange?.(parseMmSsToSeconds(event.currentTarget.value));
          }}
          placeholder={placeholder}
          required={required}
          testId={testId}
          type="text"
          value={draftValue}
        />
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
      </div>
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

export { PaceInput };
