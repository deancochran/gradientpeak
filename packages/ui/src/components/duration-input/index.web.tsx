import { useEffect, useState } from "react";
import { normalizeDurationInput, parseHmsToSeconds } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { DurationInputProps } from "./shared";

function DurationInput({
  accessibilityHint,
  error,
  helperText = "Use h:mm:ss format",
  id,
  label,
  onChange,
  onDurationSecondsChange,
  placeholder = "e.g., 1:35:00",
  required = false,
  value,
}: DurationInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${id}-field`}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        accessibilityLabel={label}
        className={error ? "border-destructive bg-destructive/5" : undefined}
        id={`${id}-field`}
        onBlur={() => {
          const normalized = normalizeDurationInput(draftValue);
          if (!normalized) {
            return;
          }

          if (normalized !== draftValue) {
            setDraftValue(normalized);
            onChange(normalized);
          }
          onDurationSecondsChange?.(parseHmsToSeconds(normalized));
        }}
        onChange={(event) => {
          setDraftValue(event.currentTarget.value);
          onChange(event.currentTarget.value);
          onDurationSecondsChange?.(parseHmsToSeconds(event.currentTarget.value));
        }}
        placeholder={placeholder}
        type="text"
        value={draftValue}
      />
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { DurationInput };
