import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { TimeInputProps } from "./shared";

function TimeInput({
  clearable = false,
  disabled = false,
  error,
  helperText,
  id,
  label,
  name,
  onChange,
  placeholder,
  required = false,
  testId,
  value,
}: TimeInputProps) {
  const inputId = `${id}-field`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

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
        disabled={disabled}
        id={inputId}
        name={name}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
        placeholder={placeholder}
        required={required}
        testId={testId}
        type="time"
        value={value ?? ""}
      />
      {helperText ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      {clearable && value ? (
        <div>
          <Button
            disabled={disabled}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onChange(undefined)}
          >
            Clear time
          </Button>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          Adjust this field: {error}
        </p>
      ) : null}
    </div>
  );
}

export { TimeInput };
