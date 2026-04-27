import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormSelectField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { UploadFileField } from "../../../components/protected/upload-file-field";
import {
  activityTypeOptions,
  type RouteUploadFormValues,
  routeUploadFormSchema,
} from "../../../lib/activity-route-form-schemas";
import {
  formatFileSize,
  getSingleFileSelection,
  readTextFile,
} from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/routes/upload")({
  component: RouteUploadPage,
});

function RouteUploadPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const [files, setFiles] = useState<
    Array<{ file?: File; name: string; size?: number | null; type?: string | null }>
  >([]);
  const selectedFile = getSingleFileSelection(files);
  const form = useForm<RouteUploadFormValues>({
    defaultValues: {
      activityCategory: "run",
      description: "",
      name: "",
    },
    resolver: zodResolver(routeUploadFormSchema),
  });
  const uploadMutation = api.routes.upload.useMutation({
    onSuccess: async (route) => {
      await utils.routes.invalidate();
      toast.success("Route uploaded");
      void navigate({ to: "/routes/$routeId", params: { routeId: route.id } });
    },
  });

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Upload route</h1>
        <p className="text-sm text-muted-foreground">
          Import one GPX route into your personal route library for reuse in planning and route
          preview flows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GPX route file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <UploadFileField
            accept=".gpx,.xml,application/gpx+xml,application/xml,text/xml"
            description="Choose a GPX export from your device."
            error={form.formState.errors.root?.message}
            files={files}
            helperText={
              selectedFile
                ? formatFileSize(selectedFile.size)
                : "The route will be parsed for distance, elevation, and map previews."
            }
            id="route-gpx-file"
            label="GPX file"
            onFilesChange={(nextFiles) => {
              setFiles(nextFiles);
              const nextFile = getSingleFileSelection(nextFiles);
              if (nextFile && !form.getValues("name").trim()) {
                form.setValue("name", nextFile.name.replace(/\.gpx$/i, ""), { shouldDirty: true });
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
                  form.setError("root", { message: "Choose a GPX file to upload." });
                  return;
                }

                try {
                  const fileContent = await readTextFile(selectedFile.file);
                  await uploadMutation.mutateAsync({
                    activityCategory: values.activityCategory,
                    description: values.description.trim() || undefined,
                    fileContent,
                    fileName: selectedFile.name,
                    name: values.name.trim(),
                  });
                } catch (error) {
                  form.setError("root", {
                    message: error instanceof Error ? error.message : "Route upload failed.",
                  });
                  toast.error("Route upload failed");
                }
              })}
            >
              <FormTextField
                control={form.control}
                label="Route name"
                name="name"
                testId="route-upload-name-input"
              />
              <FormSelectField
                control={form.control}
                label="Activity category"
                name="activityCategory"
                options={activityTypeOptions.map((option) => ({ ...option }))}
                placeholder="Choose activity type"
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
                <Button
                  onClick={() => void navigate({ to: "/routes" })}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={!selectedFile || uploadMutation.isPending} type="submit">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadMutation.isPending ? "Uploading route..." : "Upload route"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
