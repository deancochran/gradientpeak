import {
  activityPlanStructureSchema,
  buildActivityPlanPrintModel,
  resolveActivityPlanSessionFlow,
} from "@repo/core/activity-plan";
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
import { ArrowLeft, CalendarDays, Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ActivityPlanComments } from "../../../components/activity-plan/activity-plan-comments";
import { ActivityPlanComposer } from "../../../components/activity-plan/activity-plan-composer";
import { ActivityPlanEstimateRow } from "../../../components/activity-plan/activity-plan-estimates";
import { ActivityPlanPdfActions } from "../../../components/activity-plan/activity-plan-pdf-actions";
import { ActivityPlanSessionFlow } from "../../../components/activity-plan/activity-plan-session-flow";
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
  validateSearch: (search: Record<string, unknown>): { edit?: true; variantId?: string } => ({
    ...(search.edit === true || search.edit === "true" ? { edit: true as const } : {}),
    ...(typeof search.variantId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.variantId)
      ? { variantId: search.variantId }
      : {}),
  }),
  component: ActivityPlanDetailPage,
});

function ActivityPlanDetailPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { activityPlanId } = Route.useParams();
  const { edit: editMode, variantId } = Route.useSearch();
  const editing = editMode === true;
  const [personalizationSelection, setPersonalizationSelection] = useState<{
    key: string;
    enabled: boolean;
  } | null>(null);
  const planQuery = api.activityPlans.getById.useQuery(
    {
      id: activityPlanId,
      personalize: false,
      ...(variantId === undefined ? {} : { variantId }),
    },
    { retry: false },
  );
  const performanceTargetsQuery = api.athleteIntelligence.getReadModel.useQuery(
    { sections: { publishedState: true } },
    {
      enabled: Boolean(planQuery.data?.detail),
    },
  );
  const today = getTodayDateKey();
  const legacyScheduleQuery = api.calendar.range.useQuery({
    startDate: shiftDateKey(today, -183),
    endDateExclusive: shiftDateKey(today, 183),
    activityPlanId,
    includeAdhoc: true,
    limit: 100,
  });
  const profileQuery = api.profiles.get.useQuery();
  const plannedSessionsQuery = api.plannedSessions.range.useQuery(
    {
      profileId: profileQuery.data?.id ?? "",
      range: {
        startDate: shiftDateKey(today, -183),
        endDate: shiftDateKey(today, 183),
      },
    },
    { enabled: Boolean(profileQuery.data?.id) },
  );
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  type PlannedSession = NonNullable<typeof plannedSessionsQuery.data>["items"][number];
  const [scheduledSessionOverride, setScheduledSessionOverride] = useState<{
    key: string;
    session: PlannedSession;
  } | null>(null);
  const [scheduleOperation, setScheduleOperation] = useState<{ key: string; id: string } | null>(
    null,
  );
  const detail = planQuery.data?.detail;
  const edit = planQuery.data?.edit;
  const selectionKey = `${activityPlanId}:${detail?.resolvedVariant.id ?? "unresolved"}`;
  const personalizationChoice =
    personalizationSelection?.key === selectionKey ? personalizationSelection.enabled : null;
  const legacyScheduledEvents = (legacyScheduleQuery.data?.items ?? []).filter(
    (item) =>
      item.kind === "planned_activity" &&
      item.status === "scheduled" &&
      item.plan?.id === activityPlanId,
  );
  const scheduledSessions = (plannedSessionsQuery.data?.items ?? []).filter(
    (session) =>
      session.lifecycle.status === "scheduled" &&
      session.prescription.activityPlanId === activityPlanId &&
      session.prescription.variantId === detail?.resolvedVariant.id,
  );
  const scheduledSession =
    scheduledSessionOverride?.key === selectionKey
      ? scheduledSessionOverride.session
      : scheduledSessions[0];
  const scheduledDependencyIds = [...new Set([...legacyScheduledEvents.map((event) => event.id)])];
  const isOwner = detail?.capabilities.canEdit ?? false;
  const parsedStructure = activityPlanStructureSchema.safeParse(detail?.structure);
  const displayStructure = parsedStructure.success ? parsedStructure.data : null;
  const performanceTargets = performanceTargetsQuery.data?.publishedState?.performanceTargets;
  const personalizationEligibility = resolveActivityPlanSessionFlow({
    structure: displayStructure,
    ...(performanceTargets ? { performanceTargets } : {}),
    personalize: false,
  }).eligibility;
  const personalizeTargets = Boolean(
    personalizationEligibility.eligible && (personalizationChoice ?? true),
  );
  const printModel = detail
    ? buildActivityPlanPrintModel({
        description: detail.description,
        format: "full-page",
        notes: detail.notes,
        ...(performanceTargets ? { performanceTargets } : {}),
        personalizeTargets,
        structure: displayStructure,
        title: detail.name,
      })
    : null;

  useEffect(() => {
    setLiked(detail?.engagement.viewerHasLiked ?? false);
    setLikesCount(detail?.engagement.likes ?? 0);
  }, [detail?.engagement.likes, detail?.engagement.viewerHasLiked]);

  useEffect(() => {
    if (scheduledSession?.planningDate) {
      setScheduleDate(scheduledSession.planningDate);
    }
  }, [scheduledSession?.planningDate]);

  const getScheduleOperationId = () => {
    const key = `${selectionKey}:${scheduleDate}`;
    if (scheduleOperation?.key === key) return scheduleOperation.id;
    const id = crypto.randomUUID().replaceAll("-", "");
    setScheduleOperation({ key, id });
    return id;
  };

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
      void navigate({ search: { edit: undefined, variantId }, replace: true });
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
  const createSchedule = api.plannedSessions.create.useMutation({
    onSuccess: async (receipt) => {
      setScheduledSessionOverride({ key: selectionKey, session: receipt.session });
      await plannedSessionsQuery.refetch();
      toast.success("Activity plan scheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be scheduled"),
  });
  const updateSchedule = api.plannedSessions.move.useMutation({
    onSuccess: async (receipt) => {
      setScheduledSessionOverride({ key: selectionKey, session: receipt.session });
      await plannedSessionsQuery.refetch();
      toast.success("Activity plan rescheduled");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be rescheduled"),
  });
  const cancelSchedule = api.plannedSessions.cancel.useMutation({
    onSuccess: () => {
      setScheduledSessionOverride(null);
      void plannedSessionsQuery.refetch();
      toast.success("Activity plan removed from the schedule");
    },
    onError: (error) => toast.error(error.message || "Scheduled activity could not be removed"),
  });
  const removeLegacySchedule = api.events.delete.useMutation({
    onError: (error) => toast.error(error.message || "Scheduled activity could not be removed"),
  });
  const deletePlan = api.activityPlans.delete.useMutation({
    onSuccess: () => {
      void navigate({ to: "/activity-plans" } as never);
      void utils.activityPlans.invalidate();
      toast.success("Activity plan deleted");
    },
    onError: (error) => toast.error(error.message || "Activity plan could not be deleted"),
  });

  const removeSchedulesAndDelete = async () => {
    for (const eventId of scheduledDependencyIds) {
      await removeLegacySchedule.mutateAsync({ id: eventId });
    }
    await deletePlan.mutateAsync({ id: activityPlanId });
  };

  if (planQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 aria-label="Loading activity plan" className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (planQuery.isError || !planQuery.data || !detail) {
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
          initialVariantId={detail.resolvedVariant.id}
          mode="edit"
          onCancel={() => void navigate({ search: { edit: undefined, variantId }, replace: true })}
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
            {printModel ? <ActivityPlanPdfActions key={detail.id} model={printModel} /> : null}
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
            {detail.capabilities.canDuplicate ? (
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
            ) : null}
            {isOwner ? (
              <Button
                onClick={() => void navigate({ search: { edit: true, variantId } })}
                type="button"
                variant="outline"
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            ) : null}
            {detail.capabilities.canRecord ? (
              <Button
                onClick={() =>
                  void navigate({
                    to: "/record",
                    search: {
                      activity_category: detail.activityCategory,
                      activityPlanId: detail.id,
                      gps: "off",
                      variantId: detail.resolvedVariant.id,
                    },
                  } as never)
                }
                type="button"
                variant="outline"
              >
                Record variant
              </Button>
            ) : null}
            {isOwner ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      legacyScheduledEvents.length === 0 &&
                      legacyScheduleQuery.isLoading &&
                      !legacyScheduleQuery.data
                    }
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
                      {scheduledDependencyIds.length > 0
                        ? `This plan has ${scheduledDependencyIds.length} scheduled session${scheduledDependencyIds.length === 1 ? "" : "s"}. Remove linked schedules before deleting the plan.`
                        : "This permanently removes the plan from your library. Deletion will be blocked if any linked schedule exists."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deletePlan.isPending || removeLegacySchedule.isPending}
                      onClick={() =>
                        scheduledDependencyIds.length > 0
                          ? void removeSchedulesAndDelete()
                          : deletePlan.mutate({ id: activityPlanId })
                      }
                    >
                      {scheduledDependencyIds.length > 0
                        ? "Remove schedules and delete"
                        : "Delete plan"}
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

      {detail.variants.length > 1 ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Plan variant</CardTitle>
            <CardDescription>
              Calculations, prescription details, scheduling, and recording use the selected
              variant.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-sm space-y-2">
            <label className="text-sm font-medium" htmlFor="activity-plan-detail-variant">
              Activity plan variant
            </label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="activity-plan-detail-variant"
              onChange={(event) =>
                void navigate({
                  search: { edit: undefined, variantId: event.currentTarget.value },
                })
              }
              value={detail.resolvedVariant.id}
            >
              {detail.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                  {variant.id === detail.defaultVariantId ? " (default)" : ""}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] print:block">
        <Card>
          <CardHeader>
            <CardTitle>Plan summary</CardTitle>
            <CardDescription>Independently known and estimated plan quantities.</CardDescription>
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
            <ActivityPlanEstimateRow metrics={detail.metrics} />
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
                  {detail.gpsRecordingEnabled === undefined
                    ? detail.capabilities.canDuplicate
                      ? "Available after duplicating this system template"
                      : "Available only to the plan owner"
                    : detail.gpsRecordingEnabled
                      ? "GPS-capable on supported devices"
                      : "Timer only"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6 print:hidden">
          <OwnerSummary owner={detail.owner} />
        </div>
      </div>

      {displayStructure ? (
        <>
          <ActivityPlanSessionFlow
            structure={displayStructure}
            {...(performanceTargets ? { performanceTargets } : {})}
            personalizeTargets={personalizeTargets}
            onPersonalizeTargetsChange={(enabled) =>
              setPersonalizationSelection({ key: selectionKey, enabled })
            }
            showPersonalizationControl
            showStepNames={false}
            personalizationFactsLoading={performanceTargetsQuery.isLoading}
          />
          <div className="print:hidden">
            <ActivityPlanStructure structure={displayStructure} />
          </div>
        </>
      ) : (
        <Card data-testid="activity-plan-unavailable-structure">
          <CardHeader>
            <CardTitle>Activity prescription unavailable</CardTitle>
            <CardDescription>
              This plan does not contain a valid structure that can be displayed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {detail.capabilities.canSchedule ? (
        <Card className="print:hidden" data-testid="activity-plan-schedule">
          <CardHeader>
            <CardTitle>{scheduledSession ? "Reschedule activity" : "Schedule activity"}</CardTitle>
            <CardDescription>
              {scheduledSession
                ? `${detail.resolvedVariant.name} is currently scheduled for ${scheduledSession.planningDate}.`
                : `Add the ${detail.resolvedVariant.name} variant to your calendar.`}
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
              disabled={
                !scheduleDate ||
                !profileQuery.data?.id ||
                plannedSessionsQuery.isLoading ||
                createSchedule.isPending ||
                updateSchedule.isPending
              }
              onClick={() => {
                if (!profileQuery.data?.id) return;
                if (scheduledSession) {
                  updateSchedule.mutate({
                    profileId: profileQuery.data.id,
                    sessionId: scheduledSession.id,
                    expectedRevision: scheduledSession.sessionRevision,
                    planningDate: scheduleDate,
                  });
                } else {
                  createSchedule.mutate({
                    profileId: profileQuery.data.id,
                    session: {
                      activityPlanId: detail.id,
                      planningDate: scheduleDate,
                      source: { kind: "direct", operationId: getScheduleOperationId() },
                      variantId: detail.resolvedVariant.id,
                    },
                  });
                }
              }}
              type="button"
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {scheduledSession ? "Reschedule" : "Schedule"}
            </Button>
            {scheduledSession ? (
              <Button
                disabled={cancelSchedule.isPending}
                onClick={() => {
                  if (!profileQuery.data?.id) return;
                  cancelSchedule.mutate({
                    profileId: profileQuery.data.id,
                    sessionId: scheduledSession.id,
                    expectedRevision: scheduledSession.sessionRevision,
                    reason: "user_requested",
                  });
                }}
                type="button"
                variant="outline"
              >
                Remove from schedule
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="print:hidden">
        <ActivityPlanComments planId={detail.id} />
      </div>
    </div>
  );
}
