import { zodResolver } from "@hookform/resolvers/zod";
import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { FileInput } from "@repo/ui/components/file-input";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../lib/api/client";
import {
  buildManualHistoricalImportProvenance,
  recordingActivityOptions,
  uploadFitFileToSignedUrl,
  validateRecordingSearch,
} from "../../../lib/recording-web";

const importMetadataSchema = z.object({
  name: z.string().trim().min(1, "Enter an activity name."),
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable()
    .transform((value) => value || null),
});

type ImportMetadataValues = z.output<typeof importMetadataSchema>;
type ImportMetadataInput = z.input<typeof importMetadataSchema>;

export const Route = createFileRoute("/_protected/record/submit")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordSubmitPage,
});

function RecordSubmitPage() {
  const launcher = Route.useSearch();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const getSignedUploadUrl = api.fitFiles.getSignedUploadUrl.useMutation();
  const processFitFile = api.fitFiles.processFitFile.useMutation();
  const [selectedFiles, setSelectedFiles] = useState<Array<{ file?: File; name: string }>>([]);
  const [activityType, setActivityType] = useState(launcher.category);
  const [phase, setPhase] = useState<"idle" | "signing" | "uploading" | "processing" | "success">(
    "idle",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    activityId: string;
    fileName: string;
    name: string;
  } | null>(null);
  const form = useForm<ImportMetadataInput, undefined, ImportMetadataValues>({
    resolver: zodResolver(importMetadataSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  useEffect(() => {
    const fileName = selectedFiles[0]?.name;
    const currentName = form.getValues("name");
    if (!fileName || (typeof currentName === "string" && currentName.trim().length > 0)) {
      return;
    }

    form.setValue("name", fileName.replace(/\.fit$/i, ""), { shouldDirty: true });
  }, [form, selectedFiles]);

  const isSubmitting = phase !== "idle" && phase !== "success";

  const onSubmit = form.handleSubmit(async (values) => {
    const file = selectedFiles[0]?.file;

    if (!file) {
      setFormError("Choose a FIT file before importing.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".fit")) {
      setFormError("Only FIT files are supported right now.");
      return;
    }

    setFormError(null);

    try {
      setPhase("signing");
      const signedUpload = await getSignedUploadUrl.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
      });

      setPhase("uploading");
      await uploadFitFileToSignedUrl(file, signedUpload.signedUrl);

      setPhase("processing");
      const result = await processFitFile.mutateAsync({
        fitFilePath: signedUpload.filePath,
        name: values.name.trim(),
        notes: values.notes?.trim() || undefined,
        activityType,
        importProvenance: buildManualHistoricalImportProvenance(file.name),
      });

      await invalidatePostActivityIngestionQueries(queryClient);
      await utils.activities.invalidate();

      setSummary({
        activityId: result.activity.id,
        fileName: file.name,
        name: result.activity.name,
      });
      setPhase("success");
      toast.success("FIT activity imported");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      setPhase("idle");
      setFormError(message);
      toast.error("FIT import failed");
    }
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>FIT ingestion</Badge>
            <Badge variant="outline">Existing backend path</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Submit or import a FIT file
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browser submission uses the same signed-upload plus `processFitFile` flow as mobile.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/record" search={launcher}>
            Back to launcher
          </Link>
        </Button>
      </div>

      {summary ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Imported {summary.name}
            </div>
            <p className="text-sm text-muted-foreground">
              {summary.fileName} finished processing and was stored as activity `
              {summary.activityId}`.
            </p>
            <div>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFiles([]);
                  setSummary(null);
                  setPhase("idle");
                  form.reset({ name: "", notes: "" });
                }}
              >
                Import another FIT file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileUp className="h-5 w-5 text-muted-foreground" />
            Completed activity import
          </CardTitle>
          <CardDescription>
            Supported now: one completed `.fit` file per submission. Live browser recording still
            lands in a later tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
            <FileInput
              accept=".fit,application/octet-stream"
              files={selectedFiles}
              helperText="Historical FIT imports keep the timestamps encoded in the file."
              id="record-fit-upload"
              label="FIT file"
              name="fitFile"
              onFilesChange={(files) => {
                setSelectedFiles(files);
                setFormError(null);
              }}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="record-import-name">Activity name</Label>
                <Input
                  id="record-import-name"
                  {...form.register("name")}
                  placeholder="Morning ride"
                />
                {form.formState.errors.name ? (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="record-import-type">Activity type</Label>
                <Select
                  value={activityType}
                  onValueChange={(value) => setActivityType(value as typeof activityType)}
                >
                  <SelectTrigger id="record-import-type">
                    <SelectValue placeholder="Choose activity type" />
                  </SelectTrigger>
                  <SelectContent>
                    {recordingActivityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-import-notes">Notes</Label>
              <Textarea
                id="record-import-notes"
                {...form.register("notes")}
                rows={6}
                placeholder="Optional workout notes"
              />
              {form.formState.errors.notes ? (
                <p className="text-sm text-destructive">{form.formState.errors.notes.message}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Visibility and post-import editing stay on the existing activity surfaces. This stage
              focuses on browser-native ingestion only.
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phase === "signing"
                  ? "Preparing upload"
                  : phase === "uploading"
                    ? "Uploading FIT file"
                    : phase === "processing"
                      ? "Processing activity"
                      : "Import FIT activity"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedFiles[0]?.name ?? "No FIT file selected yet."}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
