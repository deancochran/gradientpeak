import { useId, useRef } from "react";
import { Button } from "../button/index.web";
import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { FileInputProps, SelectedFile } from "./shared";
import { formatFileSize } from "./shared";

type WebFileInputProps = FileInputProps & {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
};

function toSelectedFiles(fileList: FileList): SelectedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    name: file.name,
    size: file.size,
    type: file.type,
  }));
}

function FileInput({
  accept,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  buttonLabel,
  clearLabel = "Clear files",
  disabled = false,
  error,
  files = [],
  helperText,
  hideLabel = false,
  id,
  label,
  multiple = false,
  name,
  onBlur,
  onFilesChange,
  removeLabel = (file) => `Remove ${file.name}`,
  required = false,
  testId,
  testID,
}: WebFileInputProps) {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = id ?? generatedId;
  const inputId = hideLabel ? baseId : `${baseId}-field`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const associations = [describedBy, helperText ? helperId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");
  const resolvedButtonLabel =
    buttonLabel ??
    (files.length
      ? multiple
        ? "Replace files"
        : "Replace file"
      : multiple
        ? "Choose files"
        : "Choose file");

  // Native required cannot represent this controlled value because same-file support resets FileList.

  const resetBrowserSelection = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const updateFiles = (nextFiles: SelectedFile[]) => {
    if (disabled) {
      return;
    }

    resetBrowserSelection();
    onFilesChange?.(nextFiles);
  };

  return (
    <div className="grid gap-2">
      <Label className={hideLabel ? "sr-only" : undefined} htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        accept={accept}
        accessibilityLabel={label}
        aria-describedby={associations || undefined}
        aria-invalid={Boolean(error) || ariaInvalid === true || ariaInvalid === "true"}
        aria-required={required}
        className="sr-only"
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        name={name}
        onBlur={onBlur}
        onChange={(event) => {
          if (disabled) {
            return;
          }

          const selected = event.currentTarget.files;
          if (!selected?.length) {
            resetBrowserSelection();
            return;
          }

          updateFiles(toSelectedFiles(selected));
        }}
        ref={inputRef}
        testId={testId ?? testID}
        type="file"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          accessibilityLabel={`${resolvedButtonLabel} for ${label}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          testId={testId || testID ? `${testId ?? testID}-pick` : undefined}
          type="button"
        >
          {resolvedButtonLabel}
        </Button>
        {files.length ? (
          <Button
            accessibilityLabel={clearLabel}
            disabled={disabled}
            onClick={() => updateFiles([])}
            testId={testId || testID ? `${testId ?? testID}-clear` : undefined}
            type="button"
            variant="outline"
          >
            {clearLabel}
          </Button>
        ) : null}
      </div>
      {files.length ? (
        <ul
          aria-label={`${label} selected files`}
          className="grid gap-1 text-xs text-muted-foreground"
        >
          {files.map((file, index) => (
            <li
              className="flex items-center justify-between gap-2"
              key={`${file.uri ?? file.name}-${file.size ?? "unknown"}-${file.type ?? "unknown"}`}
            >
              <span>{`${file.name} (${formatFileSize(file.size)})`}</span>
              <Button
                accessibilityLabel={removeLabel(file, index)}
                disabled={disabled}
                onClick={() => updateFiles(files.filter((_, fileIndex) => fileIndex !== index))}
                testId={testId || testID ? `${testId ?? testID}-remove-${index}` : undefined}
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {helperText ? (
        <p className="text-xs text-muted-foreground" id={helperId}>
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FileInput };
