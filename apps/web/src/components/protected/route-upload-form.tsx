import {
  deriveRouteNameFromFileName,
  ROUTE_FILE_WEB_ACCEPT_ATTRIBUTE,
  type RouteUploadFormInput,
  type RouteUploadForm as RouteUploadFormValues,
  routeUploadFormSchema,
} from "@repo/core/route-files";
import { Button } from "@repo/ui/components/button";
import { Form, FormFileField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm } from "@repo/ui/hooks";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type RouteUploadPhase = "idle" | "reading" | "uploading" | "success";

export type BrowserRouteUploadValues = RouteUploadFormValues & {
  file: File;
  fileContent: string;
};

type RouteUploadFormProps<TResult> = {
  onCancel: () => void;
  onSubmitError?: (error: unknown) => void;
  onSubmit: (values: BrowserRouteUploadValues) => Promise<TResult> | TResult;
  onSuccess?: (result: TResult) => Promise<void> | void;
};

const phaseLabels: Record<RouteUploadPhase, string> = {
  idle: "Upload route",
  reading: "Reading route file...",
  uploading: "Uploading route...",
  success: "Route uploaded",
};

function getBrowserFile(value: unknown): File | null {
  if (typeof File === "undefined" || !(value instanceof File)) {
    return null;
  }

  return value;
}

export function RouteUploadForm<TResult = unknown>({
  onCancel,
  onSubmit,
  onSubmitError,
  onSuccess,
}: RouteUploadFormProps<TResult>) {
  const [phase, setPhase] = useState<RouteUploadPhase>("idle");
  const form = useZodForm<RouteUploadFormInput, undefined, RouteUploadFormValues>({
    defaultValues: {
      description: null,
      files: [],
      name: "",
    },
    schema: routeUploadFormSchema,
  });
  const files = form.watch("files");
  const name = form.watch("name");
  const description = form.watch("description");
  const previousFileSelection = useRef<unknown>(null);
  const autoDerivedName = useRef<string | null>(null);
  const submitGuard = useRef(false);
  const disabled = phase !== "idle";

  useEffect(() => {
    const selectedFile = files[0] ?? null;
    if (selectedFile === previousFileSelection.current) {
      return;
    }

    const currentName = form.getValues("name").trim();
    const stillAutoDerived =
      autoDerivedName.current === null
        ? currentName.length === 0
        : currentName === autoDerivedName.current;

    if (selectedFile?.name) {
      if (stillAutoDerived) {
        const nextName = deriveRouteNameFromFileName(selectedFile.name);
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
    if (description === null || typeof description === "string") {
      form.clearErrors("root" as never);
    }
  }, [description, form, name]);

  const submit = form.handleSubmit(
    async (values) => {
      const selected = values.files[0] as (typeof values.files)[number] & { file?: unknown };
      const file = getBrowserFile(selected?.file);

      if (!file) {
        form.setError("files", { message: "Choose a browser file before uploading." });
        submitGuard.current = false;
        return;
      }

      let result: TResult;
      try {
        form.clearErrors("root" as never);
        setPhase("reading");
        const fileContent = await file.text();
        setPhase("uploading");
        result = await onSubmit({ ...values, file, fileContent });
      } catch (error) {
        setPhase("idle");
        submitGuard.current = false;
        form.setError("root", {
          message: error instanceof Error ? error.message : "Route upload failed.",
        });
        onSubmitError?.(error);
        return;
      }

      // The API has committed. Keep the guard and terminal phase even if follow-up work fails.
      setPhase("success");
      try {
        await onSuccess?.(result);
      } catch {
        // Cache invalidation/navigation failures must never make the committed upload retryable.
      }
    },
    () => {
      submitGuard.current = false;
    },
  );

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          if (submitGuard.current) {
            event.preventDefault();
            return;
          }
          submitGuard.current = true;
          void submit(event);
        }}
      >
        <FormFileField
          accept={ROUTE_FILE_WEB_ACCEPT_ATTRIBUTE}
          control={form.control}
          description="Choose one GPX or TCX export from your device."
          disabled={disabled}
          label="GPX or TCX file"
          multiple={false}
          name="files"
          required
          testId="route-upload-file-input"
        />
        <FormTextField
          control={form.control}
          disabled={disabled}
          label="Route name"
          name="name"
          required
          testId="route-upload-name-input"
        />
        <FormTextareaField
          className="min-h-28"
          control={form.control}
          disabled={disabled}
          label="Description"
          name="description"
          placeholder="Add notes about this route"
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
            loading={phase === "reading" || phase === "uploading"}
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
