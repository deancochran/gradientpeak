import { useImperativeHandle, useRef } from "react";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { PaceInputProps } from "./shared";
import { usePaceInput } from "./use-pace-input";

function PaceInput(props: PaceInputProps) {
  const {
    accessibilityHint: _accessibilityHint,
    disabled = false,
    error,
    helperText = "Use mm:ss per kilometer",
    id,
    label,
    name,
    placeholder = "e.g., 4:15",
    required = false,
    unitLabel = "/km",
    testId,
  } = props;
  const input = usePaceInput(props);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(props.ref, () => ({ focus: () => inputRef.current?.focus() }), []);
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
          inputRef={inputRef}
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
          onBlur={input.blur}
          onChange={(event) => input.change(event.currentTarget.value)}
          placeholder={placeholder}
          required={required}
          testId={testId}
          type="text"
          value={input.text}
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
