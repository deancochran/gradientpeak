import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { DateInputProps } from "./shared";

function formatLocalDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function DateInput({
  clearable = false,
  disabled = false,
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
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

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
          className="flex-1"
          disabled={disabled}
          id={inputId}
          max={maximumDate ? formatLocalDate(maximumDate) : undefined}
          min={minimumDate ? formatLocalDate(minimumDate) : undefined}
          name={name}
          onChange={(event) => {
            if (!disabled) {
              onChange(event.currentTarget.value || undefined);
            }
          }}
          placeholder={placeholder}
          required={required}
          testId={testId}
          type="date"
          value={value ?? ""}
        />
        {clearable && value ? (
          <Button
            aria-label="Clear date"
            className="px-2 text-muted-foreground"
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              if (!disabled) {
                onChange(undefined);
              }
            }}
          >
            Clear
          </Button>
        ) : null}
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

export { DateInput };
