import type { AppRouter } from "@repo/api/client";
import {
  type AthletePlanningContext,
  diffDateOnlyUtcDays,
  selectAthletePlanningContextFields,
} from "@repo/core";
import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useAuthStore } from "@/lib/stores/auth-store";
import { deriveActivityPlanPickerState } from "./activity-plan-picker";
import {
  deriveTrainingPathChartFromBackendProjection,
  normalizeBackendPlanningPreview,
} from "./backend-planning-client";
import { createTrainingPlanBuilderActions } from "./builder-actions";
import { deriveBuilderPlanPresentation } from "./builder-presentation";
import {
  buildCanonicalTrainingPlanDraft,
  createTrainingPlanBuilderStateFromExistingPlan,
  getTrainingPlanStructureActivityPlanIds,
} from "./canonical-draft";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { subscribeToTrainingPlanGoalCreation } from "./goalCreationHandoff";
import { trainingPlanBuilderReducer } from "./reducer";
import { selectBuilderSummary } from "./selectors";
import type {
  TrainingPlanCreationProfileGoalSnapshot,
  UseTrainingPlanCreationServiceOptions,
} from "./service-types";

export type {
  TrainingPlanCreationProfileGoalSnapshot,
  UseTrainingPlanCreationServiceOptions,
} from "./service-types";

import type { TrainingPlanBuilderGoalBlueprint, TrainingPlanBuilderSession } from "./types";
import { useTrainingPlanCreationQueries } from "./useTrainingPlanCreationQueries";

const createLocalId = () => randomUUID();

type TrainingPlanCommitRequest = inferRouterInputs<AppRouter>["trainingPlans"]["commit"];

function isDefinitiveRejection(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = error.data;
  return (
    !!data &&
    typeof data === "object" &&
    "code" in data &&
    (data.code === "BAD_REQUEST" ||
      data.code === "UNAUTHORIZED" ||
      data.code === "FORBIDDEN" ||
      data.code === "NOT_FOUND")
  );
}

function preserveLocalAthleteContextOverrides(
  current: AthletePlanningContext,
  incoming: AthletePlanningContext,
): AthletePlanningContext {
  const keepOverride = <T extends { overridden: boolean }>(local: T, next: T) =>
    local.overridden ? local : next;
  return {
    ...incoming,
    demographics: {
      ...incoming.demographics,
      ageYears: keepOverride(current.demographics.ageYears, incoming.demographics.ageYears),
    },
    body: {
      heightCm: keepOverride(current.body.heightCm, incoming.body.heightCm),
      weightKg: keepOverride(current.body.weightKg, incoming.body.weightKg),
      bmi: keepOverride(current.body.bmi, incoming.body.bmi),
      bodyFatPercentage: keepOverride(
        current.body.bodyFatPercentage,
        incoming.body.bodyFatPercentage,
      ),
    },
    physiology: {
      planningThresholdPowerWatts: keepOverride(
        current.physiology.planningThresholdPowerWatts,
        incoming.physiology.planningThresholdPowerWatts,
      ),
      planningThresholdPaceSecondsPerKm: keepOverride(
        current.physiology.planningThresholdPaceSecondsPerKm,
        incoming.physiology.planningThresholdPaceSecondsPerKm,
      ),
      swimThresholdPaceSecondsPer100m: keepOverride(
        current.physiology.swimThresholdPaceSecondsPer100m,
        incoming.physiology.swimThresholdPaceSecondsPer100m,
      ),
      restingHeartRateBpm: keepOverride(
        current.physiology.restingHeartRateBpm,
        incoming.physiology.restingHeartRateBpm,
      ),
      maxHeartRateBpm: keepOverride(
        current.physiology.maxHeartRateBpm,
        incoming.physiology.maxHeartRateBpm,
      ),
      thresholdHeartRateBpm: keepOverride(
        current.physiology.thresholdHeartRateBpm,
        incoming.physiology.thresholdHeartRateBpm,
      ),
      hrvRmssdMs: keepOverride(current.physiology.hrvRmssdMs, incoming.physiology.hrvRmssdMs),
      vo2Max: keepOverride(current.physiology.vo2Max, incoming.physiology.vo2Max),
      currentFitnessLongTermLoad: keepOverride(
        current.physiology.currentFitnessLongTermLoad,
        incoming.physiology.currentFitnessLongTermLoad,
      ),
      currentFatigueRecentLoad: keepOverride(
        current.physiology.currentFatigueRecentLoad,
        incoming.physiology.currentFatigueRecentLoad,
      ),
      currentFormLoadBalance: keepOverride(
        current.physiology.currentFormLoadBalance,
        incoming.physiology.currentFormLoadBalance,
      ),
    },
    wellness: {
      sleepHours: keepOverride(current.wellness.sleepHours, incoming.wellness.sleepHours),
      hydrationLevel: keepOverride(
        current.wellness.hydrationLevel,
        incoming.wellness.hydrationLevel,
      ),
      stressScore: keepOverride(current.wellness.stressScore, incoming.wellness.stressScore),
      sorenessLevel: keepOverride(current.wellness.sorenessLevel, incoming.wellness.sorenessLevel),
      wellnessScore: keepOverride(current.wellness.wellnessScore, incoming.wellness.wellnessScore),
    },
  };
}

function toBuilderGoalTargetOffset(anchorDate: string, targetDate: string | null) {
  if (!targetDate) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ? Math.max(0, diffDateOnlyUtcDays(anchorDate, targetDate))
    : null;
}

function toSelectedGoalBlueprint(input: {
  anchorDate: string;
  createLocalId: () => string;
  goal: TrainingPlanCreationProfileGoalSnapshot;
}): TrainingPlanBuilderGoalBlueprint {
  return {
    localId: input.createLocalId(),
    sourceProfileGoalId: input.goal.id,
    title: input.goal.title,
    targetDate: input.goal.target_date ?? null,
    targetOffsetDays: toBuilderGoalTargetOffset(input.anchorDate, input.goal.target_date ?? null),
    priority: input.goal.priority ?? 10,
    activityCategory: input.goal.activity_category ?? null,
    objective: input.goal.objective ?? null,
  };
}

function createSession(offsetDays: number, title?: string): TrainingPlanBuilderSession {
  const id = createLocalId();
  return {
    id,
    localId: id,
    offsetDays,
    demand: {
      activity_category: "other",
      training_intent: "general_maintenance",
      target_duration_minutes: null,
      target_common_load: null,
      importance: "normal",
    },
    activityPlan: null,
    ...(title ? { eventOverrides: { title } } : {}),
  };
}

export function useTrainingPlanCreationService({
  activityPlanPicker,
  mode = "create",
  onCreated,
  onCreateError,
  onUpdated,
  onUpdateError,
  planId,
  isFlowCurrent,
}: UseTrainingPlanCreationServiceOptions = {}) {
  const utils = api.useUtils();
  const flow = useRef(isFlowCurrent);
  flow.current = isFlowCurrent;
  const accountId = useAuthStore((auth) => auth.session?.user.id ?? null);
  const owner = useMemo(() => ({ mode, planId, accountId }), [mode, planId, accountId]);
  const ownerRef = useRef(owner);
  const mounted = useRef(true);
  const saveGuard = useRef<object | null>(null);
  const completedOwner = useRef<object | null>(null);
  const [pendingOwner, setPendingOwner] = useState<object | null>(null);
  const [editBase, setEditBase] = useState<{ revision: number; structureHash: string } | null>(
    null,
  );
  const [state, rawDispatch] = useReducer(trainingPlanBuilderReducer, undefined, () =>
    createDefaultTrainingPlanBuilderState(),
  );
  const [projectionConflict, setProjectionConflict] = useState<string | null>(null);
  const retainedCommitRequestRef = useRef<TrainingPlanCommitRequest | null>(null);
  const acknowledgedRequest = useRef<{ operationId: string; planId: string } | null>(null);
  if (ownerRef.current !== owner) {
    ownerRef.current = owner;
    retainedCommitRequestRef.current = null;
    saveGuard.current = null;
    completedOwner.current = null;
    acknowledgedRequest.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      retainedCommitRequestRef.current = null;
      acknowledgedRequest.current = null;
    };
  }, []);
  const dispatch = useCallback<typeof rawDispatch>((action) => {
    if (
      flow.current?.() === false ||
      saveGuard.current ||
      retainedCommitRequestRef.current ||
      completedOwner.current
    )
      return;
    rawDispatch(action);
  }, []);
  const hydratedCreationContextAsOfRef = useRef<string | null>(null);
  const hydratedEditPlanIdRef = useRef<string | null>(null);
  const {
    profileQuery,
    creationContextQuery,
    profileGoalsQuery,
    activityPlansQuery,
    editPlanQuery,
    linkedActivityPlansQuery,
    publishedStateQuery,
    commitPlanMutation,
  } = useTrainingPlanCreationQueries({
    ...(activityPlanPicker !== undefined ? { activityPlanPicker } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(onCreated !== undefined ? { onCreated } : {}),
    ...(onCreateError !== undefined ? { onCreateError } : {}),
    ...(onUpdated !== undefined ? { onUpdated } : {}),
    ...(onUpdateError !== undefined ? { onUpdateError } : {}),
    ...(planId !== undefined ? { planId } : {}),
  });
  const isEditMode = mode === "edit" && !!planId;
  const stateOwner = useRef(owner);
  useEffect(() => {
    if (stateOwner.current === owner) return;
    stateOwner.current = owner;
    rawDispatch({ type: "state.replace", state: createDefaultTrainingPlanBuilderState() });
    hydratedEditPlanIdRef.current = null;
    hydratedCreationContextAsOfRef.current = null;
    setEditBase(null);
    setProjectionConflict(null);
  }, [owner]);

  useEffect(() => {
    if (
      isEditMode ||
      pendingOwner === owner ||
      saveGuard.current !== null ||
      retainedCommitRequestRef.current !== null ||
      completedOwner.current !== null ||
      !creationContextQuery.data ||
      !creationContextQuery.data.currentBaseline ||
      !creationContextQuery.data.currentBaseline.planningContext ||
      hydratedCreationContextAsOfRef.current ===
        (creationContextQuery.data.publishedState?.publishedAt ?? creationContextQuery.data.asOf)
    ) {
      return;
    }

    dispatch({
      type: "athleteContext.replace",
      athleteContext: preserveLocalAthleteContextOverrides(
        state.athleteContext,
        creationContextQuery.data.currentBaseline.planningContext,
      ),
    });
    hydratedCreationContextAsOfRef.current =
      creationContextQuery.data.publishedState?.publishedAt ?? creationContextQuery.data.asOf;
  }, [creationContextQuery.data, isEditMode, state.athleteContext, dispatch, pendingOwner, owner]);

  useEffect(() => {
    if (
      !isEditMode ||
      !planId ||
      !editPlanQuery.data ||
      editPlanQuery.data.id !== planId ||
      saveGuard.current ||
      retainedCommitRequestRef.current
    ) {
      return;
    }
    if (hydratedEditPlanIdRef.current === planId) {
      return;
    }

    const linkedActivityPlanIds = getTrainingPlanStructureActivityPlanIds(
      editPlanQuery.data.structure,
    );
    if (linkedActivityPlanIds.length > 0 && !linkedActivityPlansQuery.data) {
      return;
    }

    dispatch({
      type: "state.replace",
      state: createTrainingPlanBuilderStateFromExistingPlan({
        plan: editPlanQuery.data,
        activityPlans: linkedActivityPlansQuery.data?.items ?? [],
      }),
    });
    hydratedEditPlanIdRef.current = planId;
    setEditBase(editPlanQuery.data.editor ? { ...editPlanQuery.data.editor } : null);
  }, [editPlanQuery.data, isEditMode, linkedActivityPlansQuery.data, planId, dispatch]);

  useEffect(() => {
    return subscribeToTrainingPlanGoalCreation((goal) => {
      dispatch({
        type: "goalContext.toggleSelectedGoal",
        goal: toSelectedGoalBlueprint({ anchorDate: state.anchorDate, createLocalId, goal }),
      });
    });
  }, [state.anchorDate, dispatch]);

  const authoritativePreviewInput = useMemo(() => {
    try {
      const draft = buildCanonicalTrainingPlanDraft(state);
      const commonDraft = {
        ...draft,
        previewStartDate: state.scheduling.startDate,
      };
      if (mode !== "edit" || !planId) return { kind: "create" as const, draft: commonDraft };
      const editor = editBase;
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
    } catch {
      return null;
    }
  }, [editBase, mode, planId, state]);
  const authoritativePreviewFingerprint = JSON.stringify(authoritativePreviewInput);
  const debouncedAuthoritativePreviewFingerprint = useDebouncedValue(
    authoritativePreviewFingerprint,
    500,
  );
  const backendPreviewInput =
    debouncedAuthoritativePreviewFingerprint === authoritativePreviewFingerprint
      ? authoritativePreviewInput
      : null;
  const backendPlanningPreviewQuery = api.trainingPlans.preview.useQuery(
    backendPreviewInput ?? skipToken,
    {
      enabled: backendPreviewInput !== null,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  );
  const authoritativeProjection = useMemo(
    () => normalizeBackendPlanningPreview(backendPlanningPreviewQuery.data),
    [backendPlanningPreviewQuery.data],
  );
  const isBackendPlanningInputStale =
    debouncedAuthoritativePreviewFingerprint !== authoritativePreviewFingerprint;
  const trainingPathChartProjection = useMemo(
    () =>
      deriveTrainingPathChartFromBackendProjection({
        backendPreview:
          isBackendPlanningInputStale || backendPlanningPreviewQuery.isFetching
            ? null
            : authoritativeProjection,
        startDate: state.scheduling.startDate,
      }),
    [
      authoritativeProjection,
      backendPlanningPreviewQuery.isFetching,
      isBackendPlanningInputStale,
      state.scheduling.startDate,
    ],
  );
  const previewLifecycle = useMemo(() => {
    if (authoritativePreviewInput === null) {
      return {
        status: "backend_input_unavailable" as const,
        reason: "Valid plan details are required for preview.",
      };
    }
    if (
      isBackendPlanningInputStale ||
      backendPlanningPreviewQuery.isLoading ||
      backendPlanningPreviewQuery.isFetching
    ) {
      return { status: "backend_preview_pending" as const };
    }
    if (backendPlanningPreviewQuery.error) {
      return {
        status: "backend_preview_failed" as const,
        reason: backendPlanningPreviewQuery.error.message,
      };
    }
    return authoritativeProjection
      ? { status: "backend_preview_ready" as const }
      : {
          status: "backend_preview_unavailable" as const,
          reason: "Published athlete state or the persisted plan revision changed.",
        };
  }, [
    authoritativePreviewInput,
    authoritativeProjection,
    backendPlanningPreviewQuery.error,
    backendPlanningPreviewQuery.isFetching,
    backendPlanningPreviewQuery.isLoading,
    isBackendPlanningInputStale,
  ]);
  const projection = useMemo(
    () => ({
      chart: trainingPathChartProjection.chart,
      source: trainingPathChartProjection.source,
    }),
    [trainingPathChartProjection],
  );
  const authoritativeProjectionState = useMemo(() => {
    if (backendPlanningPreviewQuery.error) return { status: "error" as const };
    if (
      authoritativePreviewInput === null ||
      (!authoritativeProjection && !backendPlanningPreviewQuery.isFetching)
    ) {
      return { status: "unavailable" as const };
    }
    if (
      isBackendPlanningInputStale ||
      backendPlanningPreviewQuery.isLoading ||
      backendPlanningPreviewQuery.isFetching ||
      !authoritativeProjection
    ) {
      return { status: "loading" as const };
    }
    return {
      status:
        publishedStateQuery.data?.status?.freshness === "stale"
          ? ("stale" as const)
          : ("available" as const),
      importStatus: publishedStateQuery.data?.status?.importStatus ?? "complete",
      simulation: authoritativeProjection.simulation,
    };
  }, [
    authoritativePreviewInput,
    authoritativeProjection,
    backendPlanningPreviewQuery.error,
    backendPlanningPreviewQuery.isFetching,
    backendPlanningPreviewQuery.isLoading,
    isBackendPlanningInputStale,
    publishedStateQuery.data?.status?.freshness,
    publishedStateQuery.data?.status?.importStatus,
  ]);
  const activityPlanPickerState = useMemo(() => {
    return deriveActivityPlanPickerState({
      athleteContext: state.athleteContext,
      ...(activityPlansQuery.data?.pages !== undefined
        ? { pages: activityPlansQuery.data.pages }
        : {}),
      ...(activityPlanPicker?.selectedSessionId !== undefined
        ? { selectedSessionId: activityPlanPicker.selectedSessionId }
        : {}),
      sessions: state.structure.sessions,
      ...(activityPlanPicker?.sort !== undefined ? { sort: activityPlanPicker.sort } : {}),
    });
  }, [
    activityPlanPicker?.selectedSessionId,
    activityPlanPicker?.sort,
    activityPlansQuery.data?.pages,
    state.athleteContext,
    state.structure.sessions,
  ]);
  const { activityPlanItems, activityPlanFitById, activityPlanEstimateById } =
    activityPlanPickerState;

  const mapProfileGoalToSelectedBlueprint = useCallback(
    (goal: TrainingPlanCreationProfileGoalSnapshot): TrainingPlanBuilderGoalBlueprint =>
      toSelectedGoalBlueprint({ anchorDate: state.anchorDate, createLocalId, goal }),
    [state.anchorDate],
  );

  const persistAndValidatePlan = useCallback(async () => {
    if (
      !mounted.current ||
      flow.current?.() === false ||
      saveGuard.current ||
      completedOwner.current === owner
    )
      return;
    if (!accountId) return;
    saveGuard.current = owner;
    setPendingOwner(owner);
    const current = () =>
      mounted.current &&
      flow.current?.() !== false &&
      ownerRef.current === owner &&
      useAuthStore.getState().session?.user.id === accountId;
    let acknowledged = false;
    const notifyFailure = (error: unknown) => {
      if (acknowledged) return;
      const failure = error instanceof Error ? error : new Error("Unable to save this plan.");
      if (mode === "edit") onUpdateError?.(failure);
      else onCreateError?.(failure);
    };
    try {
      setProjectionConflict(null);
      if (
        !retainedCommitRequestRef.current &&
        mode === "edit" &&
        hydratedEditPlanIdRef.current !== planId
      ) {
        setProjectionConflict("Wait for this plan to finish loading before saving.");
        return;
      }
      let commitRequest = retainedCommitRequestRef.current;
      if (commitRequest) {
        // An interrupted write may have succeeded; only replay the exact idempotent request.
        try {
          const knownId =
            acknowledgedRequest.current?.operationId === commitRequest.operationId
              ? acknowledgedRequest.current.planId
              : null;
          const result = knownId
            ? { status: "saved" as const, planId: knownId }
            : await commitPlanMutation.mutateAsync(commitRequest);
          if (!current()) {
            if (result.status === "saved") await utils.trainingPlans.invalidate();
            return;
          }
          if (result.status === "stale") {
            retainedCommitRequestRef.current = null;
            setProjectionConflict(
              result.reason === "state_revision"
                ? "Athlete state changed while saving. Your changes were preserved and re-simulated against the refreshed baseline."
                : "The saved plan changed while saving. Your changes were preserved. Close and reopen the editor to reload the saved plan before retrying.",
            );
            await Promise.allSettled([publishedStateQuery.refetch(), editPlanQuery.refetch()]);
            return;
          }
          if (result.status === "operation_conflict") {
            retainedCommitRequestRef.current = null;
            setProjectionConflict(
              "This save request conflicts with another operation. Review and retry.",
            );
            return;
          }
          acknowledged = true;
          acknowledgedRequest.current = {
            operationId: commitRequest.operationId,
            planId: result.planId,
          };
          await utils.trainingPlans.invalidate();
          if (!current()) return;
          const savedPlan = { id: result.planId };
          if (mode === "edit") await onUpdated?.(savedPlan);
          else await onCreated?.(savedPlan);
          if (current()) {
            retainedCommitRequestRef.current = null;
            acknowledgedRequest.current = null;
            completedOwner.current = owner;
          }
        } catch (error) {
          if (!current()) return;
          // Even a rejected replay cannot prove that the earlier uncertain write failed.
          setProjectionConflict(
            `${error instanceof Error ? error.message : "Could not save and validate this plan."} ${acknowledged ? "The plan was saved. Retry to finish updating this view." : "The outcome is unknown; retrying will safely reconcile this save."}`,
          );
          notifyFailure(error);
        }
        return;
      }
      if (previewLifecycle.status !== "backend_preview_ready") {
        setProjectionConflict("Wait for the authoritative preview before saving this plan.");
        return;
      }
      const existingPlanId = mode === "edit" ? planId : undefined;
      try {
        const draft = buildCanonicalTrainingPlanDraft(state);
        const commonDraft = {
          ...draft,
          previewStartDate: state.scheduling.startDate,
        };
        const editor = editBase;
        if (existingPlanId && !editor) {
          setProjectionConflict("The persisted plan changed. Refresh before retrying.");
          return;
        }
        const commitDraft =
          existingPlanId && editor
            ? {
                kind: "update" as const,
                draft: {
                  ...commonDraft,
                  planId: existingPlanId,
                  expectedRevision: editor.revision,
                  expectedStructureHash: editor.structureHash,
                },
              }
            : { kind: "create" as const, draft: commonDraft };
        const commitPreview = await utils.trainingPlans.preview.fetch(commitDraft);
        if (!current()) return;
        if (commitPreview.status !== "available") {
          setProjectionConflict("The authoritative preview is unavailable. Refresh and retry.");
          return;
        }
        if (!commitPreview.applicable) {
          setProjectionConflict(
            commitPreview.explanations.join(" ") ||
              "One or more sessions need additional planning input before this plan can be saved.",
          );
          return;
        }
        commitRequest = {
          ...commitDraft,
          operationId: randomUUID(),
          basePublishedRevision: commitPreview.basePublishedRevision,
          previewFingerprint: commitPreview.previewFingerprint,
        };
        retainedCommitRequestRef.current = commitRequest;
        const result = await commitPlanMutation.mutateAsync(commitRequest);
        if (!current()) {
          if (result.status === "saved") await utils.trainingPlans.invalidate();
          return;
        }
        if (result.status === "stale") {
          retainedCommitRequestRef.current = null;
          setProjectionConflict(
            result.reason === "state_revision"
              ? "Athlete state changed while saving. Your changes were preserved and re-simulated against the refreshed baseline."
              : "The saved plan changed while saving. Your changes were preserved. Close and reopen the editor to reload the saved plan before retrying.",
          );
          await Promise.allSettled([publishedStateQuery.refetch(), editPlanQuery.refetch()]);
          return;
        }
        if (result.status === "operation_conflict") {
          retainedCommitRequestRef.current = null;
          setProjectionConflict(
            "This save request conflicts with another operation. Review and retry.",
          );
          return;
        }
        acknowledged = true;
        acknowledgedRequest.current = {
          operationId: commitRequest.operationId,
          planId: result.planId,
        };
        await utils.trainingPlans.invalidate();
        if (!current()) return;
        const savedPlan = { id: result.planId };
        if (mode === "edit") await onUpdated?.(savedPlan);
        else await onCreated?.(savedPlan);
        if (current()) {
          retainedCommitRequestRef.current = null;
          acknowledgedRequest.current = null;
          completedOwner.current = owner;
        }
      } catch (error) {
        if (!current()) return;
        const rejected = !acknowledged && isDefinitiveRejection(error);
        if (rejected) retainedCommitRequestRef.current = null;
        setProjectionConflict(
          `${error instanceof Error ? error.message : "Could not save and validate this plan."} ${acknowledged ? "The plan was saved. Retry to finish updating this view." : rejected ? "The save was rejected. Your draft is preserved for correction." : retainedCommitRequestRef.current ? "The outcome is unknown; retrying will safely reconcile this save." : "No commit was sent. Your draft is preserved; retry the preview."}`,
        );
        notifyFailure(error);
      }
    } finally {
      if (current()) {
        saveGuard.current = null;
        setPendingOwner(null);
      }
    }
  }, [
    commitPlanMutation,
    editPlanQuery,
    mode,
    onCreated,
    onUpdated,
    onCreateError,
    onUpdateError,
    planId,
    previewLifecycle.status,
    publishedStateQuery,
    state,
    utils.trainingPlans,
    owner,
    editBase,
    accountId,
  ]);

  const hasUncertainCommit = retainedCommitRequestRef.current !== null;
  const savePlan = useMemo(() => {
    const canSave =
      completedOwner.current !== owner &&
      (hasUncertainCommit || previewLifecycle.status === "backend_preview_ready");
    const readiness = canSave
      ? {
          detail: hasUncertainCommit
            ? "The previous save outcome is unknown. Retry the same save to reconcile it."
            : mode === "edit"
              ? "The authoritative preview is ready to save."
              : "The authoritative preview is ready to create.",
          label: hasUncertainCommit
            ? "Retry save"
            : mode === "edit"
              ? "Ready to save"
              : "Ready to create",
          status: "ready" as const,
        }
      : previewLifecycle.status === "backend_preview_pending"
        ? {
            detail: "The authoritative preview is updating.",
            label: "Updating preview",
            status: "pending" as const,
          }
        : {
            detail:
              "reason" in previewLifecycle
                ? previewLifecycle.reason
                : "The authoritative preview is unavailable.",
            label: "Preview required",
            status: "blocked" as const,
          };
    return {
      mode,
      label: hasUncertainCommit ? "Retry save" : mode === "edit" ? "Save" : "Create",
      canSave,
      blockers: canSave ? [] : [{ message: readiness.detail }],
      degradedReason: null,
      isPending: pendingOwner === owner,
      isLocked: pendingOwner === owner || hasUncertainCommit || completedOwner.current === owner,
      previewLifecycle,
      readiness: {
        ...readiness,
        detail: `Save readiness: ${readiness.detail}`,
      },
      route: "canonical" as const,
      execute: persistAndValidatePlan,
    };
  }, [pendingOwner, owner, hasUncertainCommit, mode, persistAndValidatePlan, previewLifecycle]);
  const summary = useMemo(() => selectBuilderSummary(state), [state]);
  const builderPresentation = useMemo(() => deriveBuilderPlanPresentation(state), [state]);
  const athleteContextFields = useMemo(
    () => selectAthletePlanningContextFields(state.athleteContext),
    [state.athleteContext],
  );
  const viewModel = useMemo(
    () => ({
      strategy: {
        state,
        viewModel: builderPresentation,
        projection,
      },
      schedule: {
        state,
        viewModel: builderPresentation,
        projection,
      },
      sheets: {
        planPreferences: state.planPreferences,
      },
    }),
    [builderPresentation, projection, state],
  );

  const actions = useMemo(
    () =>
      createTrainingPlanBuilderActions({
        dispatch,
        state,
        createLocalId,
        createSession,
        toSelectedGoalBlueprint: mapProfileGoalToSelectedBlueprint,
      }),
    [mapProfileGoalToSelectedBlueprint, state, dispatch],
  );

  return {
    state,
    mode,
    profileGoalsQuery,
    currentTrainingStatusQuery: creationContextQuery,
    activityPlansQuery,
    editPlanQuery,
    linkedActivityPlansQuery,
    backendPlanningPreviewQuery,
    activityPlanItems,
    activityPlanFitById,
    activityPlanEstimateById,
    isHydratingEditPlan:
      isEditMode &&
      (editPlanQuery.isLoading ||
        (getTrainingPlanStructureActivityPlanIds(editPlanQuery.data?.structure).length > 0 &&
          linkedActivityPlansQuery.isLoading) ||
        hydratedEditPlanIdRef.current !== planId),
    derived: {
      athleteContextFields,
      summary,
      backendPlanningPreview: {
        data: backendPlanningPreviewQuery.data,
        error: backendPlanningPreviewQuery.error,
        isEnabled: backendPreviewInput !== null,
        isFetching: backendPlanningPreviewQuery.isFetching,
        isLoading: backendPlanningPreviewQuery.isLoading,
        isStaleInput: isBackendPlanningInputStale,
      },
      projection,
      projectionConflict,
      authoritativeProjectionState,
      savePlan,
      viewModel,
    },
    queries: {
      profile: profileQuery,
      creationContext: creationContextQuery,
      profileGoals: profileGoalsQuery,
      activityPlans: activityPlansQuery,
      publishedState: publishedStateQuery,
    },
    actions,
  };
}
