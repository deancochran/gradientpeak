import { useEffect, useState } from "react";
import { normalizePaceInput, parseMmSsToSeconds } from "../../lib/fitness-inputs";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { PaceInputProps } from "./shared";

function PaceInput({
  accessibilityHint,
  error,
  helperText = "Use mm:ss per kilometer",
  id,
  label,
  onChange,
  onPaceSecondsChange,
  placeholder = "e.g., 4:15",
  required = false,
  unitLabel = "/km",
  value,
}: PaceInputProps) {
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
      <div className="flex items-center gap-2">
        <Input
          accessibilityLabel={label}
          className={error ? "flex-1 border-destructive bg-destructive/5" : "flex-1"}
          id={`${id}-field`}
          onBlur={() => {
            const normalized = normalizePaceInput(draftValue);
            if (!normalized) {
              return;
            }
            if (normalized !== draftValue) {
              setDraftValue(normalized);
              onChange(normalized);
            }
            onPaceSecondsChange?.(parseMmSsToSeconds(normalized));
          }}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            onChange(event.currentTarget.value);
            onPaceSecondsChange?.(parseMmSsToSeconds(event.currentTarget.value));
          }}
          placeholder={placeholder}
          type="text"
          value={draftValue}
        />
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { PaceInput };
