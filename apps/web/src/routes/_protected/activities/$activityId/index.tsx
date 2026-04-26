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
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DetailMetricGrid,
  DetailPageIntro,
  EntityMapCard,
  LikeToggleButton,
} from "../../../../components/protected/activity-route-primitives";
import { EntityCommentsCard } from "../../../../components/protected/entity-comments-card";
import { useAuth } from "../../../../components/providers/auth-provider";
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

export const Route = createFileRoute("/_protected/activities/$activityId/")({
  component: ActivityDetailPage,
});

function ActivityDetailPage() {
  const { user } = useAuth();
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { activityId } = Route.useParams();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const activityQuery = api.activities.getById.useQuery({ id: activityId });
  const activity = activityQuery.data?.activity;
  const derived = activityQuery.data?.derived;
  const isOwner = user?.id === activity?.profile_id;
  const profileQuery = api.profiles.getPublicById.useQuery(
    { id: activity?.profile_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activity?.profile_id) },
  );
  const streamsQuery = api.fitFiles.getStreams.useQuery(
    {
      activityId,
      fitFilePath: activity?.fit_file_path ?? "placeholder.fit",
    },
    {
      enabled: Boolean(activity?.fit_file_path),
      staleTime: 5 * 60 * 1000,
    },
  );
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
    () =>
      getActivityCoordinates(
        activity?.polyline,
        (streamsQuery.data?.records as any[] | undefined) ?? undefined,
      ),
    [activity?.polyline, streamsQuery.data?.records],
  );
  const streamHighlights = useMemo(
    () => summarizeActivityStreams((streamsQuery.data?.records as any[] | undefined) ?? undefined),
    [streamsQuery.data?.records],
  );

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
                toggleLikeMutation.mutate({ entity_id: activity.id, entity_type: "activity" });
              }}
              pending={toggleLikeMutation.isPending}
            />
            {isOwner ? (
              <Button
                onClick={() =>
                  updateMutation.mutate({ id: activity.id, is_private: !activity.is_private })
                }
                type="button"
                variant="outline"
              >
                <Lock className="mr-2 h-4 w-4" />
                {activity.is_private ? "Make public" : "Make private"}
              </Button>
            ) : null}
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
          activity.is_private ? "Private" : "Public",
          formatDateTime(activity.started_at),
        ]}
        description={activity.notes || "No notes attached to this activity."}
        eyebrow="Activity detail"
        title={activity.name}
      />

      <DetailMetricGrid
        items={[
          { label: "Distance", value: formatDistance(activity.distance_meters) },
          { label: "Duration", value: formatDuration(activity.duration_seconds) },
          { label: "Avg power", value: formatPower(activity.avg_power) },
          { label: "Avg heart rate", value: formatHeartRate(activity.avg_heart_rate) },
          {
            label: activity.type === "run" ? "Avg pace" : "Avg speed",
            value:
              activity.type === "run"
                ? formatPace(activity.avg_speed_mps)
                : formatSpeed(activity.avg_speed_mps),
          },
          {
            label: "TSS",
            value: derived?.stress.tss != null ? `${Math.round(derived.stress.tss)}` : "-",
          },
          { label: "Normalized power", value: formatPower(activity.normalized_power) },
          { label: "Started", value: formatDateTime(activity.started_at) },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <EntityMapCard
          coordinates={coordinates}
          emptyMessage={
            activity.fit_file_path
              ? "Location records were not available in the imported FIT file."
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
                {activity.is_private
                  ? "Only approved viewers can access this activity."
                  : "Visible to anyone who can access your public activity feed."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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
        helperText="Discuss the workout, ask follow-up questions, or leave coaching notes."
        testId="activity-comments"
      />
    </div>
  );
}
