import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useMemo, useState } from "react";

import { api } from "../../lib/api/client";
import { summarizeTrainingPlan, toTrainingPlanSessionDrafts } from "./training-plan-model";

type TrainingPlanDetailProps = {
  onDeleted: () => void;
  onEdit: () => void;
  onOpenDuplicate: (id: string) => void;
  planId: string;
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
  const activePlan = api.trainingPlans.getActivePlan.useQuery();
  const plan = planQuery.data;
  const owned = Boolean(plan && profile.data?.id === plan.profile_id);
  const sessions = useMemo(() => toTrainingPlanSessionDrafts(plan?.structure), [plan?.structure]);
  const activityIds = [...new Set(sessions.map((session) => session.activityPlanId))];
  const linkedPlans = api.activityPlans.getManyByIds.useQuery(
    { ids: activityIds },
    { enabled: activityIds.length > 0 },
  );
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 84);
  const insight = api.trainingPlans.getInsightTimeline.useQuery({
    training_plan_id: planId,
    start_date: dateKey(start),
    end_date: dateKey(new Date()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const weekly = api.trainingPlans.getWeeklySummary.useQuery({
    training_plan_id: planId,
    weeks_back: 8,
  });
  const [scheduleDate, setScheduleDate] = useState(dateKey(new Date()));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const update = api.trainingPlans.update.useMutation();
  const duplicate = api.trainingPlans.duplicate.useMutation();
  const remove = api.trainingPlans.removeAppliedSchedule.useMutation();
  const apply = api.trainingPlans.applyTemplate.useMutation();
  const deletePlan = api.trainingPlans.delete.useMutation();
  const like = api.social.toggleLike.useMutation();

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setActionMessage(null);
    try {
      await action();
      await utils.trainingPlans.invalidate();
      setActionMessage(success);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Action failed. Try again.");
    }
  };

  if (planQuery.isLoading) return <p aria-live="polite">Loading training plan…</p>;
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
  const visibility = plan.content_visibility ?? plan.template_visibility ?? "private";
  const isApplied = activePlan.data?.id === plan.id;
  const activeScheduleBatchId = activePlan.data?.schedule_batch_id;

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
            <Button onClick={onEdit} type="button" variant="outline">
              Edit
            </Button>
          ) : null}
          <Button
            disabled={duplicate.isPending}
            onClick={() =>
              void runAction(async () => {
                const copy = await duplicate.mutateAsync({
                  id: plan.id,
                  newName: `${plan.name} (Copy)`,
                });
                onOpenDuplicate(copy.id);
              }, "Plan duplicated.")
            }
            type="button"
            variant="outline"
          >
            Duplicate
          </Button>
          <Button
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <strong>{summary.sessionCount}</strong>
            <p className="text-sm text-muted-foreground">Workouts</p>
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
            <strong>{weekly.data?.at(-1)?.activityPercentage ?? 0}%</strong>
            <p className="text-sm text-muted-foreground">Recent completion</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="structure">
        <TabsList aria-label="Training plan detail sections">
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
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
                    Day {session.offsetDays + 1}: {session.title || "Workout"}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle>Weekly progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {weekly.isLoading ? <p>Loading progress…</p> : null}
              {weekly.error ? <p role="alert">{weekly.error.message}</p> : null}
              {weekly.data?.map((week) => (
                <div className="flex justify-between rounded-lg border p-3" key={week.weekStart}>
                  <span>{week.weekStart}</span>
                  <span>
                    {week.completedActivities}/{week.plannedActivities} completed
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle>Training insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insight.isLoading ? <p>Loading insights…</p> : null}
              {insight.error ? (
                <div role="alert">
                  <p>{insight.error.message}</p>
                  <Button onClick={() => void insight.refetch()} type="button" variant="outline">
                    Retry insights
                  </Button>
                </div>
              ) : null}
              {insight.data ? (
                <>
                  <p>Feasibility: {insight.data.plan_feasibility.state}</p>
                  <p>Safety: {insight.data.plan_safety.state}</p>
                  <p>{insight.data.timeline.length} timeline points analyzed</p>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="workouts">
          <Card>
            <CardHeader>
              <CardTitle>Linked workouts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedPlans.isLoading ? <p>Loading workouts…</p> : null}
              {linkedPlans.error ? <p role="alert">{linkedPlans.error.message}</p> : null}
              {linkedPlans.data?.items.map((workout) => (
                <div className="rounded-lg border p-3" key={workout.id}>
                  <strong>{workout.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {workout.description || "No description"}
                  </p>
                </div>
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
              onChange={(event) => setScheduleDate(event.target.value)}
              type="date"
              value={scheduleDate}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
              type="checkbox"
            />
            Replace the currently scheduled plan
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={apply.isPending}
              onClick={() =>
                void runAction(
                  () =>
                    apply.mutateAsync({
                      template_type: "training_plan",
                      template_id: plan.id,
                      start_date: scheduleDate,
                      replace_existing: replaceExisting || undefined,
                    }),
                  replaceExisting ? "Schedule replaced." : "Plan scheduled.",
                )
              }
              type="button"
            >
              {replaceExisting ? "Replace schedule" : "Apply to schedule"}
            </Button>
            {isApplied && typeof activeScheduleBatchId === "string" ? (
              <Button
                disabled={remove.isPending}
                onClick={() =>
                  void runAction(
                    () => remove.mutateAsync({ schedule_batch_id: activeScheduleBatchId }),
                    "Scheduled workouts removed.",
                  )
                }
                type="button"
                variant="outline"
              >
                Remove schedule
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {owned ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["private", "followers", "public"] as const).map((value) => (
                <Button
                  disabled={update.isPending || visibility === value}
                  key={value}
                  onClick={() =>
                    void runAction(
                      () =>
                        update.mutateAsync({
                          id: plan.id,
                          expectedStructureHash: plan.structure_hash,
                          template_visibility: value,
                        }),
                      `Visibility changed to ${value}.`,
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  {value}
                </Button>
              ))}
            </div>
            <Button
              disabled={deletePlan.isPending}
              onClick={() => {
                if (!window.confirm("Delete this training plan and its planned workouts?")) return;
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
