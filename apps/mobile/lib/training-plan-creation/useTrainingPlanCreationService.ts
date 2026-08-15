import {
  type AthletePlanningContext,
  diffDateOnlyUtcDays,
  selectAthletePlanningContextFields,
} from "@repo/core";
import { skipToken } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
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
import { selectTrainingPlanPreferenceFields } from "./preferences-context";
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

import type {
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderSession,
  TrainingPlanBuilderSessionIntent,
} from "./types";
import { useTrainingPlanCreationQueries } from "./useTrainingPlanCreationQueries";

const createLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

function createSession(
  offsetDays: number,
  title?: string,
  intent?: TrainingPlanBuilderSessionIntent,
): TrainingPlanBuilderSession {
  return {
    localId: createLocalId(),
    offsetDays,
    ...(intent ? { intent } : {}),
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
}: UseTrainingPlanCreationServiceOptions = {}) {
  const [state, dispatch] = useReducer(trainingPlanBuilderReducer, undefined, () =>
    createDefaultTrainingPlanBuilderState(),
  );
  const [persistedPlanId, setPersistedPlanId] = useState<string | null>(null);
  const [projectionConflict, setProjectionConflict] = useState<string | null>(null);
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
    activityPlanPicker,
    mode,
    onCreated,
    onCreateError,
    onUpdated,
    onUpdateError,
    planId,
  });
  const isEditMode = mode === "edit" && !!planId;

  useEffect(() => {
    if (
      isEditMode ||
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
  }, [creationContextQuery.data, isEditMode, state.athleteContext]);

  useEffect(() => {
    if (!isEditMode || !planId || !editPlanQuery.data) {
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
  }, [editPlanQuery.data, isEditMode, linkedActivityPlansQuery.data, planId]);

  useEffect(() => {
    return subscribeToTrainingPlanGoalCreation((goal) => {
      dispatch({
        type: "goalContext.toggleSelectedGoal",
        goal: toSelectedGoalBlueprint({ anchorDate: state.anchorDate, createLocalId, goal }),
      });
    });
  }, [state.anchorDate]);

  const authoritativePreviewInput = useMemo(() => {
    try {
      const draft = buildCanonicalTrainingPlanDraft(state);
      const commonDraft = {
        ...draft,
        previewStartDate: state.scheduling.startDate,
      };
      if (mode !== "edit" || !planId) return { kind: "create" as const, draft: commonDraft };
      const editor = editPlanQuery.data?.editor;
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
  }, [editPlanQuery.data?.editor, mode, planId, state]);
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
        reason: "A valid canonical draft is required for preview.",
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
      pages: activityPlansQuery.data?.pages,
      selectedSessionId: activityPlanPicker?.selectedSessionId,
      sessions: state.structure.sessions,
      sort: activityPlanPicker?.sort,
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
    setProjectionConflict(null);
    if (previewLifecycle.status !== "backend_preview_ready") {
      setProjectionConflict("Wait for the authoritative preview before saving this draft.");
      return;
    }
    const existingPlanId = planId ?? persistedPlanId;
    const basePublishedRevision = publishedStateQuery.data?.publishedRevision;
    if (basePublishedRevision === null || basePublishedRevision === undefined) {
      setProjectionConflict("Published athlete state is unavailable. Refresh and retry.");
      return;
    }
    try {
      const draft = buildCanonicalTrainingPlanDraft(state);
      const commonDraft = {
        ...draft,
        previewStartDate: state.scheduling.startDate,
      };
      const editor = editPlanQuery.data?.editor;
      if (existingPlanId && !editor) {
        setProjectionConflict("The persisted plan changed. Refresh before retrying.");
        return;
      }
      const result = await commitPlanMutation.mutateAsync(
        existingPlanId && editor
          ? {
              kind: "update",
              basePublishedRevision,
              draft: {
                ...commonDraft,
                planId: existingPlanId,
                expectedRevision: editor.revision,
                expectedStructureHash: editor.structureHash,
              },
            }
          : { kind: "create", basePublishedRevision, draft: commonDraft },
      );
      if (result.status === "stale") {
        setProjectionConflict(
          result.reason === "state_revision" || result.reason === "state_unavailable"
            ? "Athlete state changed while saving. Your draft was preserved and re-simulated against the refreshed baseline."
            : "The persisted plan changed while saving. Your draft was preserved; review the refreshed plan and retry.",
        );
        await Promise.all([publishedStateQuery.refetch(), editPlanQuery.refetch()]);
        return;
      }
      setPersistedPlanId(result.planId);
      const savedPlan = { id: result.planId };
      if (mode === "edit") onUpdated?.(savedPlan);
      else onCreated?.(savedPlan);
    } catch (error) {
      setProjectionConflict(
        error instanceof Error ? error.message : "Could not save and validate this plan.",
      );
    }
  }, [
    commitPlanMutation,
    editPlanQuery,
    mode,
    onCreated,
    onUpdated,
    persistedPlanId,
    planId,
    previewLifecycle.status,
    publishedStateQuery,
    state,
  ]);

  const savePlan = useMemo(() => {
    const canSave = previewLifecycle.status === "backend_preview_ready";
    const readiness = canSave
      ? {
          detail:
            mode === "edit"
              ? "The authoritative preview is ready to save."
              : "The authoritative preview is ready to create.",
          label: mode === "edit" ? "Ready to save" : "Ready to create",
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
      label: mode === "edit" ? "Save" : "Create",
      canSave,
      blockers: canSave ? [] : [{ message: readiness.detail }],
      degradedReason: null,
      isPending: commitPlanMutation.isPending,
      previewLifecycle,
      readiness: {
        ...readiness,
        detail: `Save readiness: ${readiness.detail}`,
      },
      route: "canonical" as const,
      execute: persistAndValidatePlan,
    };
  }, [commitPlanMutation.isPending, mode, persistAndValidatePlan, previewLifecycle]);
  const summary = useMemo(() => selectBuilderSummary(state), [state]);
  const builderPresentation = useMemo(() => deriveBuilderPlanPresentation(state), [state]);
  const athleteContextFields = useMemo(
    () => selectAthletePlanningContextFields(state.athleteContext),
    [state.athleteContext],
  );
  const planningConstraintFields = useMemo(
    () => selectTrainingPlanPreferenceFields(state.planPreferences),
    [state.planPreferences],
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
        planningConstraintFields,
        planPreferences: state.planPreferences,
      },
    }),
    [builderPresentation, planningConstraintFields, projection, state],
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
    [mapProfileGoalToSelectedBlueprint, state],
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
      planningConstraintFields,
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
