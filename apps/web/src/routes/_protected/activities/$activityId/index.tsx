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
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Lock, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getThresholdNextAction,
} from "../../../../lib/activity-load-presentation";
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

type ContentVisibility = "private" | "followers" | "public";

const VISIBILITY_OPTIONS: Array<{ value: ContentVisibility; label: string; description: string }> =
  [
    { value: "private", label: "Private", description: "Only you can access this activity." },
    { value: "followers", label: "Followers", description: "Followers can access this activity." },
    { value: "public", label: "Public", description: "Anyone with the public link can view it." },
  ];

function resolveContentVisibility(activity: {
  content_visibility?: string | null;
  is_private?: boolean;
}) {
  if (
    activity.content_visibility === "private" ||
    activity.content_visibility === "followers" ||
    activity.content_visibility === "public"
  ) {
    return activity.content_visibility;
  }
  return activity.is_private ? "private" : "followers";
}

function getVisibilityLabel(visibility: ContentVisibility) {
  return VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ?? "Private";
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
  const activityQuery = api.activities.getById.useQuery({ id: activityId });
  const activity = activityQuery.data?.activity;
  const derived = activityQuery.data?.derived;
  const loadMethod = derived?.stress.method;
  const loadLabels = getActivityLoadLabels(loadMethod);
  const unavailableValue =
    derived?.stress.unavailable_reason === "private_data"
      ? "Private"
      : derived?.stress.unavailable_reason === "threshold_missing"
        ? "No prior threshold"
        : derived?.stress.unavailable_reason === "invalid_data"
          ? "Invalid data"
          : "Missing activity data";
  const calibrationText = formatCalibrationQuality(
    derived?.stress.calibration_quality,
    activity?.started_at,
  );
  const thresholdAction =
    derived?.stress.unavailable_reason === "threshold_missing"
      ? getThresholdNextAction(activity?.type)
      : null;
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
    activity?.activity_file_path && isOwner && !isStreamProcessing && ingestionStatus !== "failed",
  );
  const profileQuery = api.profiles.getPublicById.useQuery(
    { id: activity?.profile_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activity?.profile_id) },
  );
  const streamsQuery = api.activityFiles.getStreams.useQuery(
    {
      activityId,
    },
    {
      enabled: canLoadStreamAnalysis,
      staleTime: 5 * 60 * 1000,
    },
  );
  const streamArtifactState = !activity?.activity_file_path
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
  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setLiked(activityQuery.data?.has_liked ?? false);
      setLikesCount(activity?.likes_count ?? 0);
      toast.error("Like update failed");
    },
  });
  const updateMutation = api.activities.update.useMutation({
    onSuccess: async () => {
      await utils.activities.invalidate();
      toast.success("Visibility updated");
    },
  });
  const deleteMutation = api.activities.delete.useMutation({
    onSuccess: async () => {
      await utils.activities.invalidate();
      toast.success("Activity deleted");
      void navigate({ to: "/activities" });
    },
  });

  useEffect(() => {
    setLiked(activityQuery.data?.has_liked ?? false);
    setLikesCount(activity?.likes_count ?? 0);
  }, [activity?.likes_count, activityQuery.data?.has_liked]);

  const coordinates = useMemo(
    () => getActivityCoordinates(activity?.polyline, streamsQuery.data?.records),
    [activity?.polyline, streamsQuery.data?.records],
  );
  const streamHighlights = useMemo(
    () => summarizeActivityStreams(streamsQuery.data?.records, unitSystem),
    [streamsQuery.data?.records, unitSystem],
  );
  const contentVisibility = activity ? resolveContentVisibility(activity) : "private";

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
              onClick={() => {
                const nextLiked = !liked;
                setLiked(nextLiked);
                setLikesCount((current) => (nextLiked ? current + 1 : Math.max(0, current - 1)));
                toggleLikeMutation.mutate({
                  entity_id: activity.id,
                  entity_type: "activity",
                });
              }}
              pending={toggleLikeMutation.isPending}
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
        badges={[
          getActivityBadgeLabel(activity.type),
          getVisibilityLabel(contentVisibility),
          formatDateTime(activity.started_at),
        ]}
        description={activity.notes || "No notes attached to this activity."}
        eyebrow="Activity detail"
        title={activity.name}
      />

      <DetailMetricGrid
        items={[
          {
            label: "Distance",
            value: formatDistance(activity.distance_meters, unitSystem),
          },
          {
            label: "Duration",
            value: formatDuration(activity.duration_seconds),
          },
          { label: "Avg power", value: formatPower(activity.avg_power) },
          {
            label: "Avg heart rate",
            value: formatHeartRate(activity.avg_heart_rate),
          },
          {
            label: activity.type === "run" ? "Avg pace" : "Avg speed",
            value:
              activity.type === "run"
                ? formatPace(activity.avg_speed_mps, unitSystem)
                : formatSpeed(activity.avg_speed_mps, unitSystem),
          },
          {
            label: loadLabels.load,
            value:
              derived?.stress.tss != null ? `${Math.round(derived.stress.tss)}` : unavailableValue,
          },
          {
            label: loadLabels.intensity,
            value:
              derived?.stress.intensity_factor != null
                ? derived.stress.intensity_factor.toFixed(2)
                : "-",
          },
          {
            label: "Normalized power",
            value: formatPower(activity.normalized_power),
          },
          { label: "Started", value: formatDateTime(activity.started_at) },
        ]}
      />
      {calibrationText || thresholdAction ? (
        <p className="text-sm text-muted-foreground">{calibrationText ?? thresholdAction}</p>
      ) : null}
      {loadMethod === "heart_rate_threshold" ? (
        <p className="text-xs text-muted-foreground">
          Estimated HR Load uses summary average heart rate and LTHR; it is separate from Stream HR
          Load.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <EntityMapCard
          coordinates={coordinates}
          emptyMessage={
            activity.activity_file_path
              ? "Location records were not available in the imported activity file."
              : "This activity has no stored route preview yet."
          }
          subtitle="Web-first map preview built from the saved polyline or FIT records."
          title="Route preview"
        />

        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
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

      <ActivityStreamAnalysisCard
        analysis={streamsQuery.data?.analysis}
        artifactState={streamArtifactState}
        errorMessage={
          ingestionStatus === "failed"
            ? (ingestion?.last_error_message ?? "Activity file processing failed.")
            : streamsQuery.error?.message
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>FIT stream highlights</CardTitle>
        </CardHeader>
        <CardContent>
          {streamHighlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rich stream preview is available yet. This first pass surfaces route previews and
              summary stats, while deeper FIT charting is intentionally staged.
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
