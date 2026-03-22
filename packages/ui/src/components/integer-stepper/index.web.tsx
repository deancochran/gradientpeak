import { useEffect, useState } from "react";
import { clampInteger, parseBoundedInteger } from "../../lib/fitness-inputs";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { IntegerStepperProps } from "./shared";

function IntegerStepper({
  accessibilityHint,
  error,
  helperText,
  id,
  label,
  max = 20,
  min = 0,
  onChange,
  step = 1,
  value,
}: IntegerStepperProps) {
  const labelText = label || "value";
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitDraft = (nextDraft: string) => {
    const parsed = parseBoundedInteger(nextDraft, { min, max });
    if (parsed === undefined) {
      setDraftValue(String(value));
      return;
    }

    const normalized = clampInteger(parsed, min, max);
    setDraftValue(String(normalized));
    onChange(normalized);
  };

  return (
    <div className="grid gap-2">
      {label ? <Label htmlFor={`${id}-field`}>{label}</Label> : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(clampInteger(value - step, min, max))}
        >
          -
        </Button>
        <Input
          accessibilityLabel={labelText}
          className="flex-1 text-center"
          id={`${id}-field`}
          onBlur={() => commitDraft(draftValue)}
          onChange={(event) => setDraftValue(event.currentTarget.value)}
          type="text"
          value={draftValue}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(clampInteger(value + step, min, max))}
        >
          +
        </Button>
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export { IntegerStepper };
