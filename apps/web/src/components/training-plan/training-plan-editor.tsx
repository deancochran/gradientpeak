import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { skipToken } from "@tanstack/react-query";
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
  const planQuery = api.trainingPlans.get.useQuery(planId ? { id: planId } : skipToken, {
    enabled: Boolean(planId),
  });
  const activityPlansQuery = api.activityPlans.list.useQuery({
    ownerScope: "own",
    limit: 100,
  });
  const profileQuery = api.profiles.get.useQuery();
  const athleteReadModelQuery = api.athleteIntelligence.getReadModel.useQuery(
    profileQuery.data
      ? {
          profileId: profileQuery.data.id,
          sections: {
            publishedState: true,
            status: true,
            currentBaseline: { includePlanningContext: false },
          },
        }
      : skipToken,
    { enabled: Boolean(profileQuery.data) },
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState<TrainingPlanSessionDraft[]>([]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [projectionConflict, setProjectionConflict] = useState<{
    message: string;
    fingerprint: string;
    reason: "state" | "plan";
  } | null>(null);
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

  const draftFingerprint = useMemo(
    () => JSON.stringify({ description, name, structure: preview.structure }),
    [description, name, preview.structure],
  );
  const authoritativePreviewInput = useMemo(() => {
    if (!preview.structure || !name.trim()) return null;
    const commonDraft = {
      name: name.trim(),
      description: description.trim() || null,
      structure: preview.structure,
      previewStartDate: startDate,
    };
    if (!planId) return { kind: "create" as const, draft: commonDraft };
    const editor = planQuery.data?.editor;
    if (!editor) return null;
    return {
      kind: "update" as const,
      draft: {
        ...commonDraft,
        planId,
        expectedRevision: editor.revision,
        expectedStructureHash: editor.structureHash,
      },
    };
  }, [description, name, planId, planQuery.data?.editor, preview.structure, startDate]);
  const authoritativePreviewQuery = api.trainingPlans.preview.useQuery(
    authoritativePreviewInput ?? skipToken,
    {
      enabled: authoritativePreviewInput !== null,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const commitMutation = api.trainingPlans.commit.useMutation();
  const saving = commitMutation.isPending;
  const activityPlans = activityPlansQuery.data?.items ?? [];
  const authoritativeProjection =
    authoritativePreviewQuery.data?.status === "available"
      ? authoritativePreviewQuery.data.simulation
      : null;

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
      setFormError(preview.error ?? "Add at least one valid activity.");
      return;
    }
    if (
      !authoritativePreviewInput ||
      !authoritativeProjection ||
      authoritativePreviewQuery.isFetching
    ) {
      setFormError("Wait for the authoritative preview before saving this draft.");
      return;
    }
    const basePublishedRevision = athleteReadModelQuery.data?.publishedRevision;
    if (basePublishedRevision === null || basePublishedRevision === undefined) {
      setFormError("Published athlete state is unavailable. Refresh and retry.");
      return;
    }

    try {
      const commonDraft = {
        name: name.trim(),
        description: description.trim() || null,
        structure: preview.structure,
        previewStartDate: startDate,
      };
      const editor = planQuery.data?.editor;
      const result = await commitMutation.mutateAsync(
        planId && editor
          ? {
              kind: "update",
              basePublishedRevision,
              draft: {
                ...commonDraft,
                planId,
                expectedRevision: editor.revision,
                expectedStructureHash: editor.structureHash,
              },
            }
          : { kind: "create", basePublishedRevision, draft: commonDraft },
      );
      if (result.status === "stale") {
        setProjectionConflict({
          fingerprint: draftFingerprint,
          reason:
            result.reason === "state_revision" || result.reason === "state_unavailable"
              ? "state"
              : "plan",
          message:
            result.reason === "state_revision" || result.reason === "state_unavailable"
              ? "Athlete state changed while saving. Your draft is preserved and has been re-simulated against the refreshed baseline."
              : "The persisted plan changed while saving. Your draft is preserved; review the refreshed plan before retrying.",
        });
        await Promise.all([athleteReadModelQuery.refetch(), planQuery.refetch()]);
        return;
      }
      await utils.trainingPlans.invalidate();
      onSaved(result.planId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this plan. Try again.");
    }
  };

  const retryProjectionValidation = async () => {
    setFormError(null);
    try {
      await save();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this plan.");
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
        <label className="block space-y-2" htmlFor="training-plan-start-date">
          <span className="text-sm font-medium">Start date</span>
          <Input
            id="training-plan-start-date"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </label>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Activities</CardTitle>
            <Button
              disabled={activityPlansQuery.isLoading}
              onClick={addSession}
              type="button"
              variant="outline"
            >
              Add activity
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activityPlansQuery.error ? (
              <p role="alert">
                Could not load owned activities: {activityPlansQuery.error.message}
              </p>
            ) : null}
            {sessions.length === 0 ? <p>Add a activity to build the plan structure.</p> : null}
            {sessions.map((session, index) => (
              <fieldset
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_8rem_auto]"
                key={
                  session.draftId ??
                  `${session.offsetDays}-${session.activityPlanId}-${session.title}`
                }
              >
                <legend className="px-1 text-sm font-medium">Activity {index + 1}</legend>
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
                    <option value="">Choose a activity</option>
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
        {projectionConflict ? (
          <div className="space-y-2 rounded-lg border border-amber-500/50 p-3" role="alert">
            <p>{projectionConflict.message}</p>
            <Button
              disabled={saving}
              onClick={() => void retryProjectionValidation()}
              type="button"
              variant="outline"
            >
              Rebase and retry validation
            </Button>
          </div>
        ) : null}
        <Button
          disabled={saving || !name.trim() || !preview.structure || !authoritativeProjection}
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
          <p>{preview.summary.sessionCount} activities</p>
          <p>{preview.summary.weekCount} weeks</p>
          {preview.error ? (
            <p className="text-sm text-destructive">Complete each activity to preview and save.</p>
          ) : null}
          <ol className="space-y-2 text-sm">
            {sessions.map((session) => (
              <li
                key={
                  session.draftId ??
                  `${session.offsetDays}-${session.activityPlanId}-${session.title}`
                }
              >
                Day {session.offsetDays + 1}: {session.title || "Activity"}
              </li>
            ))}
          </ol>
          <div aria-live="polite" className="border-t pt-3" role="status">
            <p className="font-medium">Authoritative server projection</p>
            {authoritativePreviewQuery.isFetching ? (
              <p>Validating this draft…</p>
            ) : authoritativePreviewQuery.error ? (
              <div>
                <p>Projection could not be loaded.</p>
                <Button
                  onClick={() => {
                    void authoritativePreviewQuery.refetch();
                  }}
                  type="button"
                  variant="outline"
                >
                  Retry projection
                </Button>
              </div>
            ) : authoritativePreviewInput === null ? (
              <p>Complete the plan details and activities to request a projection.</p>
            ) : !authoritativeProjection ? (
              <p>Projection unavailable from the current published athlete state.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt>Fitness</dt>
                  <dd>{authoritativeProjection.projectedState.longTermLoad.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Fatigue</dt>
                  <dd>{authoritativeProjection.projectedState.recentLoad.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Form</dt>
                  <dd>{authoritativeProjection.projectedState.loadBalance.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Readiness</dt>
                  <dd>{authoritativeProjection.goalAssessment?.readiness.toFixed(0) ?? "—"}</dd>
                </div>
              </dl>
            )}
            {athleteReadModelQuery.data?.status?.freshness === "stale" ? (
              <p className="text-amber-700">
                {athleteReadModelQuery.data.status.importStatus === "active"
                  ? "Using stale published state while activity history imports."
                  : athleteReadModelQuery.data.status.importStatus === "failed"
                    ? "Using stale published state because an activity history import failed."
                    : "Using stale published state while a rebuild is pending."}
              </p>
            ) : null}
            {authoritativeProjection ? (
              <p className="border-t pt-2 text-xs text-muted-foreground">
                The server projection is current for this exact draft.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
