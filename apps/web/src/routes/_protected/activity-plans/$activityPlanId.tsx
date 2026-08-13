import { activityPlanStructureSchema } from "@repo/core/activity-plan";
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
import { DateInput } from "@repo/ui/components/date-input";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Copy, Loader2, Pencil, Printer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ActivityPlanComments } from "../../../components/activity-plan/activity-plan-comments";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { ActivityPlanStructure } from "../../../components/activity-plan/activity-plan-structure";
import {
  DetailPageIntro,
  LikeToggleButton,
  OwnerSummary,
} from "../../../components/protected/activity-route-primitives";
import { formatDate } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";
import { getTodayDateKey, shiftDateKey } from "../../../lib/planning";

export const Route = createFileRoute("/_protected/activity-plans/$activityPlanId")({
  component: ActivityPlanDetailPage,
});

function ActivityPlanDetailPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { activityPlanId } = Route.useParams();
  const planQuery = api.activityPlans.getById.useQuery({ id: activityPlanId }, { retry: false });
  const performanceTargetsQuery = api.athleteIntelligence.getReadModel.useQuery({
    sections: { publishedState: true },
  });
  const today = getTodayDateKey();
  const scheduleQuery = api.calendar.range.useQuery({
    startDate: today,
    endDateExclusive: shiftDateKey(today, 366),
    activityPlanId,
    includeAdhoc: true,
    limit: 100,
  });
  const [editing, setEditing] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const detail = planQuery.data?.detail;
  const edit = planQuery.data?.edit;
  const scheduledEvents = (scheduleQuery.data?.items ?? []).filter(
    (item) =>
      item.kind === "planned_activity" &&
      item.status === "scheduled" &&
      item.plan?.id === activityPlanId,
  );
  const scheduledEvent = scheduledEvents[0];
  const isOwner = detail?.capabilities.canEdit ?? false;
  const hasCanonicalStructure = activityPlanStructureSchema.safeParse(detail?.structure).success;

  useEffect(() => {
    setLiked(detail?.engagement.viewerHasLiked ?? false);
    setLikesCount(detail?.engagement.likes ?? 0);
  }, [detail?.engagement.likes, detail?.engagement.viewerHasLiked]);

  useEffect(() => {
    if (scheduledEvent?.calendarDate) {
      setScheduleDate(scheduledEvent.calendarDate);
    }
  }, [scheduledEvent?.calendarDate]);

  const toggleLike = api.social.toggleLike.useMutation({
    onError: () => {
      setLiked(detail?.engagement.viewerHasLiked ?? false);
      setLikesCount(detail?.engagement.likes ?? 0);
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
      await utils.calendar.invalidate();
      toast.success("Activity plan scheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be scheduled"),
  });
  const updateSchedule = api.events.update.useMutation({
    onSuccess: async (event) => {
      await Promise.all([
        utils.calendar.invalidate(),
        utils.events.getById.invalidate({ id: event.id }),
      ]);
      toast.success("Activity plan rescheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be rescheduled"),
  });
  const removeSchedule = api.events.delete.useMutation({
    onSuccess: async () => {
      await utils.calendar.invalidate();
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

  if (planQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 aria-label="Loading activity plan" className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (planQuery.isError || !planQuery.data || !detail || !hasCanonicalStructure) {
    return (
      <Card className="mx-auto max-w-2xl border-destructive/30">
        <CardHeader>
          <CardTitle>Activity plan unavailable</CardTitle>
          <CardDescription>
            This plan may have been removed, is invalid, or you may no longer have access to it.
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

  if (editing && edit) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 py-4">
        <ActivityPlanComposer
          initial={{
            name: edit.name,
            description: edit.description,
            notes: edit.notes,
            structure: edit.structure,
            gps_recording_enabled: edit.gpsRecordingEnabled,
            content_visibility: edit.contentVisibility,
          }}
          mode="edit"
          onCancel={() => setEditing(false)}
          onSave={(values) =>
            updatePlan
              .mutateAsync({
                ...values,
                expectedStructureHash: edit.structureHash,
                id: edit.id,
              })
              .then(() => undefined)
          }
          pending={updatePlan.isPending}
        />
      </div>
    );
  }

  if (!detail) return null;
  const metrics = detail.metrics.map((metric) =>
    metric.status === "unavailable"
      ? `${metric.label} unavailable`
      : `${metric.label} ${metric.unit === "ratio" ? metric.value.toFixed(2) : Math.round(metric.value)}`,
  );

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-4 print:max-w-none print:py-0">
      <Button asChild className="print:hidden" size="sm" variant="ghost">
        <a href="/activity-plans">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to activity plans
        </a>
      </Button>

      <DetailPageIntro
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={() => window.print()} type="button" variant="outline">
              <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
            </Button>
            <LikeToggleButton
              count={likesCount}
              liked={liked}
              onClick={() => {
                const next = !liked;
                setLiked(next);
                setLikesCount((count) => (next ? count + 1 : Math.max(0, count - 1)));
                toggleLike.mutate({ entity_id: detail.id, entity_type: "activity_plan" });
              }}
              pending={toggleLike.isPending}
            />
            <Button
              disabled={duplicatePlan.isPending}
              onClick={() =>
                duplicatePlan.mutate({ id: detail.id, newName: `${detail.name} (Copy)` })
              }
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
                        ? "This plan has linked scheduled sessions. Remove every linked session before deleting the plan."
                        : "This permanently removes the plan from your library. Deletion will be blocked if any linked schedule exists."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deletePlan.isPending}
                      onClick={() => deletePlan.mutate({ id: activityPlanId })}
                    >
                      Delete plan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
        badges={[detail.activityCategory]}
        description={detail.description || "Reusable structured activity plan."}
        eyebrow="Activity plan"
        title={detail.name}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] print:block">
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Plan summary</CardTitle>
            <CardDescription>
              Training intent with common Load and Intensity availability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium capitalize">
                {detail.activityCategory}
              </span>
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {detail.visibility}
              </span>
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
                Duration, common Load, and Intensity are unavailable for this plan.
              </p>
            )}
            {detail.notes ? (
              <div>
                <h2 className="font-semibold">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.notes}
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
                <dd className="font-medium">{formatDate(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Recording</dt>
                <dd className="font-medium">
                  {detail.gpsRecordingEnabled ? "GPS-capable on supported devices" : "Timer only"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6 print:hidden">
          <OwnerSummary owner={detail.owner} />
        </div>
      </div>

      <ActivityPlanStructure
        performanceTargets={performanceTargetsQuery.data?.publishedState?.performanceTargets}
        structure={detail.structure}
      />

      <Card className="print:hidden" data-testid="activity-plan-schedule">
        <CardHeader>
          <CardTitle>{scheduledEvent ? "Reschedule activity" : "Schedule activity"}</CardTitle>
          <CardDescription>
            {scheduledEvent
              ? `Currently scheduled for ${scheduledEvent.calendarDate}.`
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
              if (scheduledEvent) {
                updateSchedule.mutate({
                  id: scheduledEvent.id,
                  patch: { scheduled_date: scheduleDate },
                });
              } else {
                createSchedule.mutate({
                  activity_plan_id: detail.id,
                  event_type: "planned",
                  scheduled_date: scheduleDate,
                  title: detail.name,
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

      <div className="print:hidden">
        <ActivityPlanComments planId={detail.id} />
      </div>
    </div>
  );
}
