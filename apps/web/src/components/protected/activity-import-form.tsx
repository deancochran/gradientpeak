import {
  deriveActivityNameFromFileName,
  getSupportedActivityFileExtension,
  manualActivityImportFormSchema,
} from "@repo/core/activity-files";
import { Button } from "@repo/ui/components/button";
import { Form, FormFileField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm } from "@repo/ui/hooks";
import { Upload } from "lucide-react";
import { useEffect, useRef } from "react";
import type { z } from "zod";

export type ActivityImportPhase = "idle" | "signing" | "uploading" | "processing" | "success";

const browserActivityImportFormSchema = manualActivityImportFormSchema.omit({ sport: true });

type BrowserActivityImportInput = z.input<typeof browserActivityImportFormSchema>;
type BrowserActivityImportOutput = z.output<typeof browserActivityImportFormSchema>;

export type BrowserActivityImportValues = BrowserActivityImportOutput & {
  file: File;
};

type ActivityImportFormProps = {
  onCancel: () => void;
  onSubmit: (values: BrowserActivityImportValues) => Promise<unknown> | unknown;
  phase: ActivityImportPhase;
};

const phaseLabels: Record<ActivityImportPhase, string> = {
  idle: "Import activity",
  signing: "Preparing upload...",
  uploading: "Uploading activity file...",
  processing: "Processing activity...",
  success: "Activity imported",
};

function getBrowserFile(value: unknown): File | null {
  if (typeof File === "undefined" || !(value instanceof File)) {
    return null;
  }

  return value;
}

export function ActivityImportForm({ onCancel, onSubmit, phase }: ActivityImportFormProps) {
  const form = useZodForm<BrowserActivityImportInput, undefined, BrowserActivityImportOutput>({
    defaultValues: {
      files: [],
      name: "",
      notes: null,
    },
    schema: browserActivityImportFormSchema,
  });
  const files = form.watch("files");
  const name = form.watch("name");
  const notes = form.watch("notes");
  const previousFileSelection = useRef<unknown>(null);
  const autoDerivedName = useRef<string | null>(null);
  const disabled = phase !== "idle";

  useEffect(() => {
    const selectedFile = files[0] ?? null;
    if (selectedFile === previousFileSelection.current) {
      return;
    }
    const selectedFileName = selectedFile?.name ?? null;

    const currentName = form.getValues("name").trim();
    const stillAutoDerived =
      autoDerivedName.current === null
        ? currentName.length === 0
        : currentName === autoDerivedName.current;

    if (selectedFileName) {
      if (stillAutoDerived) {
        const nextName = deriveActivityNameFromFileName(selectedFileName);
        autoDerivedName.current = nextName;
        form.setValue("name", nextName, { shouldDirty: true, shouldValidate: true });
      } else {
        autoDerivedName.current = null;
      }
    } else if (stillAutoDerived) {
      autoDerivedName.current = null;
      form.setValue("name", "", { shouldDirty: true, shouldValidate: true });
    }

    previousFileSelection.current = selectedFile;
    form.clearErrors("files");
    form.clearErrors("root" as never);
  }, [files, form]);

  useEffect(() => {
    if (autoDerivedName.current !== null && name !== autoDerivedName.current) {
      autoDerivedName.current = null;
    }
    if (notes === null || typeof notes === "string") {
      form.clearErrors("root" as never);
    }
  }, [form, name, notes]);

  const submit = form.handleSubmit(async (values) => {
    const selected = values.files[0] as (typeof values.files)[number] & { file?: unknown };
    const file = getBrowserFile(selected?.file);

    if (!file) {
      form.setError("files", { message: "Choose a browser file before importing." });
      return;
    }
    if (!getSupportedActivityFileExtension(file.name)) {
      form.setError("files", { message: "Only FIT, GPX, and TCX files are supported." });
      return;
    }

    try {
      await onSubmit({ ...values, file });
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error ? error.message : "The activity file could not be imported.",
      });
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <FormFileField
          accept=".fit,.gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml,application/octet-stream"
          control={form.control}
          description="Choose one completed FIT, GPX, or TCX recording from your device."
          disabled={disabled}
          label="Activity file"
          multiple={false}
          name="files"
          required
          testId="activity-import-file-input"
        />
        <FormTextField
          control={form.control}
          disabled={disabled}
          label="Activity name"
          name="name"
          required
          testId="activity-import-name-input"
        />
        <FormTextareaField
          className="min-h-28"
          control={form.control}
          disabled={disabled}
          label="Notes"
          name="notes"
          placeholder="Optional notes"
          testId="activity-import-notes-input"
        />
        {phase !== "idle" ? (
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            {phaseLabels[phase]}
          </p>
        ) : null}
        {form.formState.errors.root?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button disabled={disabled} onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <LoadingButton
            disabled={disabled || files.length !== 1}
            loading={phase === "signing" || phase === "uploading" || phase === "processing"}
            loadingLabel={phaseLabels[phase]}
            type="submit"
          >
            <Upload className="mr-2 h-4 w-4" />
            {phaseLabels[phase]}
          </LoadingButton>
        </div>
      </form>
    </Form>
  );
}
