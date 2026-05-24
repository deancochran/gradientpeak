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
  name,
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
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          id={inputId}
          max={maximumDate ? maximumDate.toISOString().split("T")[0] : undefined}
          min={minimumDate ? minimumDate.toISOString().split("T")[0] : undefined}
          name={name}
          onChange={(event) => onChange(event.currentTarget.value || undefined)}
          placeholder={placeholder}
          testId={testId}
          type="date"
          value={value ?? ""}
        />
        {clearable && value ? (
          <Button
            aria-label="Clear date"
            className="px-2 text-muted-foreground"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onChange(undefined)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { DateInput };
