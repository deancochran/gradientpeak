import { Input } from "../input/index.web";
import { Label } from "../label/index.web";
import type { FileInputProps, SelectedFile } from "./shared";

function toSelectedFiles(fileList: FileList | null): SelectedFile[] {
  if (!fileList) {
    return [];
  }

  return Array.from(fileList).map((file) => ({
    file,
    name: file.name,
    size: file.size,
    type: file.type,
  }));
}

function FileInput({
  accept,
  error,
  files,
  helperText,
  id,
  label,
  multiple = false,
  onFilesChange,
  required = false,
  testId,
}: FileInputProps) {
  const inputId = `${id}-field`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        accept={accept}
        id={inputId}
        multiple={multiple}
        onChange={(event) => onFilesChange?.(toSelectedFiles(event.currentTarget.files))}
        testId={testId}
        type="file"
      />
      {files?.length ? (
        <p className="text-xs text-muted-foreground">{files.map((file) => file.name).join(", ")}</p>
      ) : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">Adjust this field: {error}</p> : null}
    </div>
  );
}

export { FileInput };
