import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { DateInputProps } from "./shared";

function DateInput({
  clearable = false,
  error,
  helperText,
  id,
  label,
  maximumDate,
  minimumDate,
  onChange,
  placeholder,
  required = false,
  testId,
  value,
}: DateInputProps) {
  const inputId = `${id}-field`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={inputId}
        max={maximumDate ? maximumDate.toISOString().split("T")[0] : undefined}
        min={minimumDate ? minimumDate.toISOString().split("T")[0] : undefined}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
        placeholder={placeholder}
        testId={testId}
        type="date"
        value={value ?? ""}
      />
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {clearable && value ? (
        <div>
          <Button size="sm" type="button" variant="outline" onClick={() => onChange(undefined)}>
            Clear date
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { DateInput };
