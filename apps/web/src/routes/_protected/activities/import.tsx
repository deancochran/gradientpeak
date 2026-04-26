import { zodResolver } from "@hookform/resolvers/zod";
import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormSelectField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { UploadFileField } from "../../../components/protected/upload-file-field";
import {
  type ActivityImportFormValues,
  activityImportFormSchema,
  activityTypeOptions,
} from "../../../lib/activity-route-form-schemas";
import {
  formatFileSize,
  getSingleFileSelection,
  uploadFileToSignedUrl,
} from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/activities/import")({
  component: ActivityImportPage,
});

function ActivityImportPage() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const [files, setFiles] = useState<
    Array<{ file?: File; name: string; size?: number; type?: string }>
  >([]);
  const selectedFile = getSingleFileSelection(files);
  const form = useForm<ActivityImportFormValues>({
    defaultValues: {
      activityType: "bike",
      name: "",
      notes: "",
    },
    resolver: zodResolver(activityImportFormSchema),
  });
  const getSignedUrlMutation = api.fitFiles.getSignedUploadUrl.useMutation();
  const processFitFileMutation = api.fitFiles.processFitFile.useMutation();
  const isSubmitting =
    form.formState.isSubmitting ||
    getSignedUrlMutation.isPending ||
    processFitFileMutation.isPending;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Import activity history</h1>
        <p className="text-sm text-muted-foreground">
          Browser-native FIT import for completed activities. Historical timestamps are preserved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed FIT activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <UploadFileField
            accept=".fit"
            description="Choose one completed FIT recording from your device."
            error={form.formState.errors.root?.message}
            files={files}
            helperText={
              selectedFile ? formatFileSize(selectedFile.size) : "Supported now: .fit only."
            }
            id="activity-fit-file"
            label="FIT file"
            onFilesChange={(nextFiles) => {
              setFiles(nextFiles);
              const nextFile = getSingleFileSelection(nextFiles);
              if (nextFile && !form.getValues("name").trim()) {
                form.setValue("name", nextFile.name.replace(/\.fit$/i, ""), { shouldDirty: true });
              }
            }}
            onReset={() => setFiles([])}
            required
            testId="activity-import-file-input"
          />

          <Form {...form}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                if (!selectedFile) {
                  form.setError("root", { message: "Choose a FIT file to import." });
                  return;
                }

                try {
                  const signedUrlData = await getSignedUrlMutation.mutateAsync({
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                  });

                  await uploadFileToSignedUrl(selectedFile.file, signedUrlData.signedUrl);

                  const result = await processFitFileMutation.mutateAsync({
                    activityType: values.activityType,
                    fitFilePath: signedUrlData.filePath,
                    importProvenance: {
                      import_file_type: "fit",
                      import_original_file_name: selectedFile.name,
                      import_source: "manual_historical",
                    },
                    name: values.name.trim(),
                    notes: values.notes.trim() || undefined,
                  });

                  await invalidatePostActivityIngestionQueries(queryClient);
                  await utils.activities.invalidate();
                  toast.success(`Imported ${result.activity.name}`);
                  void navigate({
                    to: "/activities/$activityId",
                    params: { activityId: result.activity.id },
                  });
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "The FIT activity could not be imported.";
                  form.setError("root", { message });
                  toast.error("Activity import failed");
                }
              })}
            >
              <FormTextField
                control={form.control}
                label="Activity name"
                name="name"
                testId="activity-import-name-input"
              />
              <FormSelectField
                control={form.control}
                label="Activity type"
                name="activityType"
                options={activityTypeOptions.map((option) => ({ ...option }))}
                placeholder="Choose activity type"
                testId="activity-import-type-select"
              />
              <FormTextareaField
                className="min-h-28"
                control={form.control}
                label="Notes"
                name="notes"
                placeholder="Optional notes"
                testId="activity-import-notes-input"
              />
              {form.formState.errors.root?.message ? (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  onClick={() => void navigate({ to: "/activities" })}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={!selectedFile || isSubmitting} type="submit">
                  <Upload className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Importing FIT activity..." : "Import FIT activity"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
