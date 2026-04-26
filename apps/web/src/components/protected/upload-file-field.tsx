import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { FileInput } from "@repo/ui/components/file-input";
import { CheckCircle2, FileText } from "lucide-react";

type UploadFileFieldProps = {
  accept?: string;
  description: string;
  disabled?: boolean;
  error?: string;
  files: Array<{ file?: File; name: string }>;
  helperText: string;
  id: string;
  label: string;
  onFilesChange: (
    files: Array<{ file?: File; name: string; size?: number; type?: string }>,
  ) => void;
  onReset?: () => void;
  required?: boolean;
  testId: string;
};

export function UploadFileField({
  accept,
  description,
  disabled = false,
  error,
  files,
  helperText,
  id,
  label,
  onFilesChange,
  onReset,
  required = false,
  testId,
}: UploadFileFieldProps) {
  const selectedFile = files[0];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {selectedFile ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span>{selectedFile.name}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-xs text-muted-foreground">{helperText}</p>
              </div>
            </div>
            {onReset ? (
              <Button disabled={disabled} onClick={onReset} type="button" variant="outline">
                Choose a different file
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : disabled ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Finish the current upload before choosing a different file.
          </CardContent>
        </Card>
      ) : (
        <FileInput
          accept={accept}
          error={error}
          files={files}
          helperText={helperText}
          id={id}
          label={label}
          name={id}
          onFilesChange={onFilesChange}
          required={required}
          testId={testId}
        />
      )}
    </div>
  );
}
