import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useReadOnlyPreview } from "@repo/ui/hooks";
import type { inferRouterInputs } from "@trpc/server";
import { useMemo, useRef, useState } from "react";

import { api } from "../../lib/api/client";
import { summarizeTrainingPlan, toTrainingPlanSessionDrafts } from "./training-plan-model";
import { TrainingPlanPlannedPreview } from "./training-plan-planned-preview";

type TrainingPlanDetailProps = {
  onDeleted: () => void;
  onEdit: () => void;
  onOpenDuplicate: (id: string) => void;
  planId: string;
};

type ApplicationRequest = inferRouterInputs<AppRouter>["trainingPlans"]["previewApplication"];
type ApplicationPreview = Extract<
  inferRouterOutputs<AppRouter>["trainingPlans"]["previewApplication"],
  { status: "available" }
>;
type RemovalPreview =
  inferRouterOutputs<AppRouter>["trainingPlans"]["previewRemoveAppliedSchedule"];
type TrainingPlanCommitRequest = Extract<
  inferRouterInputs<AppRouter>["trainingPlans"]["commit"],
  { kind: "duplicate" }
>;

type ApplicationReview = {
  operationId: string;
  preview: ApplicationPreview;
  request: ApplicationRequest;
};

type RemovalReview = {
  operationId: string;
  preview: RemovalPreview;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function TrainingPlanDetail({
  onDeleted,
  onEdit,
  onOpenDuplicate,
  planId,
}: TrainingPlanDetailProps) {
  const utils = api.useUtils();
  const profile = api.profiles.get.useQuery();
  const planQuery = api.trainingPlans.get.useQuery({ id: planId });
  const plan = planQuery.data;
  const owned = Boolean(plan && profile.data?.id === plan.profile_id);
  const sessions = useMemo(() => toTrainingPlanSessionDrafts(plan?.structure), [plan?.structure]);
  const activityIds = [
    ...new Set(
      sessions.flatMap((session) => (session.activityPlanId ? [session.activityPlanId] : [])),
    ),
  ];
  const linkedPlans = api.activityPlans.getManyByIds.useQuery(
    { ids: activityIds },
    { enabled: activityIds.length > 0 },
  );
  const [scheduleDate, setScheduleDate] = useState(dateKey(new Date()));
  const appliedSchedules = api.trainingPlans.listAppliedSchedules.useQuery({
    training_plan_id: planId,
  });
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const contextKey = JSON.stringify([profile.data?.id, planId]);
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const previewKey = JSON.stringify([
    contextKey,
    scheduleDate,
    selectedApplicationId,
    plan?.editor?.revision,
    plan?.structure_hash,
    appliedSchedules.data?.items,
    appliedSchedules.error?.message,
  ]);
  const previewKeyRef = useRef(previewKey);
  previewKeyRef.current = previewKey;
  const applicationPreview = useReadOnlyPreview<ApplicationReview>(previewKey);
  const removalPreview = useReadOnlyPreview<RemovalReview>(previewKey);
  const [retainedApply, setRetainedApply] = useState<{
    context: string;
    review: ApplicationReview;
  } | null>(null);
  const [retainedRemoval, setRetainedRemoval] = useState<{
    context: string;
    review: RemovalReview;
  } | null>(null);
  const applicationReview =
    retainedApply?.context === contextKey ? retainedApply.review : applicationPreview.data;
  const removalReview =
    retainedRemoval?.context === contextKey ? retainedRemoval.review : removalPreview.data;
  const mutationGuard = useRef(false);
  const [schedulePending, setSchedulePending] = useState(false);
  const inputsLocked =
    schedulePending ||
    retainedApply?.context === contextKey ||
    retainedRemoval?.context === contextKey;
  const [actionFeedback, setActionFeedback] = useState<{
    context: string;
    message: string | null;
  } | null>(null);
  const actionMessage = actionFeedback?.context === contextKey ? actionFeedback.message : null;
  const setActionMessage = (message: string | null) =>
    setActionFeedback({ context: contextKey, message });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const commit = api.trainingPlans.commit.useMutation();
  const retainedCommitRequestRef = useRef<TrainingPlanCommitRequest | null>(null);
  const retainedCommitContextRef = useRef(contextKey);
  const actionGuard = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const remove = api.trainingPlans.removeAppliedSchedule.useMutation();
  const apply = api.trainingPlans.applyApplication.useMutation();
  const deletePlan = api.trainingPlans.delete.useMutation();
  const like = api.social.toggleLike.useMutation();

  const clearPreviews = () => {
    applicationPreview.clear();
    removalPreview.clear();
  };

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setActionPending(true);
    setActionMessage(null);
    setRefreshFailed(false);
    try {
      await action();
      if (contextRef.current !== contextKey) return;
      try {
        await utils.trainingPlans.invalidate();
      } catch {
        if (contextRef.current !== contextKey) return;
        setRefreshFailed(true);
        setActionMessage(`${success} The latest data could not be refreshed.`);
        return;
      }
      if (contextRef.current !== contextKey) return;
      setActionMessage(success);
    } catch (error) {
      if (contextRef.current !== contextKey) return;
      setActionMessage(error instanceof Error ? error.message : "Action failed. Try again.");
    } finally {
      actionGuard.current = false;
      setActionPending(false);
    }
  };

  if (planQuery.isLoading || (plan && plan.id !== planId))
    return <p aria-live="polite">Loading training plan…</p>;
  if (planQuery.error || !plan) {
    return (
      <div className="space-y-3" role="alert">
        <p>{planQuery.error?.message ?? "Training plan not found."}</p>
        <Button onClick={() => void planQuery.refetch()} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const summary = summarizeTrainingPlan(plan.structure);
  const visibility = plan.content_visibility;
  const selectedApplication = appliedSchedules.data?.items.find(
    (item) => item.application_id === selectedApplicationId,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{plan.is_system_template ? "Template" : "Owned plan"}</Badge>
            <Badge variant="outline">{visibility}</Badge>
          </div>
          <h1 className="text-3xl font-semibold">{plan.name}</h1>
          <p className="max-w-3xl text-muted-foreground">{plan.description || "No description"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {owned ? (
            <Button
              disabled={actionPending || inputsLocked}
              onClick={onEdit}
              type="button"
              variant="outline"
            >
              Edit plan
            </Button>
          ) : null}
          <Button
            disabled={actionPending || inputsLocked || commit.isPending}
            onClick={() =>
              void runAction(async () => {
                const retainedCommitRequest = retainedCommitRequestRef.current;
                if (retainedCommitRequest) {
                  if (retainedCommitContextRef.current !== contextKey)
                    throw new Error(
                      "Return to the original plan and account to retry the pending request.",
                    );
                  const copy = await commit.mutateAsync(retainedCommitRequest);
                  if (copy.status !== "saved") {
                    retainedCommitRequestRef.current = null;
                    throw new Error("The plan or athlete state changed. Refresh and retry.");
                  }
                  retainedCommitRequestRef.current = null;
                  if (contextRef.current === contextKey) onOpenDuplicate(copy.planId);
                  return;
                }
                if (!profile.data?.id) throw new Error("Refresh your profile before duplicating.");
                const draft = {
                  sourcePlanId: plan.id,
                  name: `${plan.name} (Copy)`,
                  previewStartDate: scheduleDate,
                };
                const preview = await utils.trainingPlans.preview.fetch({
                  kind: "duplicate",
                  draft,
                });
                if (previewKeyRef.current !== previewKey)
                  throw new Error("Inputs changed. Review again.");
                if (preview.status !== "available")
                  throw new Error("Refresh the plan before duplicating.");
                const commitRequest: TrainingPlanCommitRequest = {
                  kind: "duplicate",
                  operationId: crypto.randomUUID(),
                  basePublishedRevision: preview.basePublishedRevision,
                  previewFingerprint: preview.previewFingerprint,
                  draft,
                };
                retainedCommitRequestRef.current = commitRequest;
                retainedCommitContextRef.current = contextKey;
                const copy = await commit.mutateAsync(commitRequest);
                if (copy.status !== "saved") {
                  retainedCommitRequestRef.current = null;
                  throw new Error("The plan or athlete state changed. Refresh and retry.");
                }
                retainedCommitRequestRef.current = null;
                if (contextRef.current === contextKey) onOpenDuplicate(copy.planId);
              }, "Plan duplicated.")
            }
            type="button"
            variant="outline"
          >
            Duplicate
          </Button>
          <Button
            disabled={actionPending}
            onClick={() =>
              void runAction(
                () => like.mutateAsync({ entity_id: plan.id, entity_type: "training_plan" }),
                plan.has_liked ? "Like removed." : "Plan liked.",
              )
            }
            type="button"
            variant="outline"
          >
            {plan.has_liked ? "Unlike" : "Like"} ({plan.likes_count ?? 0})
          </Button>
          <Button
            disabled={visibility !== "public"}
            onClick={() =>
              void runAction(async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/share/training-plans/${plan.id}`,
                );
              }, "Share link copied.")
            }
            type="button"
            variant="outline"
          >
            Share
          </Button>
        </div>
      </div>

      {actionMessage ? (
        <p aria-live="polite" className="rounded-lg border p-3">
          {actionMessage}
        </p>
      ) : null}
      {refreshFailed && actionMessage ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void Promise.all([planQuery.refetch(), appliedSchedules.refetch()])}
        >
          Refresh plan
        </Button>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <strong>{summary.sessionCount}</strong>
            <p className="text-sm text-muted-foreground">Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <strong>{summary.weekCount}</strong>
            <p className="text-sm text-muted-foreground">Weeks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <strong>{owned ? (plan.editor?.validation.status ?? "—") : "—"}</strong>
            <p className="text-sm text-muted-foreground">Projection status</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <TrainingPlanPlannedPreview
            planId={plan.id}
            preview={plan.plannedSchedulePreview}
            structure={plan.structure}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="structure">
        <TabsList aria-label="Training plan detail sections">
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>
        <TabsContent value="structure">
          <Card>
            <CardHeader>
              <CardTitle>Plan structure</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {sessions.map((session) => (
                  <li
                    className="rounded-lg border p-3"
                    key={
                      session.draftId ??
                      `${session.offsetDays}-${session.activityPlanId}-${session.title}`
                    }
                  >
                    Day {session.offsetDays + 1}: {session.title || "Activity"}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle>Linked activities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedPlans.isLoading ? <p>Loading activities…</p> : null}
              {linkedPlans.error ? (
                <div role="alert">
                  <p>{linkedPlans.error.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void linkedPlans.refetch()}
                  >
                    Retry linked activities
                  </Button>
                </div>
              ) : null}
              {linkedPlans.data?.items.map((activity) => (
                <a
                  className="block rounded-lg border p-3 hover:bg-muted/50"
                  key={activity.id}
                  href={`/activity-plans/${activity.id}`}
                  aria-label={activity.name}
                >
                  <strong>{activity.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {activity.description || "No description"}
                  </p>
                </a>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block max-w-xs space-y-1" htmlFor="training-plan-schedule-date">
            <span className="text-sm font-medium">Start date</span>
            <Input
              id="training-plan-schedule-date"
              disabled={inputsLocked}
              onChange={(event) => {
                if (inputsLocked) return;
                clearPreviews();
                setScheduleDate(event.target.value);
              }}
              type="date"
              value={scheduleDate}
            />
          </label>
          {appliedSchedules.isLoading ? <p role="status">Loading scheduled applications…</p> : null}
          {appliedSchedules.error ? (
            <div role="alert">
              <p>{appliedSchedules.error.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void appliedSchedules.refetch()}
              >
                Retry scheduled applications
              </Button>
            </div>
          ) : null}
          <label className="block max-w-md space-y-1" htmlFor="training-plan-application">
            <span className="text-sm font-medium">Scheduled application</span>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              id="training-plan-application"
              disabled={
                inputsLocked || appliedSchedules.isLoading || Boolean(appliedSchedules.error)
              }
              onChange={(event) => {
                if (inputsLocked) return;
                clearPreviews();
                setSelectedApplicationId(event.target.value);
              }}
              value={selectedApplicationId}
            >
              <option value="">New independent schedule</option>
              {appliedSchedules.data?.items.map((item) => (
                <option key={item.application_id} value={item.application_id}>
                  {item.start_date} · {item.eligible_future_count} future
                </option>
              ))}
            </select>
          </label>
          {applicationPreview.isPending || removalPreview.isPending ? (
            <p role="status">Preparing schedule review…</p>
          ) : null}
          {applicationPreview.error || removalPreview.error ? (
            <p role="alert">{applicationPreview.error ?? removalPreview.error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {applicationReview ? (
              <Button
                disabled={
                  schedulePending ||
                  !applicationReview.preview.applicable ||
                  retainedRemoval?.context === contextKey
                }
                onClick={() =>
                  void runAction(async () => {
                    if (mutationGuard.current) return;
                    mutationGuard.current = true;
                    setSchedulePending(true);
                    setRetainedApply({ context: contextKey, review: applicationReview });
                    try {
                      const result = await apply.mutateAsync({
                        ...applicationReview.request,
                        operationId: applicationReview.operationId,
                        expectedPlanRevision: applicationReview.preview.planRevision,
                        expectedPlanHash: applicationReview.preview.planHash,
                        basePublishedRevision: applicationReview.preview.basePublishedRevision,
                        previewFingerprint: applicationReview.preview.previewFingerprint,
                      });
                      if (contextRef.current !== contextKey) return;
                      if (result.status === "applied") {
                        setRetainedApply(null);
                        applicationPreview.clear();
                        return;
                      }
                      if (result.status === "stale") {
                        setRetainedApply(null);
                        applicationPreview.clear();
                        throw new Error(
                          "This review is no longer current. Review the schedule again.",
                        );
                      }
                      setRetainedApply(null);
                      applicationPreview.clear();
                      throw new Error(
                        "This operation ID conflicts with another request. Review the schedule again.",
                      );
                    } finally {
                      mutationGuard.current = false;
                      setSchedulePending(false);
                    }
                  }, "Plan scheduled.")
                }
                type="button"
              >
                Confirm schedule
              </Button>
            ) : (
              <Button
                disabled={
                  inputsLocked ||
                  applicationPreview.isPending ||
                  removalPreview.isPending ||
                  appliedSchedules.isLoading ||
                  Boolean(appliedSchedules.error) ||
                  Boolean(selectedApplicationId && !selectedApplication)
                }
                onClick={() =>
                  void applicationPreview.run(async () => {
                    const request: ApplicationRequest = {
                      trainingPlanId: plan.id,
                      applicationMode: "full",
                      startDate: scheduleDate,
                      ...(selectedApplication
                        ? { replacesApplicationId: selectedApplication.application_id }
                        : {}),
                    };
                    const preview = await utils.trainingPlans.previewApplication.fetch(request);
                    if (preview.status !== "available")
                      throw new Error("This plan changed. Refresh and review again.");
                    return { operationId: crypto.randomUUID(), preview, request };
                  })
                }
                type="button"
              >
                Review schedule
              </Button>
            )}
            {selectedApplication || removalReview ? (
              removalReview ? (
                <Button
                  disabled={schedulePending || retainedApply?.context === contextKey}
                  onClick={() =>
                    void runAction(async () => {
                      if (mutationGuard.current) return;
                      mutationGuard.current = true;
                      setSchedulePending(true);
                      setRetainedRemoval({ context: contextKey, review: removalReview });
                      try {
                        await remove.mutateAsync({
                          applicationId: removalReview.preview.applicationId,
                          operationId: removalReview.operationId,
                          previewFingerprint: removalReview.preview.previewFingerprint,
                        });
                        if (contextRef.current !== contextKey) return;
                        setRetainedRemoval(null);
                        removalPreview.clear();
                      } catch (error) {
                        const data =
                          error && typeof error === "object" && "data" in error ? error.data : null;
                        if (
                          contextRef.current === contextKey &&
                          data &&
                          typeof data === "object" &&
                          "code" in data &&
                          (data.code === "CONFLICT" || data.code === "NOT_FOUND")
                        ) {
                          setRetainedRemoval(null);
                          removalPreview.clear();
                        }
                        throw error;
                      } finally {
                        mutationGuard.current = false;
                        setSchedulePending(false);
                      }
                    }, "Scheduled activities removed.")
                  }
                  type="button"
                  variant="outline"
                >
                  Confirm remove schedule
                </Button>
              ) : (
                <Button
                  disabled={
                    inputsLocked ||
                    applicationPreview.isPending ||
                    removalPreview.isPending ||
                    appliedSchedules.isLoading ||
                    Boolean(appliedSchedules.error)
                  }
                  onClick={() =>
                    void removalPreview.run(async () => {
                      if (!selectedApplication)
                        throw new Error("Select a scheduled application before reviewing removal.");
                      const preview = await utils.trainingPlans.previewRemoveAppliedSchedule.fetch({
                        applicationId: selectedApplication.application_id,
                      });
                      return { operationId: crypto.randomUUID(), preview };
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  Review schedule removal
                </Button>
              )
            ) : null}
          </div>
          {applicationReview ? (
            <div aria-live="polite" className="rounded-lg border p-3 text-sm">
              <p>
                Review: {applicationReview.preview.sessions.length} sessions beginning on{" "}
                {applicationReview.preview.sessions[0]?.planningDate ?? "the server-selected date"}.
              </p>
              {applicationReview.preview.replacement ? (
                <p>
                  Confirming replaces {applicationReview.preview.replacement.affected.length}{" "}
                  currently scheduled sessions.
                </p>
              ) : null}
              {applicationReview.preview.unresolved.length > 0 ? (
                <p role="alert">
                  Warning: {applicationReview.preview.unresolved.length} sessions need attention
                  before this schedule can be confirmed.
                </p>
              ) : null}
            </div>
          ) : null}
          {removalReview ? (
            <p aria-live="polite" className="rounded-lg border p-3 text-sm">
              Review: removing this application affects {removalReview.preview.affected.length}{" "}
              future scheduled sessions.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {owned ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              disabled={actionPending || inputsLocked || deletePlan.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this training plan? Scheduled-session history prevents deletion.",
                  )
                )
                  return;
                void runAction(async () => {
                  await deletePlan.mutateAsync({ id: plan.id });
                  onDeleted();
                }, "Plan deleted.");
              }}
              type="button"
              variant="destructive"
            >
              Delete plan
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
