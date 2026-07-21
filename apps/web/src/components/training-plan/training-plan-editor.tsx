import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api/client";
import {
  buildTrainingPlanStructure,
  summarizeTrainingPlan,
  type TrainingPlanSessionDraft,
  toTrainingPlanSessionDrafts,
} from "./training-plan-model";

type TrainingPlanEditorProps = {
  planId?: string;
  onSaved: (id: string) => void;
};

export function TrainingPlanEditor({ onSaved, planId }: TrainingPlanEditorProps) {
  const utils = api.useUtils();
  const planQuery = api.trainingPlans.get.useQuery(planId ? { id: planId } : undefined, {
    enabled: Boolean(planId),
  });
  const activityPlansQuery = api.activityPlans.list.useQuery({ ownerScope: "own", limit: 100 });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sessions, setSessions] = useState<TrainingPlanSessionDraft[]>([]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId || !planQuery.data || hydratedId === planId) return;
    setName(planQuery.data.name);
    setDescription(planQuery.data.description ?? "");
    setSessions(toTrainingPlanSessionDrafts(planQuery.data.structure));
    setHydratedId(planId);
  }, [hydratedId, planId, planQuery.data]);

  const preview = useMemo(() => {
    try {
      const structure = buildTrainingPlanStructure(sessions);
      return { structure, summary: summarizeTrainingPlan(structure), error: null };
    } catch (error) {
      return {
        structure: null,
        summary: summarizeTrainingPlan(null),
        error: error instanceof Error ? error.message : "Invalid plan structure",
      };
    }
  }, [sessions]);

  const createMutation = api.trainingPlans.create.useMutation();
  const updateMutation = api.trainingPlans.update.useMutation();
  const saving = createMutation.isPending || updateMutation.isPending;
  const activityPlans = activityPlansQuery.data?.items ?? [];

  const addSession = () => {
    const firstPlan = activityPlans[0];
    setSessions((current) => [
      ...current,
      {
        activityPlanId: firstPlan?.id ?? "",
        draftId: crypto.randomUUID(),
        offsetDays:
          current.length === 0 ? 0 : Math.max(...current.map((item) => item.offsetDays)) + 1,
        title: firstPlan?.name ?? "",
      },
    ]);
  };

  const save = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Plan name is required.");
      return;
    }
    if (!preview.structure) {
      setFormError(preview.error ?? "Add at least one valid workout.");
      return;
    }

    try {
      const result = planId
        ? await updateMutation.mutateAsync({
            id: planId,
            expectedStructureHash: planQuery.data?.structure_hash ?? "",
            name: name.trim(),
            description: description.trim() || null,
            structure: preview.structure,
          })
        : await createMutation.mutateAsync({
            name: name.trim(),
            description: description.trim() || null,
            structure: preview.structure,
          });
      await utils.trainingPlans.invalidate();
      onSaved(result.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this plan. Try again.");
    }
  };

  if (planId && planQuery.isLoading) return <p aria-live="polite">Loading training plan…</p>;
  if (planId && planQuery.error) {
    return (
      <div role="alert">
        <p>Could not load this training plan: {planQuery.error.message}</p>
        <Button onClick={() => void planQuery.refetch()} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Plan builder</p>
          <h1 className="text-3xl font-semibold">
            {planId ? "Edit training plan" : "Create training plan"}
          </h1>
        </div>
        <label className="block space-y-2" htmlFor="training-plan-name">
          <span className="text-sm font-medium">Name</span>
          <Input
            id="training-plan-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="block space-y-2" htmlFor="training-plan-description">
          <span className="text-sm font-medium">Description</span>
          <Textarea
            id="training-plan-description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Workouts</CardTitle>
            <Button
              disabled={activityPlansQuery.isLoading}
              onClick={addSession}
              type="button"
              variant="outline"
            >
              Add workout
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activityPlansQuery.error ? (
              <p role="alert">Could not load owned workouts: {activityPlansQuery.error.message}</p>
            ) : null}
            {sessions.length === 0 ? <p>Add a workout to build the plan structure.</p> : null}
            {sessions.map((session, index) => (
              <fieldset
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_8rem_auto]"
                key={
                  session.draftId ??
                  `${session.offsetDays}-${session.activityPlanId}-${session.title}`
                }
              >
                <legend className="px-1 text-sm font-medium">Workout {index + 1}</legend>
                <label
                  className="space-y-1"
                  htmlFor={`training-plan-session-activity-${session.draftId}`}
                >
                  <span className="text-xs">Activity plan</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    id={`training-plan-session-activity-${session.draftId}`}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, activityPlanId: event.target.value }
                            : item,
                        ),
                      )
                    }
                    value={session.activityPlanId}
                  >
                    <option value="">Choose a workout</option>
                    {activityPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="space-y-1"
                  htmlFor={`training-plan-session-offset-${session.draftId}`}
                >
                  <span className="text-xs">Day offset</span>
                  <Input
                    id={`training-plan-session-offset-${session.draftId}`}
                    min={0}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, offsetDays: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    type="number"
                    value={session.offsetDays}
                  />
                </label>
                <Button
                  className="self-end"
                  onClick={() =>
                    setSessions((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </fieldset>
            ))}
          </CardContent>
        </Card>
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button
          disabled={saving || !name.trim() || !preview.structure}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "Saving…" : planId ? "Save changes" : "Create plan"}
        </Button>
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>{preview.summary.sessionCount} workouts</p>
          <p>{preview.summary.weekCount} weeks</p>
          {preview.error ? (
            <p className="text-sm text-destructive">Complete each workout to preview and save.</p>
          ) : null}
          <ol className="space-y-2 text-sm">
            {sessions.map((session) => (
              <li
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
    </div>
  );
}
