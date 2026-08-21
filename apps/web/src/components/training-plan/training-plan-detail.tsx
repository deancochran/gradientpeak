import { trainingPlanSchema } from "@repo/core/schemas";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useMemo, useState } from "react";

import { api } from "../../lib/api/client";
import { summarizeTrainingPlan, toTrainingPlanSessionDrafts } from "./training-plan-model";
import { TrainingPlanPlannedPreview } from "./training-plan-planned-preview";

type TrainingPlanDetailProps = {
  onDeleted: () => void;
  onEdit: () => void;
  onOpenDuplicate: (id: string) => void;
  planId: string;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateKey(value);
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
  const today = dateKey(new Date());
  const planTabQuery = api.trainingPlans.getPlanTabProjection.useQuery({
    startDate: today,
    endDate: addDays(today, 89),
  });
  const plan = planQuery.data;
  const owned = Boolean(plan && profile.data?.id === plan.profile_id);
  const sessions = useMemo(() => toTrainingPlanSessionDrafts(plan?.structure), [plan?.structure]);
  const activityIds = [...new Set(sessions.map((session) => session.activityPlanId))];
  const linkedPlans = api.activityPlans.getManyByIds.useQuery(
    { ids: activityIds },
    { enabled: activityIds.length > 0 },
  );
  const [scheduleDate, setScheduleDate] = useState(dateKey(new Date()));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const commit = api.trainingPlans.commit.useMutation();
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
  const visibility = plan.content_visibility;
  const isApplied = planTabQuery.data?.currentScheduledPlan?.id === plan.id;
  const activeScheduleBatchId = planTabQuery.data?.currentScheduledPlan?.scheduleBatchId;

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
            disabled={commit.isPending}
            onClick={() =>
              void runAction(async () => {
                if (!profile.data?.id) throw new Error("Refresh your profile before duplicating.");
                const state = await utils.athleteIntelligence.getReadModel.fetch({
                  profileId: profile.data.id,
                  sections: { status: true },
                });
                if (state.publishedRevision === null) {
                  throw new Error("Refresh athlete state before duplicating this plan.");
                }
                const copy = await commit.mutateAsync({
                  kind: "duplicate",
                  basePublishedRevision: state.publishedRevision,
                  draft: {
                    sourcePlanId: plan.id,
                    name: `${plan.name} (Copy)`,
                    previewStartDate: scheduleDate,
                  },
                });
                if (copy.status !== "saved") {
                  throw new Error("The plan or athlete state changed. Refresh and retry.");
                }
                onOpenDuplicate(copy.planId);
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
              {linkedPlans.error ? <p role="alert">{linkedPlans.error.message}</p> : null}
              {linkedPlans.data?.items.map((activity) => (
                <div className="rounded-lg border p-3" key={activity.id}>
                  <strong>{activity.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {activity.description || "No description"}
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
                    () =>
                      remove.mutateAsync({
                        training_plan_id: plan.id,
                        schedule_batch_id: activeScheduleBatchId,
                      }),
                    "Scheduled activities removed.",
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
                  disabled={commit.isPending || visibility === value}
                  key={value}
                  onClick={() =>
                    void runAction(async () => {
                      const state = await utils.athleteIntelligence.getReadModel.fetch({
                        profileId: profile.data?.id ?? "",
                        sections: { status: true },
                      });
                      const parsed = trainingPlanSchema.parse(plan.structure);
                      const editor = plan.editor;
                      if (state.publishedRevision === null || !editor)
                        throw new Error("Refresh the plan and athlete state before saving.");
                      const { id: _planId, ...structure } = parsed;
                      const result = await commit.mutateAsync({
                        kind: "update",
                        basePublishedRevision: state.publishedRevision,
                        draft: {
                          planId: plan.id,
                          expectedRevision: editor.revision,
                          expectedStructureHash: editor.structureHash,
                          name: plan.name,
                          description: plan.description,
                          contentVisibility: value,
                          structure,
                          previewStartDate: scheduleDate,
                        },
                      });
                      if (result.status !== "saved")
                        throw new Error("The plan or athlete state changed. Refresh and retry.");
                    }, `Visibility changed to ${value}.`)
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
                if (!window.confirm("Delete this training plan and its planned activities?"))
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
