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
import {
  claimRouteUploadOperation,
  clearRouteUploadOperation,
} from "../../lib/route-upload-operation";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";

export type RouteUploadPhase = "idle" | "reading" | "uploading" | "success";

export type BrowserRouteUploadValues = RouteUploadFormValues & {
  file: File;
  fileContent: string;
  idempotencyKey: string;
};

type RouteUploadFormProps<TResult> = {
  idempotencyScope: string;
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
  idempotencyScope,
  onCancel,
  onSubmit,
  onSubmitError,
  onSuccess,
}: RouteUploadFormProps<TResult>) {
  const [phase, setPhase] = useState<RouteUploadPhase>("idle");
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const navigationGuard = useRef(false);
  const committed = useRef<{ result: TResult; followUp: typeof onSuccess } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const openSavedRoute = async (saved: NonNullable<typeof committed.current>) => {
    if (navigationGuard.current || !mounted.current) return;
    navigationGuard.current = true;
    setNavigationPending(true);
    try {
      await saved.followUp?.(saved.result);
      if (mounted.current) setNavigationFailed(false);
    } catch {
      if (mounted.current) setNavigationFailed(true);
    } finally {
      navigationGuard.current = false;
      if (mounted.current) setNavigationPending(false);
    }
  };
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
  const { guardedCancel, markSaved } = useUnsavedChangesGuard({
    draft: { description, files, name },
    dirty: form.formState.isDirty && phase !== "success",
    pending: phase === "reading" || phase === "uploading",
  });

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
      let operationStorageKey: string | null = null;
      try {
        form.clearErrors("root" as never);
        setPhase("reading");
        const fileContent = await file.text();
        if (!mounted.current) return;
        setPhase("uploading");
        const operation = await claimRouteUploadOperation({
          description: values.description,
          fileContent,
          fileName: file.name,
          name: values.name,
          profileId: idempotencyScope,
        });
        operationStorageKey = operation.storageKey;
        if (!mounted.current) return;
        result = await onSubmit({
          ...values,
          file,
          fileContent,
          idempotencyKey: operation.idempotencyKey,
        });
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
      committed.current = { result, followUp: onSuccess };
      // A local receipt-cleanup failure cannot turn a committed upload back into a write retry.
      try {
        if (operationStorageKey) clearRouteUploadOperation(operationStorageKey);
      } catch {
        /* Keep the server-accepted operation terminal. */
      }
      if (!mounted.current) return;
      setPhase("success");
      markSaved();
      await openSavedRoute(committed.current);
    },
    () => {
      submitGuard.current = false;
    },
  );

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        data-testid="route-upload-form"
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
          description="Choose one GPX, TCX, or XML export from your device."
          disabled={disabled}
          label="GPX, TCX, or XML file"
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
          testId="route-upload-description-input"
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
        {navigationFailed ? (
          <div className="space-y-2">
            <p role="alert">
              Route saved, but it could not be opened. You do not need to upload it again.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={navigationPending}
              onClick={() => {
                if (committed.current) void openSavedRoute(committed.current);
              }}
            >
              {navigationPending ? "Opening route..." : "Open route"}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            data-testid="route-upload-cancel"
            disabled={disabled}
            onClick={() => guardedCancel(onCancel)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <LoadingButton
            data-testid="route-upload-submit"
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
