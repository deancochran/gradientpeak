import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { TimeInputProps } from "./shared";

function TimeInput({
  clearable = false,
  error,
  helperText,
  id,
  label,
  onChange,
  placeholder,
  required = false,
  testId,
  value,
}: TimeInputProps) {
  const inputId = `${id}-field`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={inputId}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
        placeholder={placeholder}
        testId={testId}
        type="time"
        value={value ?? ""}
      />
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {clearable && value ? (
        <div>
          <Button size="sm" type="button" variant="outline" onClick={() => onChange(undefined)}>
            Clear time
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { TimeInput };
