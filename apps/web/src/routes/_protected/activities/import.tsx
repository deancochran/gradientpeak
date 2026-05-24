import { zodResolver } from "@hookform/resolvers/zod";
import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Form,
  FormSegmentedSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
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
import { buildManualHistoricalImportProvenance } from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/activities/import")({
  component: ActivityImportPage,
});

function ActivityImportPage() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const [files, setFiles] = useState<
    Array<{ file?: File; name: string; size?: number | null; type?: string | null }>
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
  const getSignedUrlMutation = api.activityFiles.getSignedUploadUrl.useMutation();
  const processActivityFileMutation = api.activityFiles.processActivityFile.useMutation();
  const isSubmitting =
    form.formState.isSubmitting ||
    getSignedUrlMutation.isPending ||
    processActivityFileMutation.isPending;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Import activity history</h1>
        <p className="text-sm text-muted-foreground">
          Browser-native FIT, GPX, and TCX import for completed activities. Historical timestamps
          are preserved when present in the file.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed activity file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <UploadFileField
            accept=".fit,.gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml,application/octet-stream"
            description="Choose one completed FIT, GPX, or TCX recording from your device."
            error={form.formState.errors.root?.message}
            files={files}
            helperText={
              selectedFile
                ? formatFileSize(selectedFile.size)
                : "Supported now: .fit, .gpx, and .tcx."
            }
            id="activity-file"
            label="Activity file"
            onFilesChange={(nextFiles) => {
              setFiles(nextFiles);
              const nextFile = getSingleFileSelection(nextFiles);
              if (nextFile && !form.getValues("name").trim()) {
                form.setValue("name", nextFile.name.replace(/\.(fit|gpx|tcx)$/i, ""), {
                  shouldDirty: true,
                });
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
                  form.setError("root", { message: "Choose a FIT, GPX, or TCX file to import." });
                  return;
                }

                try {
                  const signedUrlData = await getSignedUrlMutation.mutateAsync({
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                  });

                  await uploadFileToSignedUrl(selectedFile.file, signedUrlData.signedUrl);

                  const result = await processActivityFileMutation.mutateAsync({
                    activityType: values.activityType,
                    activityFilePath: signedUrlData.filePath,
                    importProvenance: buildManualHistoricalImportProvenance(selectedFile.name),
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
                      : "The activity file could not be imported.";
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
              <FormSegmentedSelectField
                control={form.control}
                label="Activity type"
                name="activityType"
                options={activityTypeOptions.map((option) => ({ ...option }))}
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
                <LoadingButton
                  disabled={!selectedFile || isSubmitting}
                  loading={isSubmitting}
                  loadingLabel="Importing activity..."
                  type="submit"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import activity
                </LoadingButton>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
