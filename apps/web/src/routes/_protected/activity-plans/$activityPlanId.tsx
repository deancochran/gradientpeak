import type { AppRouter } from "@repo/api/client";
import { activityPlanStructureSchema, buildActivityPlanPrintModel } from "@repo/core/activity-plan";
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
import { createFileRoute, Link } from "@tanstack/react-router";
import type { inferRouterInputs } from "@trpc/server";
import { ArrowLeft, CalendarDays, Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ActivityPlanComments } from "../../../components/activity-plan/activity-plan-comments";
import { ActivityPlanEditSession } from "../../../components/activity-plan/activity-plan-edit-session";
import { ActivityPlanEstimateRow } from "../../../components/activity-plan/activity-plan-estimates";
import { ActivityPlanPdfActions } from "../../../components/activity-plan/activity-plan-pdf-actions";
import { ActivityPlanSessionFlow } from "../../../components/activity-plan/activity-plan-session-flow";
import {
  DetailPageIntro,
  LikeToggleButton,
  OwnerSummary,
} from "../../../components/protected/activity-route-primitives";
import { formatDate } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";
import { loadRouteQuery } from "../../../lib/api/route-loading";
import { prefetchSecondary } from "../../../lib/api/secondary-prefetch";
import {
  activityPlanPreparationSearch,
  parseActivityPlanPreparationContext,
} from "../../../lib/coaching/activity-plan-preparation-context";
import { getTodayDateKey, shiftDateKey } from "../../../lib/planning";

export const Route = createFileRoute("/_protected/activity-plans/$activityPlanId")({
  loader: ({ context, params }) => {
    const input = { id: params.activityPlanId, personalize: false };
    prefetchSecondary(() => context.apiUtils.profiles.get.prefetch());
    return loadRouteQuery(
      () => context.apiUtils.activityPlans.getById.getData(input),
      () => context.apiUtils.activityPlans.getById.fetch(input, { retry: false }),
    );
  },
  validateSearch: (search: Record<string, unknown>) => ({
    ...(parseActivityPlanPreparationContext(search) ?? {}),
    edit: search.edit === true || search.edit === "true" ? true : undefined,
  }),
  component: ActivityPlanDetailPage,
});

function ActivityPlanDetailPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { activityPlanId } = Route.useParams();
  const activePlanId = useRef(activityPlanId);
  activePlanId.current = activityPlanId;
  const editOwner = useRef(0);
  const { edit: editMode } = Route.useSearch();
  const preparation = parseActivityPlanPreparationContext(
    Route.useSearch() as Record<string, unknown>,
  );
  const editing = editMode === true;
  const planQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId, personalize: false },
    { retry: false },
  );
  const today = getTodayDateKey();
  const profileQuery = api.profiles.get.useQuery();
  const scheduleQuery = api.plannedSessions.range.useQuery(
    {
      profileId: profileQuery.data?.id ?? "",
      range: { startDate: shiftDateKey(today, -183), endDate: shiftDateKey(today, 182) },
    },
    { enabled: Boolean(profileQuery.data?.id) },
  );
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateDirty, setDateDirty] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const scheduleGuard = useRef(false);
  const scheduleContext = JSON.stringify([activityPlanId, profileQuery.data?.id]);
  const currentContext = useRef(scheduleContext);
  currentContext.current = scheduleContext;
  type CreateScheduleInput = inferRouterInputs<AppRouter>["plannedSessions"]["create"];
  const retainedSchedule = useRef<{ context: string; input: CreateScheduleInput } | null>(null);
  const [retainedContext, setRetainedContext] = useState<string | null>(null);
  const scheduleHeld = retainedContext === scheduleContext;
  const previousScheduleContext = useRef<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const detail = planQuery.data?.detail;
  const edit = planQuery.data?.edit;
  const linkedSessions = (scheduleQuery.data?.items ?? []).filter(
    (session) => session.activityPlanId === activityPlanId,
  );
  const scheduledEvents = linkedSessions.filter(
    (session) => session.lifecycle.status === "scheduled",
  );
  const hasProtectedHistory = deleteBlocked || linkedSessions.length > 0;
  const scheduledEvent = scheduledEvents[0];
  const isOwner = detail?.capabilities.canEdit ?? false;
  const parsedStructure = activityPlanStructureSchema.safeParse(detail?.structure);
  const displayStructure = parsedStructure.success ? parsedStructure.data : null;
  const printModel = detail
    ? buildActivityPlanPrintModel({
        format: "full-page",
        ...(detail.description === undefined ? {} : { description: detail.description }),
        structure: displayStructure,
        title: detail.name,
      })
    : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing the resource starts a fresh local interaction scope.
  useEffect(() => {
    setDeleteBlocked(false);
    setDeleteProgress(null);
  }, [activityPlanId]);

  useEffect(() => {
    setLiked(detail?.engagement.viewerHasLiked ?? false);
    setLikesCount(detail?.engagement.likes ?? 0);
  }, [detail?.engagement.likes, detail?.engagement.viewerHasLiked]);

  useEffect(() => {
    if (previousScheduleContext.current !== scheduleContext) {
      previousScheduleContext.current = scheduleContext;
      setDateDirty(false);
      setScheduleDate(scheduledEvent?.planningDate ?? getTodayDateKey());
      setScheduleError(null);
    } else if (scheduledEvent?.planningDate && !dateDirty && !scheduleHeld) {
      setScheduleDate(scheduledEvent.planningDate);
    }
  }, [scheduledEvent?.planningDate, dateDirty, scheduleHeld, scheduleContext]);

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
    onSuccess: async (_result, variables) => {
      if (variables.id !== activePlanId.current) return;
      await Promise.allSettled([Promise.resolve().then(() => utils.activityPlans.invalidate())]);
      if (variables.id !== activePlanId.current) return;
    },
    onError: async (error, variables) => {
      if (variables.id !== activePlanId.current) return;
      if (error.data?.code === "CONFLICT") await planQuery.refetch();
    },
  });
  const createSchedule = api.plannedSessions.create.useMutation({
    retry: false,
    onSuccess: async () => {
      if (retainedSchedule.current?.context !== currentContext.current) return;
      retainedSchedule.current = null;
      setRetainedContext(null);
      setDateDirty(false);
      await Promise.allSettled([
        Promise.resolve().then(() => utils.calendar.invalidate()),
        Promise.resolve().then(() => scheduleQuery.refetch()),
      ]);
      toast.success("Activity plan scheduled");
    },
    onError: (error) => {
      if (retainedSchedule.current?.context !== currentContext.current) return;
      setScheduleError(
        error.message || "Activity plan could not be scheduled. Retry the same request.",
      );
      if (["BAD_REQUEST", "NOT_FOUND", "FORBIDDEN"].includes(error.data?.code ?? "")) {
        retainedSchedule.current = null;
        setRetainedContext(null);
      }
    },
    onSettled: () => {
      scheduleGuard.current = false;
    },
  });
  const updateSchedule = api.plannedSessions.move.useMutation({
    onSuccess: async () => {
      setDateDirty(false);
      await Promise.allSettled([
        Promise.resolve().then(() => utils.calendar.invalidate()),
        Promise.resolve().then(() => scheduleQuery.refetch()),
      ]);
      toast.success("Activity plan rescheduled");
    },
    onError: (error) => setScheduleError(error.message || "Activity plan could not be rescheduled"),
    onSettled: () => {
      scheduleGuard.current = false;
    },
  });
  const removeSchedule = api.plannedSessions.cancel.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.calendar.invalidate(), scheduleQuery.refetch()]);
      toast.success("Activity plan removed from the schedule");
    },
    onError: (error) =>
      setScheduleError(error.message || "Scheduled activity could not be removed"),
  });
  const deletePlan = api.activityPlans.delete.useMutation({
    onSuccess: (_result, variables) => {
      if (variables.id !== activePlanId.current) return;
      void navigate({ to: "/activity-plans" } as never);
      void utils.activityPlans.invalidate();
      toast.success("Activity plan deleted");
    },
    onError: (error, variables) => {
      if (variables.id !== activePlanId.current) return;
      setDeleteProgress(error.message || "Activity plan could not be deleted");
      if (error.data?.code === "CONFLICT") setDeleteBlocked(true);
    },
  });

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
            <Link to="/activity-plans" search={{ activity_category: undefined, q: undefined }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to activity plans
            </Link>
          </Button>
          <Button onClick={() => void planQuery.refetch()} type="button" variant="ghost">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (editing && edit) {
    const owner = editOwner.current;
    return (
      <div className="container mx-auto max-w-6xl space-y-6 py-4">
        <ActivityPlanEditSession
          key={activityPlanId}
          edit={edit}
          onCancel={() => {
            editOwner.current += 1;
            void navigate({
              search: preparation
                ? { ...activityPlanPreparationSearch(preparation), edit: undefined }
                : { edit: undefined },
              replace: true,
            });
          }}
          onUpdate={(values) => updatePlan.mutateAsync(values)}
          onSaved={() => {
            if (editOwner.current !== owner || activePlanId.current !== activityPlanId) return;
            toast.success("Activity plan updated");
            if (preparation)
              return navigate({
                to: "/organizations/$organizationId/athletes/$athleteId",
                params: {
                  athleteId: preparation.athleteId,
                  organizationId: preparation.organizationId,
                },
                search: activityPlanPreparationSearch(preparation, activityPlanId),
              } as never);
            return navigate({ search: { edit: undefined }, replace: true });
          }}
        />
      </div>
    );
  }

  if (!detail) return null;
  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-4 print:max-w-none print:py-0">
      <Button asChild className="print:hidden" size="sm" variant="ghost">
        <Link
          to="/activity-plans"
          search={
            preparation
              ? {
                  ...activityPlanPreparationSearch(preparation),
                  activity_category: undefined,
                  q: undefined,
                }
              : { activity_category: undefined, q: undefined }
          }
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to activity plans
        </Link>
      </Button>

      <DetailPageIntro
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {printModel ? <ActivityPlanPdfActions key={detail.id} model={printModel} /> : null}
            {detail.capabilities.canRecord ? (
              <Button asChild>
                <Link
                  to="/record/plan"
                  search={{
                    activityPlanId: detail.id,
                    activity_category: detail.activityCategory,
                    gps: "off",
                  }}
                >
                  Record this plan
                </Link>
              </Button>
            ) : null}
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
                onClick={() =>
                  void navigate({
                    search: preparation
                      ? { ...activityPlanPreparationSearch(preparation), edit: true }
                      : { edit: true },
                  })
                }
                type="button"
                variant="outline"
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            ) : null}
            {preparation ? (
              <Button asChild variant="outline">
                <Link
                  to="/organizations/$organizationId/athletes/$athleteId"
                  params={{
                    athleteId: preparation.athleteId,
                    organizationId: preparation.organizationId,
                  }}
                  search={activityPlanPreparationSearch(preparation, detail.id)}
                >
                  Prepare for athlete
                </Link>
              </Button>
            ) : null}
            {isOwner ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={!scheduledEvent && scheduleQuery.isLoading && !scheduleQuery.data}
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
                      {hasProtectedHistory
                        ? `This plan has planned-session history${scheduledEvents.length ? `, including ${scheduledEvents.length} scheduled session${scheduledEvents.length === 1 ? "" : "s"}` : ""}, and cannot be deleted. Canceling a schedule preserves that history.`
                        : "This permanently removes the plan from your library. Deletion will be blocked if any linked schedule exists."}
                    </AlertDialogDescription>
                    {deleteProgress ? (
                      <p className="text-sm text-destructive" role="alert">
                        {deleteProgress}
                      </p>
                    ) : null}
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={
                        deletePlan.isPending ||
                        removeSchedule.isPending ||
                        hasProtectedHistory ||
                        scheduleQuery.isError ||
                        (!scheduledEvent && scheduleQuery.isLoading && !scheduleQuery.data)
                      }
                      onClick={(event) => {
                        event.preventDefault();
                        if (!hasProtectedHistory) deletePlan.mutate({ id: activityPlanId });
                      }}
                    >
                      {deletePlan.isPending ? "Deleting..." : "Delete plan"}
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
                    ? detail.capabilities.canRecord
                      ? "Available to record"
                      : "Not available for recording"
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
        <ActivityPlanSessionFlow structure={displayStructure} showStepNames={false} />
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
            <CardTitle>{scheduledEvent ? "Reschedule activity" : "Schedule activity"}</CardTitle>
            <CardDescription>
              {scheduledEvent
                ? `Currently scheduled for ${scheduledEvent.planningDate}.`
                : "Add this reusable plan to your calendar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <DateInput
                disabled={scheduleHeld || createSchedule.isPending || updateSchedule.isPending}
                id="activity-plan-schedule-date"
                label="Schedule date"
                onChange={(value) => {
                  if (scheduleGuard.current || scheduleHeld) return;
                  setDateDirty(true);
                  setScheduleDate(value ?? "");
                }}
                value={scheduleDate}
              />
            </div>
            <Button
              disabled={
                !scheduleDate ||
                !profileQuery.data?.id ||
                profileQuery.isLoading ||
                profileQuery.isError ||
                scheduleQuery.isLoading ||
                scheduleQuery.isError ||
                createSchedule.isPending ||
                updateSchedule.isPending
              }
              onClick={() => {
                if (scheduleGuard.current || scheduleQuery.isError || scheduleQuery.isLoading)
                  return;
                if (!profileQuery.data?.id) return;
                scheduleGuard.current = true;
                setScheduleError(null);
                if (scheduledEvent && !scheduleHeld) {
                  updateSchedule.mutate({
                    profileId: profileQuery.data.id,
                    sessionId: scheduledEvent.id,
                    expectedRevision: scheduledEvent.sessionRevision,
                    planningDate: scheduleDate,
                  });
                } else {
                  const input =
                    retainedSchedule.current?.context === scheduleContext
                      ? retainedSchedule.current.input
                      : {
                          profileId: profileQuery.data.id,
                          session: {
                            planningDate: scheduleDate,
                            source: { kind: "direct" as const, operationId: crypto.randomUUID() },
                            activityPlanId: detail.id,
                          },
                        };
                  retainedSchedule.current = { context: scheduleContext, input };
                  setRetainedContext(scheduleContext);
                  createSchedule.mutate(input);
                }
              }}
              type="button"
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {scheduleHeld ? "Retry schedule" : scheduledEvent ? "Reschedule" : "Schedule"}
            </Button>
            {scheduledEvent ? (
              <Button
                disabled={removeSchedule.isPending}
                onClick={() => {
                  if (!profileQuery.data?.id) return;
                  removeSchedule.mutate({
                    profileId: profileQuery.data.id,
                    sessionId: scheduledEvent.id,
                    expectedRevision: scheduledEvent.sessionRevision,
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
          {scheduleQuery.isLoading ? <p role="status">Loading scheduled sessions...</p> : null}
          {scheduleQuery.isError ? (
            <div role="alert">
              <p>Scheduled sessions could not be loaded. Your date is kept.</p>
              <Button type="button" variant="outline" onClick={() => void scheduleQuery.refetch()}>
                Retry loading schedule
              </Button>
            </div>
          ) : null}
          {scheduleError ? <p role="alert">{scheduleError}</p> : null}
        </Card>
      ) : null}

      <div className="print:hidden">
        <ActivityPlanComments planId={detail.id} />
      </div>
    </div>
  );
}
