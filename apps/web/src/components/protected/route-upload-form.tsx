import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { useZodForm } from "@repo/ui/hooks";
import { Upload } from "lucide-react";
import { useState } from "react";

import {
  type RouteUploadFormValues,
  routeUploadFormSchema,
} from "../../lib/activity-route-form-schemas";
import { formatFileSize, getSingleFileSelection } from "../../lib/activity-route-upload";
import { UploadFileField } from "./upload-file-field";

type RouteUploadFile = {
  file?: File;
  name: string;
  size?: number | null;
  type?: string | null;
};

type RouteUploadFormProps = {
  onCancel: () => void;
  onSubmitError?: (error: unknown) => void;
  onSubmit: (values: RouteUploadFormValues, selectedFile: RouteUploadFile) => Promise<void> | void;
  pending?: boolean;
};

export function RouteUploadForm({
  onCancel,
  onSubmit,
  onSubmitError,
  pending = false,
}: RouteUploadFormProps) {
  const [files, setFiles] = useState<RouteUploadFile[]>([]);
  const selectedFile = getSingleFileSelection(files);
  const form = useZodForm<RouteUploadFormValues>({
    defaultValues: {
      description: "",
      name: "",
    },
    schema: routeUploadFormSchema,
  });

  return (
    <div className="space-y-6">
      <UploadFileField
        accept=".gpx,.tcx,.xml,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml"
        description="Choose a GPX or TCX export from your device."
        error={form.formState.errors.root?.message}
        files={files}
        helperText={
          selectedFile
            ? formatFileSize(selectedFile.size)
            : "The route will be parsed for distance, elevation, and map previews."
        }
        id="route-file"
        label="GPX or TCX file"
        onFilesChange={(nextFiles) => {
          setFiles(nextFiles);
          const nextFile = getSingleFileSelection(nextFiles);
          if (nextFile && !form.getValues("name").trim()) {
            form.setValue("name", nextFile.name.replace(/\.(gpx|tcx|xml)$/i, ""), {
              shouldDirty: true,
            });
          }
        }}
        onReset={() => setFiles([])}
        required
        testId="route-upload-file-input"
      />

      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (!selectedFile) {
              form.setError("root", { message: "Choose a GPX or TCX file to upload." });
              return;
            }

            try {
              await onSubmit(values, selectedFile);
            } catch (error) {
              form.setError("root", {
                message: error instanceof Error ? error.message : "Route upload failed.",
              });
              onSubmitError?.(error);
            }
          })}
        >
          <FormTextField
            control={form.control}
            label="Route name"
            name="name"
            testId="route-upload-name-input"
          />
          <FormTextareaField
            className="min-h-28"
            control={form.control}
            label="Description"
            name="description"
            placeholder="Add notes about this route"
          />
          {form.formState.errors.root?.message ? (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={!selectedFile || pending} type="submit">
              <Upload className="mr-2 h-4 w-4" />
              {pending ? "Uploading route..." : "Upload route"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
