import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { buildManualActivityImportProvenance } from "@repo/core/activity-files";
import { canonicalSportSchema } from "@repo/core/schemas/sport";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ActivityImportForm,
  type ActivityImportPhase,
  type BrowserActivityImportValues,
} from "../../../components/protected/activity-import-form";
import { uploadFileToSignedUrl } from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";
import { type RecordingLauncherSearch, validateRecordingSearch } from "../../../lib/recording-web";

export type ActivityImportSearch = Partial<RecordingLauncherSearch> & {
  activityType?: "run" | "bike" | "swim" | "strength" | "other";
  from?: "record";
};

export function validateActivityImportSearch(
  search: Record<string, unknown>,
): ActivityImportSearch {
  const activityType = canonicalSportSchema.safeParse(search.activityType).success
    ? canonicalSportSchema.parse(search.activityType)
    : canonicalSportSchema.safeParse(search.category).success
      ? canonicalSportSchema.parse(search.category)
      : "bike";

  const from = search.from === "record" ? "record" : undefined;
  const recordingSearch =
    from === "record"
      ? validateRecordingSearch({
          ...search,
          category: search.category ?? activityType,
        })
      : undefined;

  return {
    ...recordingSearch,
    activityType,
    from,
  };
}

export const Route = createFileRoute("/_protected/activities/import")({
  component: ActivityImportPage,
  validateSearch: validateActivityImportSearch,
});

export function ActivityImportPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const getSignedUrlMutation = api.activityFiles.getSignedUploadUrl.useMutation();
  const processActivityFileMutation = api.activityFiles.processActivityFile.useMutation();
  const [phase, setPhase] = useState<ActivityImportPhase>("idle");
  const [importedActivity, setImportedActivity] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const importInFlight = useRef(false);
  const importedActivityRef = useRef<{ id: string; name: string } | null>(null);

  const openImportedActivity = async (activity: { id: string; name: string }) => {
    setNavigationPending(true);
    try {
      await navigate({
        params: { activityId: activity.id },
        to: "/activities/$activityId",
      });
      setNavigationFailed(false);
    } catch {
      setNavigationFailed(true);
    } finally {
      setNavigationPending(false);
    }
  };

  const importActivity = async (values: BrowserActivityImportValues) => {
    if (importInFlight.current || importedActivityRef.current) {
      return;
    }
    importInFlight.current = true;

    let activity: { id: string; name: string };
    try {
      setPhase("signing");
      const signedUrlData = await getSignedUrlMutation.mutateAsync({
        fileName: values.file.name,
        fileSize: values.file.size,
      });

      setPhase("uploading");
      await uploadFileToSignedUrl(values.file, signedUrlData.signedUrl);

      setPhase("processing");
      const result = await processActivityFileMutation.mutateAsync({
        activityFilePath: signedUrlData.filePath,
        activityType: values.sport,
        importProvenance: buildManualActivityImportProvenance(values.file.name),
        name: values.name,
        notes: values.notes ?? undefined,
      });
      activity = result.activity;
    } catch (error) {
      setPhase("idle");
      toast.error("Activity import failed");
      importInFlight.current = false;
      throw error;
    }

    importedActivityRef.current = activity;
    setImportedActivity(activity);
    setPhase("success");
    toast.success(`Imported ${activity.name}`);

    await Promise.allSettled([
      Promise.resolve().then(() => invalidatePostActivityIngestionQueries(queryClient)),
      Promise.resolve().then(() => utils.activities.invalidate()),
    ]);
    await openImportedActivity(activity);
    importInFlight.current = false;
  };

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
        <CardContent>
          <ActivityImportForm
            initialSport={search.activityType ?? "bike"}
            onCancel={() => {
              if (search.from === "record") {
                void navigate({
                  search: validateRecordingSearch(search),
                  to: "/record",
                });
                return;
              }
              void navigate({ to: "/activities" });
            }}
            onSubmit={importActivity}
            phase={phase}
          />
        </CardContent>
      </Card>

      {importedActivity && navigationFailed ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive" role="alert">
              {importedActivity.name} was imported successfully, but it could not be opened
              automatically. You do not need to import the file again.
            </p>
            <Button
              disabled={navigationPending}
              onClick={() => void openImportedActivity(importedActivity)}
              type="button"
            >
              {navigationPending ? "Opening activity..." : "Open activity"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
