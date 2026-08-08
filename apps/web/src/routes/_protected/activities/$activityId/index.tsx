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
import { Loader2, Lock, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SessionRpeCard } from "../../../../components/activity/session-rpe-card";
import {
  ActivityStreamChartsCard,
  ActivitySwimDetailCards,
} from "../../../../components/protected/activity-file-detail-cards";
import {
  DetailMetricGrid,
  DetailPageIntro,
  EntityMapCard,
  LikeToggleButton,
} from "../../../../components/protected/activity-route-primitives";
import { ActivityStreamAnalysisCard } from "../../../../components/protected/activity-stream-analysis-card";
import { EntityCommentsCard } from "../../../../components/protected/entity-comments-card";
import { useAuth } from "../../../../components/providers/auth-provider";
import { useViewingUserPreferredUnitSystem } from "../../../../hooks/use-viewing-user-preferred-unit-system";
import { formatCalibrationQuality } from "../../../../lib/activity-load-presentation";
import {
  deriveActivityCategoryDisplay,
  deriveActivityTimingDisplay,
  deriveCurrentArtifactLabel,
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

type ContentVisibility = "private" | "followers" | "public";

const VISIBILITY_OPTIONS: Array<{ value: ContentVisibility; label: string; description: string }> =
  [
    { value: "private", label: "Private", description: "Only you can access this activity." },
    { value: "followers", label: "Followers", description: "Followers can access this activity." },
    { value: "public", label: "Public", description: "Anyone with the public link can view it." },
  ];

function resolveContentVisibility(activity: { content_visibility: string }) {
  if (
    activity.content_visibility === "private" ||
    activity.content_visibility === "followers" ||
    activity.content_visibility === "public"
  ) {
    return activity.content_visibility;
  }
  return "private";
}

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
  component: ActivityDetailPage,
});

function ActivityDetailPage() {
  const { user } = useAuth();
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { activityId } = Route.useParams();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [failedLikeIntent, setFailedLikeIntent] = useState<boolean | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const activityQuery = api.activities.getById.useQuery({ id: activityId });
  const effortsQuery = api.activities.getEfforts.useQuery({ id: activityId });
  const activity = activityQuery.data?.activity;
  const derived = activityQuery.data?.derived;
  const categoryDisplay = deriveActivityCategoryDisplay(activity?.segments ?? []);
  const timingDisplay = activity ? deriveActivityTimingDisplay(activity) : null;
  const normalizedPowerAnalysis = useMemo(() => {
    const activitySegments = (activity?.segments ?? []).filter(
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
  }, [activity?.segments]);
  const normalizedPowerPresentation = normalizedPowerAnalysis.presentation;
  const normalizedPowerAnalysisStatus = normalizedPowerAnalysis.segment?.status;
  const currentArtifactLabel = deriveCurrentArtifactLabel(activity?.current_artifact ?? null);
  const activityStreamSegments = (activity?.segments ?? [])
    .filter((segment) => segment.role === "activity")
    .sort((left, right) => left.ordinal - right.ordinal);
  const primaryStreamSegment = activityStreamSegments[0];
  const streamScopeDescription =
    activityStreamSegments.length > 1 && primaryStreamSegment?.activity_category
      ? `Showing the first ${getActivityBadgeLabel(primaryStreamSegment.activity_category).toLowerCase()} segment from this multisport activity.`
      : undefined;
  const segmentQuantifications = activityQuery.data?.segment_loads?.map(
    (segment) => segment.observationQuantification,
  );
  const loadPresentation = getActivityQuantificationPresentation(
    derived?.observationQuantification,
    {
      hasHeartRateSummary:
        typeof activity?.avg_heart_rate === "number" && activity.avg_heart_rate > 0,
    },
  );
  const calibrationCommonLoad =
    segmentQuantifications?.length === 1 ? segmentQuantifications[0]?.members[0]?.commonLoad : null;
  const calibrationText = formatCalibrationQuality(
    calibrationCommonLoad && calibrationCommonLoad.status !== "unavailable"
      ? calibrationCommonLoad.quality
      : null,
    activity?.started_at,
  );
  const isOwner = user?.id === activity?.profile_id;
  const ingestion = (
    activity as
      | { ingestion?: { last_error_message?: string | null; status?: string | null } | null }
      | undefined
  )?.ingestion;
  const ingestionStatus = ingestion?.status ?? null;
  const isStreamProcessing = Boolean(
    ingestionStatus && ingestionStatus !== "ready" && ingestionStatus !== "failed",
  );
  const canLoadStreamAnalysis = Boolean(
    activity?.current_artifact &&
      primaryStreamSegment &&
      isOwner &&
      !isStreamProcessing &&
      ingestionStatus !== "failed",
  );
  const profileQuery = api.profiles.getPublicById.useQuery(
    { id: activity?.profile_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activity?.profile_id) },
  );
  const streamsQuery = api.activityFiles.getStreams.useQuery(
    {
      activityId,
      scope: { type: "segment", segmentId: primaryStreamSegment?.id ?? activityId },
    },
    {
      enabled: canLoadStreamAnalysis,
      staleTime: 5 * 60 * 1000,
    },
  );
  const streamArtifactState = !activity?.current_artifact
    ? isStreamProcessing
      ? "processing"
      : "missing"
    : isStreamProcessing
      ? "processing"
      : !isOwner
        ? "private"
        : ingestionStatus === "failed" || streamsQuery.isError
          ? "error"
          : streamsQuery.isLoading
            ? "loading"
            : "ready";
  const streamErrorMessage =
    ingestionStatus === "failed"
      ? (ingestion?.last_error_message ?? "Activity file processing failed.")
      : streamsQuery.error?.message;
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

  useEffect(() => {
    setLiked(activityQuery.data?.has_liked ?? false);
    setLikesCount(activity?.likes_count ?? 0);
  }, [activity?.likes_count, activityQuery.data?.has_liked]);

  useEffect(() => {
    setFailedLikeIntent(null);
    setDeleteFailed(false);
  }, [activity?.id]);

  const coordinates = useMemo(
    () => getActivityCoordinates(activity?.polyline, streamsQuery.data?.records),
    [activity?.polyline, streamsQuery.data?.records],
  );
  const streamHighlights = useMemo(
    () => summarizeActivityStreams(streamsQuery.data?.records, unitSystem),
    [streamsQuery.data?.records, unitSystem],
  );
  const contentVisibility = activity ? resolveContentVisibility(activity) : "private";

  const handleLikeToggle = async () => {
    if (!activity) return;
    const intendedLiked = failedLikeIntent ?? !liked;
    let previousLiked = liked;
    let previousCount = likesCount;

    if (failedLikeIntent !== null) {
      const refreshed = await activityQuery.refetch();
      const authoritativeLiked = refreshed.data?.has_liked;
      const authoritativeCount = refreshed.data?.activity.likes_count;
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
    await navigator.clipboard.writeText(url);
    toast.success("Public activity link copied");
  };

  if (activityQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activity) {
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
              <Dialog>
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
        badges={[getVisibilityLabel(contentVisibility), formatDateTime(activity.started_at)]}
        categories={categoryDisplay.categories}
        description={activity.notes || "No notes attached to this activity."}
        eyebrow="Activity detail"
        title={activity.name}
      />

      {deleteFailed ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Activity could not be deleted. Nothing was removed.
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
            value: formatDistance(activity.distance_meters, unitSystem),
          },
          {
            label: "Elapsed",
            value: formatDuration(timingDisplay?.elapsedSeconds),
          },
          {
            label: timingDisplay?.coverage === "partial" ? "Active (partial)" : "Active",
            value: formatDuration(timingDisplay?.activeSeconds),
          },
          {
            label: timingDisplay?.coverage === "partial" ? "Moving (partial)" : "Moving",
            value: formatDuration(timingDisplay?.movingSeconds),
          },
          { label: "Avg power", value: formatPower(activity.avg_power) },
          {
            label: "Avg heart rate",
            value: formatHeartRate(activity.avg_heart_rate),
          },
          {
            label: categoryDisplay.singleCategory === "run" ? "Avg pace" : "Avg speed",
            value:
              categoryDisplay.singleCategory === "run"
                ? formatPace(activity.avg_speed_mps, unitSystem)
                : formatSpeed(activity.avg_speed_mps, unitSystem),
          },
          {
            label: normalizedPowerPresentation?.label ?? "Normalized power",
            value:
              normalizedPowerAnalysisStatus === "processing"
                ? "Processing"
                : normalizedPowerAnalysisStatus === "failed"
                  ? "Analysis failed"
                  : normalizedPowerPresentation?.status === "unavailable"
                    ? "Unavailable"
                    : formatPower(normalizedPowerPresentation?.valueWatts),
          },
          { label: "Started", value: formatDateTime(activity.started_at) },
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
            activity.current_artifact
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
            {activity.activity_plans ? (
              <div>
                <p className="text-sm font-medium text-foreground">Linked activity plan</p>
                <p className="text-sm text-muted-foreground">{activity.activity_plans.name}</p>
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

      <ActivityStreamChartsCard
        {...(streamsQuery.data?.records === undefined
          ? {}
          : { records: streamsQuery.data.records })}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
      />

      <ActivityStreamAnalysisCard
        {...(streamsQuery.data?.analysis === undefined
          ? {}
          : { analysis: streamsQuery.data.analysis })}
        artifactState={streamArtifactState}
        {...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {})}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
      />

      <ActivitySwimDetailCards
        {...(primaryStreamSegment?.activity_category === undefined
          ? {}
          : { activityCategory: primaryStreamSegment.activity_category })}
        {...(streamsQuery.data?.laps === undefined ? {} : { laps: streamsQuery.data.laps })}
        {...(streamsQuery.data?.lengths === undefined
          ? {}
          : { lengths: streamsQuery.data.lengths })}
        {...(streamScopeDescription ? { scopeDescription: streamScopeDescription } : {})}
        {...(streamsQuery.data?.summary === undefined
          ? {}
          : { summary: streamsQuery.data.summary })}
      />

      {isOwner ? (
        <SessionRpeCard
          activityId={activity.id}
          effectiveSessionRpe={activity.effective_session_rpe}
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

      <EntityCommentsCard
        entityId={activity.id}
        entityType="activity"
        helperText="Discuss the activity, ask follow-up questions, or leave coaching notes."
        testId="activity-comments"
      />
    </div>
  );
}
