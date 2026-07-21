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
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { DateInput } from "@repo/ui/components/date-input";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ActivityPlanCategoryBadges } from "../../../components/activity-plan/activity-plan-category-badges";
import { ActivityPlanComments } from "../../../components/activity-plan/activity-plan-comments";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { ActivityPlanStructure } from "../../../components/activity-plan/activity-plan-structure";
import {
  DetailPageIntro,
  LikeToggleButton,
  OwnerSummary,
} from "../../../components/protected/activity-route-primitives";
import { useAuth } from "../../../components/providers/auth-provider";
import { getActivityPlanMetricSummary } from "../../../lib/activity-plan-presentation";
import { formatDate, getActivityBadgeLabel } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/activity-plans/$activityPlanId")({
  component: ActivityPlanDetailPage,
});

function ActivityPlanDetailPage() {
  const { user } = useAuth();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { activityPlanId } = Route.useParams();
  const planQuery = api.activityPlans.getById.useQuery({ id: activityPlanId }, { retry: false });
  const routesQuery = api.routes.list.useQuery({ limit: 100, ownerScope: "all" });
  const scheduleQuery = api.events.list.useQuery({
    activity_plan_id: activityPlanId,
    include_adhoc: false,
    limit: 100,
  });
  const [editing, setEditing] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const plan = planQuery.data;
  const scheduledEvents = (scheduleQuery.data?.items ?? []).filter(
    (event) => event.status === "scheduled",
  );
  const scheduledEvent = scheduledEvents[0];
  const isOwner = user?.id === plan?.profile_id;

  useEffect(() => {
    setLiked(plan?.has_liked ?? false);
    setLikesCount(plan?.likes_count ?? 0);
  }, [plan?.has_liked, plan?.likes_count]);

  useEffect(() => {
    if (scheduledEvent?.scheduled_date) {
      setScheduleDate(scheduledEvent.scheduled_date.slice(0, 10));
    }
  }, [scheduledEvent?.scheduled_date]);

  const toggleLike = api.social.toggleLike.useMutation({
    onError: () => {
      setLiked(plan?.has_liked ?? false);
      setLikesCount(plan?.likes_count ?? 0);
      toast.error("Like update failed");
    },
  });
  const duplicatePlan = api.activityPlans.duplicate.useMutation({
    onSuccess: async (duplicated) => {
      await utils.activityPlans.invalidate();
      toast.success("Activity plan duplicated into your library");
      void navigate({
        to: "/activity-plans/$activityPlanId",
        params: { activityPlanId: duplicated.id },
      } as never);
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be duplicated"),
  });
  const updatePlan = api.activityPlans.update.useMutation({
    onSuccess: async () => {
      await utils.activityPlans.invalidate();
      setEditing(false);
      toast.success("Activity plan updated");
    },
    onError: async (error) => {
      if (error.data?.code === "CONFLICT") await planQuery.refetch();
      toast.error(
        error.data?.code === "CONFLICT"
          ? "This plan changed elsewhere. It has been refreshed; review and save again."
          : error.message,
      );
    },
  });
  const createSchedule = api.events.create.useMutation({
    onSuccess: async () => {
      await utils.events.invalidate();
      toast.success("Activity plan scheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be scheduled"),
  });
  const updateSchedule = api.events.update.useMutation({
    onSuccess: async () => {
      await utils.events.invalidate();
      toast.success("Activity plan rescheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be rescheduled"),
  });
  const removeSchedule = api.events.delete.useMutation({
    onSuccess: async () => {
      await utils.events.invalidate();
      toast.success("Activity plan removed from the schedule");
    },
    onError: (error) => toast.error(error.message || "Scheduled activity could not be removed"),
  });
  const deletePlan = api.activityPlans.delete.useMutation({
    onSuccess: async () => {
      await utils.activityPlans.invalidate();
      toast.success("Activity plan deleted");
      void navigate({ to: "/activity-plans" } as never);
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be deleted"),
  });

  const deleteWithDependencyRecovery = async () => {
    try {
      for (const event of scheduledEvents) {
        await removeSchedule.mutateAsync({ id: event.id });
      }
      await deletePlan.mutateAsync({ id: activityPlanId });
    } catch {
      // Each mutation reports a user-visible error while preserving the plan for recovery.
    }
  };

  if (planQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 aria-label="Loading activity plan" className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <Card className="mx-auto max-w-2xl border-destructive/30">
        <CardHeader>
          <CardTitle>Activity plan unavailable</CardTitle>
          <CardDescription>
            This plan may have been removed, or you may no longer have access to it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/activity-plans">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to activity plans
            </a>
          </Button>
          <Button onClick={() => void planQuery.refetch()} type="button" variant="ghost">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (editing && plan) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 py-4">
        <ActivityPlanComposer
          initial={plan}
          mode="edit"
          onCancel={() => setEditing(false)}
          onSave={(values) =>
            updatePlan
              .mutateAsync({
                ...values,
                expectedStructureHash: plan.structure_hash,
                id: plan.id,
              })
              .then(() => undefined)
          }
          pending={updatePlan.isPending}
          routeOptions={routesQuery.data?.items ?? []}
        />
      </div>
    );
  }

  if (!plan) return null;
  const metrics = getActivityPlanMetricSummary(plan.authoritative_metrics);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-4">
      <Button asChild size="sm" variant="ghost">
        <a href="/activity-plans">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to activity plans
        </a>
      </Button>

      <DetailPageIntro
        actions={
          <>
            <LikeToggleButton
              count={likesCount}
              liked={liked}
              onClick={() => {
                const next = !liked;
                setLiked(next);
                setLikesCount((count) => (next ? count + 1 : Math.max(0, count - 1)));
                toggleLike.mutate({ entity_id: plan.id, entity_type: "activity_plan" });
              }}
              pending={toggleLike.isPending}
            />
            <Button
              disabled={duplicatePlan.isPending}
              onClick={() => duplicatePlan.mutate({ id: plan.id, newName: `${plan.name} (Copy)` })}
              type="button"
              variant="outline"
            >
              <Copy className="mr-2 h-4 w-4" />
              {duplicatePlan.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
            {isOwner ? (
              <Button onClick={() => setEditing(true)} type="button" variant="outline">
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            ) : null}
            {isOwner ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={scheduleQuery.isLoading || scheduleQuery.isError}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete activity plan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {scheduledEvents.length > 0
                        ? `This plan has ${scheduledEvents.length} scheduled ${scheduledEvents.length === 1 ? "session" : "sessions"}. They will be removed first so deletion can recover safely.`
                        : "This permanently removes the plan from your library."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={removeSchedule.isPending || deletePlan.isPending}
                      onClick={() => void deleteWithDependencyRecovery()}
                    >
                      {scheduledEvents.length > 0 ? "Remove schedules and delete" : "Delete plan"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
        badges={plan.categories.map(getActivityBadgeLabel)}
        description={plan.description || "Reusable structured activity plan."}
        eyebrow="Activity plan"
        title={plan.name}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Plan summary</CardTitle>
            <CardDescription>Training intent and estimated workload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <ActivityPlanCategoryBadges categories={plan.categories} />
              <Badge variant="outline">{plan.content_visibility}</Badge>
            </div>
            {metrics.length ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                {metrics.map((metric) => (
                  <div className="rounded-xl bg-muted/40 px-4 py-3" key={metric}>
                    <dt className="text-xs uppercase text-muted-foreground">Estimate</dt>
                    <dd className="font-medium">{metric}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Estimated duration and training load are not available for this plan.
              </p>
            )}
            {plan.notes ? (
              <div>
                <h2 className="font-semibold">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {plan.notes}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDate(plan.created_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Recording</dt>
                <dd className="font-medium">
                  {plan.gps_recording_enabled ? "GPS-capable on supported devices" : "Timer only"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Composition</dt>
                <dd className="font-medium">
                  {plan.categories.map(getActivityBadgeLabel).join(", ")}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <OwnerSummary owner={plan.owner} />
          <Card data-testid="activity-plan-route">
            <CardHeader>
              <CardTitle>Route</CardTitle>
              <CardDescription>
                Route context used for distance and terrain estimates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plan.route ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{plan.route.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Distance</dt>
                    <dd className="font-medium">
                      {plan.route.distance == null
                        ? "Not estimated"
                        : `${(plan.route.distance / 1_000).toFixed(1)} km`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ascent</dt>
                    <dd className="font-medium">
                      {plan.route.ascent == null
                        ? "Not estimated"
                        : `${Math.round(plan.route.ascent)} m`}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No route is linked to this plan.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ActivityPlanStructure structure={plan.structure} />

      <Card data-testid="activity-plan-schedule">
        <CardHeader>
          <CardTitle>{scheduledEvent ? "Reschedule activity" : "Schedule activity"}</CardTitle>
          <CardDescription>
            {scheduledEvent
              ? `Currently scheduled for ${scheduledEvent.scheduled_date}.`
              : "Add this reusable plan to your calendar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <DateInput
              id="activity-plan-schedule-date"
              label="Schedule date"
              onChange={(value) => setScheduleDate(value ?? "")}
              value={scheduleDate}
            />
          </div>
          <Button
            disabled={!scheduleDate || createSchedule.isPending || updateSchedule.isPending}
            onClick={() => {
              const scheduledDate = `${scheduleDate}T09:00:00.000Z`;
              if (scheduledEvent) {
                updateSchedule.mutate({ id: scheduledEvent.id, scheduled_date: scheduledDate });
              } else {
                createSchedule.mutate({
                  activity_plan_id: plan.id,
                  event_type: "planned",
                  scheduled_date: scheduledDate,
                });
              }
            }}
            type="button"
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {scheduledEvent ? "Reschedule" : "Schedule"}
          </Button>
          {scheduledEvent ? (
            <Button
              disabled={removeSchedule.isPending}
              onClick={() => removeSchedule.mutate({ id: scheduledEvent.id })}
              type="button"
              variant="outline"
            >
              Remove from schedule
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ActivityPlanComments planId={plan.id} />
    </div>
  );
}
