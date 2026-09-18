import type { AppRouter } from "@repo/api/client";
import {
  type ContentVisibility,
  copyTrainingPlanWeek,
  summarizeTrainingPlanWeek,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { api } from "../../lib/api/client";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";
import {
  buildTrainingPlanStructure,
  summarizeTrainingPlan,
  type TrainingPlanSessionDraft,
  toTrainingPlanSessionDrafts,
} from "./training-plan-model";

const activityCategories = ["bike", "run", "swim", "strength", "other"] as const;
const startDateSchema = z.iso.date();

type TrainingPlanEditorProps = {
  planId?: string;
  onSaved: (id: string) => void;
};

type TrainingPlanCommitRequest = inferRouterInputs<AppRouter>["trainingPlans"]["commit"];

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
  const [contentVisibility, setContentVisibility] = useState<ContentVisibility>("private");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState<TrainingPlanSessionDraft[]>([]);
  const [sourceStructure, setSourceStructure] = useState<unknown>(undefined);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [projectionConflict, setProjectionConflict] = useState<{
    message: string;
    fingerprint: string;
    reason: "state" | "plan";
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const [copySourceWeek, setCopySourceWeek] = useState(0);
  const [copyDestinationWeek, setCopyDestinationWeek] = useState(1);
  const initialDraftRef = useRef<string | null>(null);
  const snapshotRef = useRef<{
    description: string;
    contentVisibility: ContentVisibility;
    name: string;
    sessions: TrainingPlanSessionDraft[];
    sourceStructure: unknown;
    startDate: string;
  } | null>(null);

  if (!planId && snapshotRef.current === null) {
    snapshotRef.current = {
      description,
      contentVisibility,
      name,
      sessions,
      sourceStructure,
      startDate,
    };
  }

  useEffect(() => {
    if (!planId || !planQuery.data || hydratedId === planId) return;
    setName(planQuery.data.name);
    setDescription(planQuery.data.description ?? "");
    setContentVisibility(planQuery.data.content_visibility);
    setSessions(toTrainingPlanSessionDrafts(planQuery.data.structure));
    setSourceStructure(planQuery.data.structure);
    snapshotRef.current = {
      description: planQuery.data.description ?? "",
      contentVisibility: planQuery.data.content_visibility,
      name: planQuery.data.name,
      sessions: toTrainingPlanSessionDrafts(planQuery.data.structure),
      sourceStructure: structuredClone(planQuery.data.structure),
      startDate,
    };
    setHydratedId(planId);
  }, [hydratedId, planId, planQuery.data, startDate]);

  const preview = useMemo(() => {
    try {
      const structure = buildTrainingPlanStructure(sessions, sourceStructure);
      return { structure, summary: summarizeTrainingPlan(structure), error: null };
    } catch (error) {
      return {
        structure: null,
        summary: summarizeTrainingPlan(null),
        error: error instanceof Error ? error.message : "Invalid plan structure",
      };
    }
  }, [sessions, sourceStructure]);

  const draftFingerprint = useMemo(
    () =>
      JSON.stringify({
        description,
        contentVisibility,
        name,
        startDate,
        sessions,
        structure: preview.structure,
      }),
    [description, contentVisibility, name, preview.structure, sessions, startDate],
  );
  if (!planId && initialDraftRef.current === null) initialDraftRef.current = draftFingerprint;
  if (planId && hydratedId === planId && initialDraftRef.current === null) {
    initialDraftRef.current = draftFingerprint;
  }
  const commitMutation = api.trainingPlans.commit.useMutation();
  const saving = commitMutation.isPending;
  const { guardedCancel, markSaved } = useUnsavedChangesGuard({
    draft: draftFingerprint,
    dirty: initialDraftRef.current !== null && draftFingerprint !== initialDraftRef.current,
    pending: saving,
  });
  const authoritativePreviewInput = useMemo(() => {
    if (!preview.structure || !name.trim()) return null;
    const commonDraft = {
      name: name.trim(),
      description: description.trim() || null,
      contentVisibility,
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
  }, [
    description,
    contentVisibility,
    name,
    planId,
    planQuery.data?.editor,
    preview.structure,
    startDate,
  ]);
  const authoritativePreviewQuery = api.trainingPlans.preview.useQuery(
    authoritativePreviewInput ?? skipToken,
    {
      enabled: authoritativePreviewInput !== null,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const retainedCommitRequestRef = useRef<TrainingPlanCommitRequest | null>(null);
  const [hasUncertainCommit, setHasUncertainCommit] = useState(false);
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
        activityPlanId: firstPlan?.id ?? null,
        activityCategory: firstPlan?.activityCategory ?? "other",
        draftId: crypto.randomUUID(),
        offsetDays:
          current.length === 0 ? 0 : Math.max(...current.map((item) => item.offsetDays)) + 1,
        title: firstPlan?.name ?? "",
      },
    ]);
  };
  const weekCount = Math.max(
    preview.structure?.durationWeeks?.recommended ?? 0,
    sessions.length === 0
      ? 1
      : Math.floor(Math.max(...sessions.map((session) => session.offsetDays)) / 7) + 1,
  );
  const weekIndexes = Array.from({ length: weekCount }, (_, weekIndex) => weekIndex);
  const copyWeek = () => {
    if (!preview.structure) {
      setFormError("Complete the current activities before copying a week.");
      return;
    }
    const result = copyTrainingPlanWeek({
      sessions: preview.structure.sessions,
      sourceWeekIndex: copySourceWeek,
      destinationWeekIndex: copyDestinationWeek,
      createId: crypto.randomUUID,
      ...(preview.structure.durationWeeks?.recommended !== undefined
        ? { durationWeeks: preview.structure.durationWeeks.recommended }
        : {}),
    });
    if (result.status === "rejected") {
      setFormError(
        result.reason === "session_limit"
          ? "A training plan can contain at most 366 activities."
          : "Choose a destination within the current plan duration.",
      );
      return;
    }
    setSessions(toTrainingPlanSessionDrafts({ ...preview.structure, sessions: result.sessions }));
    setFormError(null);
  };

  const save = async () => {
    setFormError(null);
    const retainedCommitRequest = retainedCommitRequestRef.current;
    if (retainedCommitRequest) {
      try {
        const result = await commitMutation.mutateAsync(retainedCommitRequest);
        if (result.status === "saved") {
          retainedCommitRequestRef.current = null;
          setHasUncertainCommit(false);
          await utils.trainingPlans.invalidate();
          markSaved();
          onSaved(result.planId);
          return;
        }
        retainedCommitRequestRef.current = null;
        setHasUncertainCommit(false);
        setFormError(
          "The prior save was not applied. Review the refreshed plan before saving again.",
        );
        await Promise.all([athleteReadModelQuery.refetch(), planQuery.refetch()]);
      } catch (error) {
        setFormError(
          `${error instanceof Error ? error.message : "Could not save this plan."} The outcome is unknown; retry the same save to reconcile it.`,
        );
      }
      return;
    }
    if (!name.trim()) {
      setFormError("Plan name is required.");
      return;
    }
    if (!startDateSchema.safeParse(startDate).success) {
      setStartDateError("Enter a valid plan start date.");
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
      setFormError("Wait for the authoritative preview before saving this plan.");
      return;
    }
    try {
      const commonDraft = {
        name: name.trim(),
        description: description.trim() || null,
        contentVisibility,
        structure: preview.structure,
        previewStartDate: startDate,
      };
      const editor = planQuery.data?.editor;
      const commitDraft =
        planId && editor
          ? {
              kind: "update" as const,
              draft: {
                ...commonDraft,
                planId,
                expectedRevision: editor.revision,
                expectedStructureHash: editor.structureHash,
              },
            }
          : { kind: "create" as const, draft: commonDraft };
      const commitPreview = await utils.trainingPlans.preview.fetch(commitDraft);
      if (commitPreview.status !== "available") {
        setFormError("The authoritative preview is unavailable. Refresh and retry.");
        return;
      }
      if (!commitPreview.applicable) {
        setFormError(
          commitPreview.explanations.join(" ") ||
            "One or more sessions need additional planning input before this plan can be saved.",
        );
        return;
      }
      const commitRequest: TrainingPlanCommitRequest = {
        ...commitDraft,
        operationId: crypto.randomUUID(),
        basePublishedRevision: commitPreview.basePublishedRevision,
        previewFingerprint: commitPreview.previewFingerprint,
      };
      retainedCommitRequestRef.current = commitRequest;
      const result = await commitMutation.mutateAsync(commitRequest);
      if (result.status === "stale") {
        retainedCommitRequestRef.current = null;
        setProjectionConflict({
          fingerprint: draftFingerprint,
          reason: result.reason === "state_revision" ? "state" : "plan",
          message:
            result.reason === "state_revision"
              ? "Athlete state changed while saving. Your changes are preserved and have been re-simulated against the refreshed baseline."
              : "The saved plan changed while saving. Your changes are preserved; review the refreshed plan before retrying.",
        });
        await Promise.all([athleteReadModelQuery.refetch(), planQuery.refetch()]);
        return;
      }
      if (result.status === "operation_conflict") {
        retainedCommitRequestRef.current = null;
        setFormError("This save request conflicts with another operation. Review and save again.");
        return;
      }
      await utils.trainingPlans.invalidate();
      retainedCommitRequestRef.current = null;
      markSaved();
      onSaved(result.planId);
    } catch (error) {
      setHasUncertainCommit(true);
      setFormError(
        `${error instanceof Error ? error.message : "Could not save this plan."} The outcome is unknown; retry the same save to reconcile it.`,
      );
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
    <form
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="space-y-5" disabled={saving}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Plan builder</p>
          <h1 className="text-3xl font-semibold">
            {planId ? "Edit training plan" : "Create training plan"}
          </h1>
        </div>
        <label className="block space-y-2" htmlFor="training-plan-name">
          <span className="text-sm font-medium">Name</span>
          <Input
            disabled={hasUncertainCommit}
            id="training-plan-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="block space-y-2" htmlFor="training-plan-description">
          <span className="text-sm font-medium">Description</span>
          <Textarea
            disabled={hasUncertainCommit}
            id="training-plan-description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </label>
        <label className="block space-y-2" htmlFor="training-plan-visibility">
          <span className="text-sm font-medium">Visibility</span>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            disabled={saving || hasUncertainCommit}
            id="training-plan-visibility"
            onChange={(event) => setContentVisibility(event.target.value as ContentVisibility)}
            value={contentVisibility}
          >
            <option value="private">Private</option>
            <option value="followers">Followers</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="block space-y-2" htmlFor="training-plan-start-date">
          <span className="text-sm font-medium">Start date</span>
          <Input
            aria-describedby={startDateError ? "training-plan-start-date-error" : undefined}
            aria-invalid={Boolean(startDateError)}
            disabled={hasUncertainCommit}
            id="training-plan-start-date"
            onChange={(event) => {
              setStartDate(event.target.value);
              setStartDateError(null);
            }}
            type="date"
            value={startDate}
          />
          {startDateError ? (
            <span
              className="text-sm text-destructive"
              id="training-plan-start-date-error"
              role="alert"
            >
              {startDateError}
            </span>
          ) : null}
        </label>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Activities</CardTitle>
            <Button
              disabled={activityPlansQuery.isLoading || hasUncertainCommit}
              onClick={addSession}
              type="button"
              variant="outline"
            >
              Add activity
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <label className="space-y-1 text-sm" htmlFor="copy-source-week">
                <span>Copy week</span>
                <select
                  disabled={hasUncertainCommit}
                  id="copy-source-week"
                  onChange={(event) => setCopySourceWeek(Number(event.target.value))}
                  value={copySourceWeek}
                >
                  {weekIndexes.map((weekIndex) => (
                    <option key={`source-week-${weekIndex}`} value={weekIndex}>
                      Week {weekIndex + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm" htmlFor="copy-destination-week">
                <span>To week</span>
                <select
                  disabled={hasUncertainCommit}
                  id="copy-destination-week"
                  onChange={(event) => setCopyDestinationWeek(Number(event.target.value))}
                  value={copyDestinationWeek}
                >
                  {weekIndexes.map((weekIndex) => (
                    <option key={`destination-week-${weekIndex}`} value={weekIndex}>
                      Week {weekIndex + 1}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={hasUncertainCommit}
                onClick={copyWeek}
                type="button"
                variant="outline"
              >
                Copy week
              </Button>
            </div>
            {activityPlansQuery.error ? (
              <p role="alert">
                Could not load owned activities: {activityPlansQuery.error.message}
              </p>
            ) : null}
            {sessions.length === 0 ? <p>Add a activity to build the plan structure.</p> : null}
            {sessions.map((session, index) => (
              <fieldset
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_8rem_auto]"
                disabled={hasUncertainCommit}
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
                    onChange={(event) => {
                      const plan = activityPlans.find((item) => item.id === event.target.value);
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                activityPlanId: event.target.value || null,
                                ...(plan
                                  ? { activityCategory: plan.activityCategory, title: plan.name }
                                  : {}),
                              }
                            : item,
                        ),
                      );
                    }}
                    value={session.activityPlanId ?? ""}
                  >
                    <option value="">Choose automatically</option>
                    {activityPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                {session.activityPlanId === null ? (
                  <label
                    className="space-y-1"
                    htmlFor={`training-plan-session-category-${session.draftId}`}
                  >
                    <span className="text-xs">Activity category</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3"
                      id={`training-plan-session-category-${session.draftId}`}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  activityCategory: event.target
                                    .value as TrainingPlanSessionDraft["activityCategory"],
                                }
                              : item,
                          ),
                        )
                      }
                      value={session.activityCategory}
                    >
                      {activityCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label
                  className="space-y-1"
                  htmlFor={`training-plan-session-offset-${session.draftId}`}
                >
                  <span className="text-xs">Day offset</span>
                  <Input
                    aria-describedby={
                      Number.isFinite(session.offsetDays)
                        ? undefined
                        : `training-plan-session-offset-error-${session.draftId}`
                    }
                    id={`training-plan-session-offset-${session.draftId}`}
                    min={0}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                offsetDays:
                                  event.target.value === ""
                                    ? Number.NaN
                                    : Number(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                    type="number"
                    aria-invalid={!Number.isFinite(session.offsetDays)}
                    value={Number.isFinite(session.offsetDays) ? session.offsetDays : ""}
                  />
                  {!Number.isFinite(session.offsetDays) ? (
                    <span
                      className="text-xs text-destructive"
                      id={`training-plan-session-offset-error-${session.draftId}`}
                      role="alert"
                    >
                      Enter a day offset of zero or greater.
                    </span>
                  ) : null}
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
          disabled={
            saving ||
            (!hasUncertainCommit &&
              (!name.trim() || !preview.structure || !authoritativeProjection))
          }
          type="submit"
        >
          {saving
            ? "Saving…"
            : hasUncertainCommit
              ? "Retry save"
              : planId
                ? "Save changes"
                : "Create plan"}
        </Button>
        {snapshotRef.current ? (
          <Button
            disabled={saving || hasUncertainCommit}
            onClick={() =>
              guardedCancel(() => {
                const snapshot = snapshotRef.current;
                if (!snapshot) return;
                setName(snapshot.name);
                setDescription(snapshot.description);
                setContentVisibility(snapshot.contentVisibility);
                setSessions(snapshot.sessions);
                setSourceStructure(structuredClone(snapshot.sourceStructure));
                setStartDate(snapshot.startDate);
                setFormError(null);
                setStartDateError(null);
              })
            }
            type="button"
            variant="outline"
          >
            Cancel changes
          </Button>
        ) : null}
      </fieldset>
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>{preview.summary.sessionCount} activities</p>
          <p>{preview.summary.weekCount} weeks</p>
          {preview.structure ? (
            <p className="text-sm text-muted-foreground">
              Week {copySourceWeek + 1}:{" "}
              {Object.entries(
                summarizeTrainingPlanWeek({
                  sessions: preview.structure.sessions,
                  weekIndex: copySourceWeek,
                }),
              )
                .filter(([, summary]) => summary.sessionCount > 0)
                .map(
                  ([category, summary]) =>
                    `${category} ${summary.knownDurationMinutes} min${summary.unknownDurationSessionCount ? ` + ${summary.unknownDurationSessionCount} unknown` : ""}`,
                )
                .join(" · ") || "No activities"}
            </p>
          ) : null}
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
              <p>Validating this plan…</p>
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
                The server projection is current for these exact changes.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
