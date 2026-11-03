import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { getNormalizedPowerPresentation } from "@repo/ui/lib/normalized-power-presentation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Lock, Share2, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActivityPlaybackCard } from "../../../../components/activity/activity-playback-card";
import { SessionRpeCard } from "../../../../components/activity/session-rpe-card";
import {
  ActivityStreamChartsCard,
  ActivitySwimDetailCards,
} from "../../../../components/protected/activity-file-detail-cards";
import {
  ActivityListCard,
  DetailMetricGrid,
  DetailPageIntro,
  EntityMapCard,
  LikeToggleButton,
} from "../../../../components/protected/activity-route-primitives";
import { ActivityStreamAnalysisCard } from "../../../../components/protected/activity-stream-analysis-card";
import { EntityCommentsCard } from "../../../../components/protected/entity-comments-card";
import { useViewingUserPreferredUnitSystem } from "../../../../hooks/use-viewing-user-preferred-unit-system";
import { formatCalibrationQuality } from "../../../../lib/activity-load-presentation";
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  getActivityBadgeLabel,
  getActivityCoordinates,
  summarizeActivityStreams,
} from "../../../../lib/activity-route-helpers";
import { api } from "../../../../lib/api/client";
import { loadRouteQuery } from "../../../../lib/api/route-loading";
import { summarizeRecordingExecution } from "../../../../lib/recording/execution-review";

type ContentVisibility = "private" | "followers" | "public";

const VISIBILITY_OPTIONS: Array<{ value: ContentVisibility; label: string; description: string }> =
  [
    { value: "private", label: "Private", description: "Only you can access this activity." },
    { value: "followers", label: "Followers", description: "Followers can access this activity." },
    { value: "public", label: "Public", description: "Anyone with the public link can view it." },
  ];

function getVisibilityLabel(visibility: ContentVisibility) {
  return VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ?? "Private";
}

function formatEffortValue(value: number, unit: string) {
  if (unit === "watts") return `${Math.round(value)} W`;
  if (unit === "bpm") return `${Math.round(value)} bpm`;
  if (unit === "meters_per_second") return `${value.toFixed(2)} m/s`;
  return `${value.toFixed(2)} ${unit}`;
}

export const Route = createFileRoute("/_protected/activities/$activityId/")({
  loader: async ({ context, params }) => {
    void context.apiUtils.activities.listPaginated.prefetch({ limit: 20 }).catch(() => undefined);
    const input = { id: params.activityId };
    const efforts = loadRouteQuery(
      () => context.apiUtils.activities.getEfforts.getData(input),
      () => context.apiUtils.activities.getEfforts.fetch(input),
    );
    await loadRouteQuery(
      () => context.apiUtils.activities.getById.getData(input),
      () => context.apiUtils.activities.getById.fetch(input),
    );
    await efforts;
  },
  component: ActivityDetailPage,
});

function ActivityDetailPage() {
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { activityId } = Route.useParams();
  const [streamSelection, setStreamSelection] = useState<{
    activityId: string;
    segmentId: string;
  } | null>(null);
  const streamSelectorId = useId();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [failedLikeIntent, setFailedLikeIntent] = useState<boolean | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [sourceMoveTargets, setSourceMoveTargets] = useState<Record<string, string>>({});
  const [sourceMoveStatus, setSourceMoveStatus] = useState<{
    sourceId: string;
    pending: boolean;
    error: boolean;
    message: string;
  } | null>(null);
  const sourceMovePending = useRef(false);
  const sourceContext = useRef(activityId);
  sourceContext.current = activityId;
  const activityQuery = api.activities.getById.useQuery({ id: activityId });
  const ownedActivitiesQuery = api.activities.listPaginated.useQuery({ limit: 20 });
  const effortsQuery = api.activities.getEfforts.useQuery({ id: activityId });
  const detail = activityQuery.data?.detail;
  const activity = detail?.summary;
  const derived = activityQuery.data?.analysis.derived;
  const categories = activity?.activityComposition.categories ?? [];
  const singleCategory = categories.length === 1 ? categories[0] : null;
  const normalizedPowerAnalysis = useMemo(() => {
    const activitySegments = (detail?.segments ?? []).filter(
      (segment) => segment.role === "activity",
    );
    const segment = activitySegments.length === 1 ? activitySegments[0] : undefined;
    return {
      segment,
      presentation:
        segment?.status === "available"
          ? getNormalizedPowerPresentation(segment.summary.normalizedPowerResult)
          : null,
    };
  }, [detail?.segments]);
  const normalizedPowerPresentation = normalizedPowerAnalysis.presentation;
  const normalizedPowerAnalysisStatus = normalizedPowerAnalysis.segment?.status;
  const recordingExecutionReview = summarizeRecordingExecution(detail?.segments ?? []);
  const currentArtifactLabel =
    detail?.currentArtifact?.originalName ?? detail?.currentArtifact?.format ?? null;
  const activityStreamSegments = (detail?.segments ?? [])
    .filter((segment) => segment.role === "activity")
    .sort((left, right) => left.ordinal - right.ordinal);
  const selectedStreamSegment =
    activityStreamSegments.find(
      (segment) =>
        streamSelection?.activityId === activityId && segment.id === streamSelection.segmentId,
    ) ?? activityStreamSegments[0];
  const streamScopeDescription =
    activityStreamSegments.length > 1 && selectedStreamSegment?.activityCategory
      ? `Showing recorded segment ${activityStreamSegments.indexOf(selectedStreamSegment) + 1} of ${activityStreamSegments.length} (${getActivityBadgeLabel(selectedStreamSegment.activityCategory).toLowerCase()}).`
      : undefined;
  const segmentQuantifications = activityQuery.data?.analysis.segmentLoads.map(
    (segment) => segment.observationQuantification,
  );
  const loadPresentation = getActivityQuantificationPresentation(
    derived?.observationQuantification,
    {
      hasHeartRateSummary:
        typeof detail?.performance.averageHeartRate === "number" &&
        detail.performance.averageHeartRate > 0,
    },
  );
  const calibrationCommonLoad =
    segmentQuantifications?.length === 1 ? segmentQuantifications[0]?.members[0]?.commonLoad : null;
  const calibrationText = formatCalibrationQuality(
    calibrationCommonLoad && calibrationCommonLoad.status !== "unavailable"
      ? calibrationCommonLoad.quality
      : null,
    activity?.time.startedAt,
  );
  const isOwner = activity?.capabilities.canEdit ?? false;
  const completedActivityProvidersQuery =
    api.activities.getCompletedActivityProviderEligibility.useQuery(
      { activityId },
      {
        enabled: isOwner,
        refetchInterval: (query) =>
          query.state.data?.some(
            (provider) => provider.status === "queued" || provider.status === "running",
          )
            ? 5_000
            : false,
      },
    );
  const stravaCompletedActivity = completedActivityProvidersQuery.data?.find(
    (provider) => provider.provider === "strava",
  );
  const ingestion = detail?.ingestion;
  const ingestionStatus = ingestion?.status ?? null;
  const hasFailedIngestion = ingestionStatus?.startsWith("failed") ?? false;
  const isStreamProcessing = Boolean(
    ingestionStatus &&
      ingestionStatus !== "ready" &&
      ingestionStatus !== "succeeded" &&
      !hasFailedIngestion,
  );
  const canLoadStreamAnalysis = Boolean(
    detail?.currentArtifact &&
      selectedStreamSegment &&
      activity?.id === activityId &&
      !activityQuery.isError &&
      isOwner &&
      !isStreamProcessing &&
      !hasFailedIngestion,
  );
  const profileQuery = api.profiles.getPublicById.useQuery(
    { id: activity?.owner.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activity?.owner.id) },
  );
  const streamsQuery = api.activityFiles.getStreams.useQuery(
    {
      activityId,
      scope: { type: "segment", segmentId: selectedStreamSegment?.id ?? activityId },
    },
    {
      enabled: canLoadStreamAnalysis,
      staleTime: 5 * 60 * 1000,
    },
  );
  const streamArtifactState = !detail?.currentArtifact
    ? isStreamProcessing
      ? "processing"
      : "missing"
    : isStreamProcessing
      ? "processing"
      : !isOwner
        ? "private"
        : hasFailedIngestion || streamsQuery.isError || !selectedStreamSegment
          ? "error"
          : streamsQuery.isLoading || streamsQuery.isPlaceholderData
            ? "loading"
            : "ready";
  const streamErrorMessage = hasFailedIngestion
    ? (ingestion?.lastErrorMessage ?? "Activity file processing failed.")
    : !selectedStreamSegment
      ? "No recorded activity segment is available."
      : streamsQuery.error?.message;
  const scopedStreams = streamArtifactState === "ready" ? streamsQuery.data : undefined;
  const retryLikeLabel =
    failedLikeIntent === null ? undefined : failedLikeIntent ? "Retry like" : "Retry unlike";
  const toggleLikeMutation = api.social.toggleLike.useMutation({
    retry: false,
    onError: () => toast.error("Like update failed"),
  });
  const updateMutation = api.activities.update.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.activities.getById.invalidate({ id: variables.id });
      void utils.activities.listPaginated.invalidate();
      setVisibilityDialogOpen(false);
      toast.success("Visibility updated");
    },
  });
  const deleteMutation = api.activities.delete.useMutation({
    retry: false,
    onMutate: () => setDeleteFailed(false),
    onError: () => setDeleteFailed(true),
    onSuccess: () => {
      void utils.activities.listPaginated.invalidate();
      toast.success("Activity deleted");
      void navigate({ to: "/activities" });
    },
  });
  const resolveImportedSourceMutation = api.activities.resolveImportedSource.useMutation({
    retry: false,
    onSuccess: async () => {
      await utils.activities.getById.invalidate({ id: activityId });
    },
    onError: () => toast.error("Imported source could not be updated"),
  });
  const keepImportedSourceSeparateMutation = api.activities.keepImportedSourceSeparate.useMutation({
    onSuccess: () => toast.success("Separate activity import queued"),
    onError: () => toast.error("Separate activity could not be queued"),
  });
  const sourceActionPending =
    sourceMoveStatus?.pending ||
    resolveImportedSourceMutation.isPending ||
    keepImportedSourceSeparateMutation.isPending;
  const moveSource = (sourceId: string) => {
    const targetActivityId = sourceMoveTargets[sourceId];
    if (
      sourceMovePending.current ||
      sourceActionPending ||
      !targetActivityId ||
      ownedActivitiesQuery.isLoading ||
      ownedActivitiesQuery.isError ||
      !ownedActivitiesQuery.data?.items.some(
        (candidate) => candidate.id === targetActivityId && candidate.id !== activityId,
      )
    )
      return;
    sourceMovePending.current = true;
    setSourceMoveStatus({ sourceId, pending: true, error: false, message: "Moving source…" });
    resolveImportedSourceMutation.mutate(
      { action: "move", sourceReferenceId: sourceId, targetActivityId },
      {
        onSuccess: () => {
          if (sourceContext.current !== activityId) return;
          setSourceMoveTargets((targets) => ({ ...targets, [sourceId]: "" }));
          setSourceMoveStatus({ sourceId, pending: false, error: false, message: "Source moved." });
        },
        onError: () => {
          if (sourceContext.current !== activityId) return;
          setSourceMoveStatus({
            sourceId,
            pending: false,
            error: true,
            message:
              "The source move could not be confirmed. Refresh activities before confirming again.",
          });
        },
        onSettled: () => {
          if (sourceContext.current === activityId) sourceMovePending.current = false;
        },
      },
    );
  };
  const sendCompletedActivityMutation = api.activities.sendCompletedActivityToProvider.useMutation({
    retry: false,
    onSuccess: (result) => {
      if (result.status === "queued") toast.success("Strava upload queued");
      else if (result.status === "completed") toast.success("Activity already sent to Strava");
      else if (result.status === "reconnect_required") {
        toast.error("Reconnect Strava to grant activity upload access");
      } else if (result.status === "unsupported_evidence") {
        toast.error("A current accepted FIT, TCX, or GPX file is required");
      } else if (result.status === "dispatch_uncertain") {
        toast.error("Upload outcome is uncertain and will not be retried automatically");
      } else toast.error("Activity could not be sent to Strava");
      void utils.activities.getCompletedActivityProviderEligibility.invalidate({ activityId });
    },
    onError: () => toast.error("Activity could not be sent to Strava"),
  });

  useEffect(() => {
    setLiked(activity?.engagement.viewerHasLiked ?? false);
    setLikesCount(activity?.engagement.likes ?? 0);
  }, [activity?.engagement.likes, activity?.engagement.viewerHasLiked]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new activity owns new retry state.
  useEffect(() => {
    setFailedLikeIntent(null);
    setDeleteFailed(false);
  }, [activity?.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new activity owns a new source-selection draft.
  useEffect(() => {
    setSourceMoveTargets({});
    setSourceMoveStatus(null);
    setStreamSelection(null);
    sourceMovePending.current = false;
  }, [activityId]);

  const coordinates = useMemo(
    () => getActivityCoordinates(detail?.routePolyline, scopedStreams?.records),
    [detail?.routePolyline, scopedStreams?.records],
  );
  const streamHighlights = useMemo(
    () => summarizeActivityStreams(scopedStreams?.records, unitSystem),
    [scopedStreams?.records, unitSystem],
  );
  const contentVisibility = activity?.visibility ?? "private";

  const handleLikeToggle = async () => {
    if (!activity) return;
    const intendedLiked = failedLikeIntent ?? !liked;
    let previousLiked = liked;
    let previousCount = likesCount;

    if (failedLikeIntent !== null) {
      const refreshed = await activityQuery.refetch();
      const authoritativeLiked = refreshed.data?.detail.summary.engagement.viewerHasLiked;
      const authoritativeCount = refreshed.data?.detail.summary.engagement.likes;
      if (typeof authoritativeLiked === "boolean") {
        previousLiked = authoritativeLiked;
        previousCount = authoritativeCount ?? previousCount;
        setLiked(authoritativeLiked);
        setLikesCount(previousCount);
        if (authoritativeLiked === intendedLiked) {
          setFailedLikeIntent(null);
          return;
        }
      }
    }

    setFailedLikeIntent(null);
    setLiked(intendedLiked);
    setLikesCount(intendedLiked ? previousCount + 1 : Math.max(0, previousCount - 1));
    toggleLikeMutation.mutate(
      { entity_id: activity.id, entity_type: "activity" },
      {
        onError: () => {
          setLiked(previousLiked);
          setLikesCount(previousCount);
          setFailedLikeIntent(intendedLiked);
        },
      },
    );
  };

  const handleShare = async () => {
    if (!activity) return;
    if (contentVisibility !== "public") {
      toast.info("Only public activities have a share link. Change visibility to Public first.");
      return;
    }

    const url = new URL(`/share/activities/${activity.id}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public activity link copied");
    } catch {
      toast.error(
        "The public activity link could not be copied. Copy it from the address bar instead.",
      );
    }
  };

  if (
    activityQuery.isLoading ||
    (!activityQuery.isError && activity && activity.id !== activityId)
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-muted-foreground" />
        <span role="status" className="sr-only">
          Loading activity…
        </span>
      </div>
    );
  }

  if (activityQuery.isError) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardContent className="space-y-3 py-10">
            <p role="alert">Activity could not be loaded.</p>
            <Button type="button" variant="outline" onClick={() => void activityQuery.refetch()}>
              Retry activity
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activity || !detail) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Activity not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <>
            <LikeToggleButton
              count={likesCount}
              liked={liked}
              onClick={() => void handleLikeToggle()}
              pending={toggleLikeMutation.isPending}
              {...(retryLikeLabel ? { retryLabel: retryLikeLabel } : {})}
            />
            {isOwner ? (
              <Dialog open={visibilityDialogOpen} onOpenChange={setVisibilityDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <Lock className="mr-2 h-4 w-4" />
                    Change visibility
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change visibility</DialogTitle>
                    <DialogDescription>
                      Current visibility is {getVisibilityLabel(contentVisibility)}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    {VISIBILITY_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        aria-pressed={option.value === contentVisibility}
                        disabled={updateMutation.isPending || option.value === contentVisibility}
                        onClick={() =>
                          updateMutation.mutate({
                            id: activity.id,
                            content_visibility: option.value,
                          })
                        }
                        type="button"
                        variant={option.value === contentVisibility ? "default" : "outline"}
                        className="h-auto justify-start py-3 text-left"
                      >
                        <span>
                          <span className="block font-medium">{option.label}</span>
                          <span className="block text-xs opacity-80">{option.description}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
            {isOwner && stravaCompletedActivity?.status === "ready" ? (
              <Button
                disabled={sendCompletedActivityMutation.isPending}
                onClick={() =>
                  sendCompletedActivityMutation.mutate({
                    activityId: activity.id,
                    provider: "strava",
                  })
                }
                type="button"
                variant="outline"
              >
                {sendCompletedActivityMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-4 w-4" />
                )}
                Send to Strava
              </Button>
            ) : null}
            {isOwner &&
            (stravaCompletedActivity?.status === "queued" ||
              stravaCompletedActivity?.status === "running" ||
              stravaCompletedActivity?.status === "completed") ? (
              <Button disabled type="button" variant="outline">
                {stravaCompletedActivity.status !== "completed" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-4 w-4" />
                )}
                {stravaCompletedActivity.status === "completed"
                  ? "Sent to Strava"
                  : stravaCompletedActivity.status === "running"
                    ? "Sending to Strava"
                    : "Strava upload queued"}
              </Button>
            ) : null}
            <Button onClick={handleShare} type="button" variant="outline">
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            {isOwner ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete activity?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the activity and its saved streams.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate({ id: activity.id })}>
                      Delete activity
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
        badges={[
          getVisibilityLabel(contentVisibility),
          activity.time.startedAt ? formatDateTime(activity.time.startedAt) : "—",
        ]}
        categories={categories}
        description={activity.notes || "No notes attached to this activity."}
        eyebrow="Activity detail"
        title="Activity"
      />

      <ActivityListCard activity={activity} />

      {deleteFailed ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Activity could not be deleted. Nothing was removed.
        </div>
      ) : null}

      {isOwner && stravaCompletedActivity?.status === "reconnect_required" ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <span>{stravaCompletedActivity.reason}</span>{" "}
          <Link className="font-medium text-primary underline" to="/integrations">
            Reconnect Strava
          </Link>
        </div>
      ) : null}

      {isOwner &&
      (stravaCompletedActivity?.status === "dispatch_uncertain" ||
        stravaCompletedActivity?.status === "failed") ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {stravaCompletedActivity.reason}
        </div>
      ) : null}

      <DetailMetricGrid
        items={[
          { label: loadPresentation.commonLoad.label, value: loadPresentation.commonLoad.value },
          {
            label: loadPresentation.normalizedIntensity.label,
            value: loadPresentation.normalizedIntensity.value,
          },
          ...(loadPresentation.nativeIntensity.status === "unavailable"
            ? []
            : [
                {
                  label: loadPresentation.nativeIntensity.label,
                  value: loadPresentation.nativeIntensity.value,
                },
              ]),
          {
            label: "Distance",
            value: formatDistance(detail.performance.distanceMeters, unitSystem),
          },
          {
            label: "Elapsed",
            value: formatDuration(detail.performance.elapsedSeconds),
          },
          {
            label: "Active",
            value: `${detail.performance.timingCoverage === "partial" && detail.performance.activeSeconds !== null ? "~" : ""}${formatDuration(detail.performance.activeSeconds)}`,
          },
          {
            label: "Moving",
            value: `${detail.performance.timingCoverage === "partial" && detail.performance.movingSeconds !== null ? "~" : ""}${formatDuration(detail.performance.movingSeconds)}`,
          },
          { label: "Avg power", value: formatPower(detail.performance.averagePower) },
          {
            label: "Avg heart rate",
            value: formatHeartRate(detail.performance.averageHeartRate),
          },
          {
            label: singleCategory === "run" ? "Avg pace" : "Avg speed",
            value:
              singleCategory === "run"
                ? formatPace(detail.performance.averageSpeedMetersPerSecond, unitSystem)
                : formatSpeed(detail.performance.averageSpeedMetersPerSecond, unitSystem),
          },
          {
            label: normalizedPowerPresentation?.label ?? "Normalized power",
            value:
              normalizedPowerAnalysisStatus === "processing"
                ? "Processing"
                : normalizedPowerAnalysisStatus === "failed"
                  ? "Analysis failed"
                  : normalizedPowerPresentation?.status === "unavailable"
                    ? "—"
                    : `${normalizedPowerPresentation?.status === "partial" ? "~" : ""}${formatPower(normalizedPowerPresentation?.valueWatts)}`,
          },
          {
            label: "Started",
            value: activity.time.startedAt ? formatDateTime(activity.time.startedAt) : "—",
          },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        {loadPresentation.commonLoad.evidence}. {loadPresentation.commonLoad.explanation}
      </p>
      {loadPresentation.commonLoad.diagnostic ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{loadPresentation.commonLoad.diagnostic.summary}</p>
          <p>{loadPresentation.commonLoad.diagnostic.action}</p>
        </div>
      ) : null}
      {calibrationText ? <p className="text-sm text-muted-foreground">{calibrationText}</p> : null}
      {normalizedPowerPresentation ? (
        <p className="text-sm text-muted-foreground">{normalizedPowerPresentation.evidence}</p>
      ) : normalizedPowerAnalysisStatus === "processing" ? (
        <p className="text-sm text-muted-foreground" data-testid="segment-analysis-processing">
          Segment analysis is still processing. Normalized power will appear when it completes.
        </p>
      ) : normalizedPowerAnalysis.segment?.status === "failed" ? (
        <p className="text-sm text-destructive" data-testid="segment-analysis-failed">
          Segment analysis failed: {normalizedPowerAnalysis.segment.reason}
        </p>
      ) : null}

      {recordingExecutionReview ? (
        <Card data-testid="recording-execution-review">
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Plan execution
            </CardTitle>
            <CardDescription>
              Saved recorder evidence. This reports timer actions, not target adherence or sensor
              performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-muted-foreground">Completed</dt>
                <dd className="text-xl font-semibold">
                  {recordingExecutionReview.completedOccurrences}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Skipped</dt>
                <dd className="text-xl font-semibold">
                  {recordingExecutionReview.skippedOccurrences}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Automatic completions</dt>
                <dd className="text-xl font-semibold">
                  {recordingExecutionReview.automaticallyCompletedOccurrences}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Manual completions</dt>
                <dd className="text-xl font-semibold">
                  {recordingExecutionReview.manuallyCompletedOccurrences}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              {recordingExecutionReview.coverage === "complete"
                ? `All ${recordingExecutionReview.totalOccurrences} recorded plan steps have a saved completion status.`
                : `${recordingExecutionReview.classifiedOccurrences} of ${recordingExecutionReview.totalOccurrences} recorded plan steps have a saved completion status.`}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="activity-derived-efforts">
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Derived efforts
          </CardTitle>
          <CardDescription>
            Best efforts calculated from this activity's canonical segments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {effortsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading derived efforts…</p>
          ) : effortsQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Derived efforts could not be loaded.
            </p>
          ) : effortsQuery.data?.length ? (
            <ul className="divide-y">
              {effortsQuery.data.map((effort) => (
                <li className="flex items-center justify-between gap-4 py-3" key={effort.id}>
                  <div>
                    <p className="font-medium capitalize">
                      {effort.activity_category} {effort.effort_type.replaceAll("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDuration(effort.duration_seconds)}
                      {effort.distance_meters ? ` · ${effort.distance_meters} m` : ""}
                    </p>
                  </div>
                  <p className="font-semibold">{formatEffortValue(effort.value, effort.unit)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No derived efforts are available for this activity.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <EntityMapCard
          coordinates={coordinates}
          emptyMessage={
            detail.currentArtifact
              ? "Location records were not available in the imported activity file."
              : "This activity has no stored route preview yet."
          }
          subtitle="Web-first map preview built from the saved polyline or FIT records."
          title="Route preview"
        />

        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">Owner</p>
              {profileQuery.data ? (
                <Link
                  className="text-sm text-primary hover:underline"
                  params={{ userId: profileQuery.data.id }}
                  search={{ flash: undefined, flashType: undefined }}
                  to="/user/$userId"
                >
                  {profileQuery.data.username ?? "GradientPeak athlete"}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Owner unavailable</p>
              )}
            </div>
            {detail.linkedPlan ? (
              <div>
                <p className="text-sm font-medium text-foreground">Linked activity plan</p>
                <p className="text-sm text-muted-foreground">{detail.linkedPlan.name}</p>
              </div>
            ) : null}
            {detail.linkedRoute ? (
              <div>
                <p className="text-sm font-medium text-foreground">Linked route</p>
                <Link
                  className="text-sm text-primary hover:underline"
                  params={{ routeId: detail.linkedRoute.id }}
                  to="/routes/$routeId"
                >
                  {detail.linkedRoute.name}
                </Link>
              </div>
            ) : null}
            <div>
              <p className="text-sm font-medium text-foreground">Source artifact</p>
              <p className="text-sm text-muted-foreground">
                {currentArtifactLabel ?? "No source artifact is available."}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Visibility</p>
              <p className="text-sm text-muted-foreground">
                {contentVisibility === "private"
                  ? "Only you can access this activity."
                  : contentVisibility === "followers"
                    ? "Followers can access this activity."
                    : "Anyone with the public link can view this activity."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {activityStreamSegments.length > 1 ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={streamSelectorId}>
            Recorded segment
          </label>
          <select
            id={streamSelectorId}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedStreamSegment?.id ?? ""}
            onChange={(event) =>
              setStreamSelection({ activityId, segmentId: event.currentTarget.value })
            }
          >
            {activityStreamSegments.map((segment, index) => (
              <option key={segment.id} value={segment.id}>
                Segment {index + 1} · {getActivityBadgeLabel(segment.activityCategory ?? "other")}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <ActivityPlaybackCard
        sourceKey={`${activityId}:${detail.currentArtifact?.id ?? "none"}:${selectedStreamSegment?.id ?? "none"}`}
        availability={streamArtifactState}
        {...(scopedStreams?.records ? { records: scopedStreams.records } : {})}
        {...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {})}
        {...(canLoadStreamAnalysis
          ? {
              onRetry: () => {
                void streamsQuery.refetch();
              },
            }
          : {})}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
      />

      <ActivityStreamChartsCard
        {...(scopedStreams?.records === undefined ? {} : { records: scopedStreams.records })}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
      />

      <ActivityStreamAnalysisCard
        {...(scopedStreams?.analysis === undefined ? {} : { analysis: scopedStreams.analysis })}
        artifactState={streamArtifactState}
        {...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {})}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
      />

      <ActivitySwimDetailCards
        {...(selectedStreamSegment?.activityCategory === undefined
          ? {}
          : { activityCategory: selectedStreamSegment.activityCategory })}
        {...(scopedStreams?.laps === undefined ? {} : { laps: scopedStreams.laps })}
        {...(scopedStreams?.lengths === undefined ? {} : { lengths: scopedStreams.lengths })}
        poolLengthMeters={detail.performance.poolLengthMeters}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
        {...(scopedStreams?.summary === undefined ? {} : { summary: scopedStreams.summary })}
      />

      {isOwner ? (
        <SessionRpeCard
          activityId={activity.id}
          effectiveSessionRpe={detail.effectiveSessionRpe}
          estimatedMethod={
            calibrationCommonLoad && "method" in calibrationCommonLoad
              ? calibrationCommonLoad.method
              : null
          }
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Stream highlights
          </CardTitle>
          <CardDescription>
            {streamScopeDescription ?? "Range and peak values from the accepted activity stream."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {streamHighlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stream range or peak summary is available for this scope.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {streamHighlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && activityQuery.data?.importedSources?.length ? (
        <details
          className="rounded-xl border border-border px-4 py-3"
          data-testid="imported-sources"
        >
          <summary className="cursor-pointer text-sm font-medium">Imported sources</summary>
          <div className="mt-3 space-y-2">
            {activityQuery.data.importedSources.map((source) => (
              <div className="flex items-center justify-between gap-3 text-sm" key={source.id}>
                <span>
                  <span className="font-medium capitalize">{source.provider}</span>
                  <span className="ml-2 text-muted-foreground">
                    {source.resolutionStatus === "review" ? "Needs review" : "Connected source"}
                  </span>
                </span>
                {source.resolutionStatus === "review" ? (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      disabled={Boolean(sourceActionPending)}
                      onClick={() =>
                        resolveImportedSourceMutation.mutate({
                          action: "confirm_same",
                          sourceReferenceId: source.id,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Same activity
                    </Button>
                    <Button
                      disabled={Boolean(sourceActionPending)}
                      onClick={() =>
                        keepImportedSourceSeparateMutation.mutate({ sourceReferenceId: source.id })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Keep separate
                    </Button>
                    <label className="sr-only" htmlFor={`move-source-${source.id}`}>
                      Move to an activity
                    </label>
                    <select
                      aria-describedby={
                        sourceMoveStatus?.sourceId === source.id
                          ? `move-source-status-${source.id}`
                          : undefined
                      }
                      value={sourceMoveTargets[source.id] ?? ""}
                      disabled={
                        Boolean(sourceActionPending) ||
                        ownedActivitiesQuery.isLoading ||
                        ownedActivitiesQuery.isError
                      }
                      id={`move-source-${source.id}`}
                      onChange={(event) => {
                        setSourceMoveTargets((targets) => ({
                          ...targets,
                          [source.id]: event.target.value,
                        }));
                      }}
                    >
                      <option value="">Move to activity…</option>
                      {(ownedActivitiesQuery.data?.items ?? [])
                        .filter((candidate) => candidate.id !== activityId)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                    </select>
                    <Button
                      disabled={
                        Boolean(sourceActionPending) ||
                        ownedActivitiesQuery.isLoading ||
                        ownedActivitiesQuery.isError ||
                        !ownedActivitiesQuery.data?.items.some(
                          (candidate) =>
                            candidate.id === sourceMoveTargets[source.id] &&
                            candidate.id !== activityId,
                        )
                      }
                      onClick={() => moveSource(source.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Confirm move
                    </Button>
                    {ownedActivitiesQuery.isLoading ? (
                      <span role="status">Loading activities…</span>
                    ) : null}
                    {ownedActivitiesQuery.isError ? (
                      <span role="alert">
                        Activities could not be loaded.
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void ownedActivitiesQuery.refetch()}
                        >
                          Retry activities
                        </Button>
                      </span>
                    ) : null}
                    {sourceMoveStatus?.sourceId === source.id ? (
                      <span
                        id={`move-source-status-${source.id}`}
                        role={sourceMoveStatus.error ? "alert" : "status"}
                      >
                        {sourceMoveStatus.message}
                        {sourceMoveStatus.error ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void Promise.all([
                                activityQuery.refetch(),
                                ownedActivitiesQuery.refetch(),
                              ])
                            }
                          >
                            Refresh activities
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                    <Button
                      disabled={Boolean(sourceActionPending)}
                      onClick={() =>
                        resolveImportedSourceMutation.mutate({
                          action: "ignore",
                          sourceReferenceId: source.id,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Ignore
                    </Button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <EntityCommentsCard
        entityId={activity.id}
        entityType="activity"
        helperText="Discuss the activity, ask follow-up questions, or leave coaching notes."
        testId="activity-comments"
      />
    </div>
  );
}
