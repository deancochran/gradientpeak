import {
  type AthletePlanningContext,
  deriveDraftPlanProjection,
  diffDateOnlyUtcDays,
} from "@repo/core";
import { skipToken } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { deriveActivityPlanPickerState } from "./activity-plan-picker";
import { normalizeBackendPlanningPreview } from "./backend-planning-client";
import { createTrainingPlanBuilderActions } from "./builder-actions";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { subscribeToTrainingPlanGoalCreation } from "./goalCreationHandoff";
import {
  createTrainingPlanBuilderStateFromExistingPlan,
  getTrainingPlanStructureActivityPlanIds,
  toTrainingPlanCreatePayload,
  toTrainingPlanStructure,
} from "./mappers";
import {
  deriveTrainingPlanCreationSession,
  deriveTrainingPlanReadinessPresentation,
} from "./planning-session-engine";
import { trainingPlanBuilderReducer } from "./reducer";
import type {
  TrainingPlanCreationProfileGoalSnapshot,
  UseTrainingPlanCreationServiceOptions,
} from "./service-types";

export type {
  TrainingPlanCreationProfileGoalSnapshot,
  UseTrainingPlanCreationServiceOptions,
} from "./service-types";

import { deriveTrainingPlanLocalProjection } from "./local-projection";
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
      swimmingCssSecondsPer100m: keepOverride(
        current.physiology.swimmingCssSecondsPer100m,
        incoming.physiology.swimmingCssSecondsPer100m,
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
  const draftProjectionPlanId = useRef("00000000-0000-4000-8000-000000000001").current;
  const projectionPlanId = planId ?? persistedPlanId;
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

  const activityPlansById = useMemo(() => {
    const entries = [
      ...(activityPlansQuery.data?.pages.flatMap((page) => page.items) ?? []),
      ...(linkedActivityPlansQuery.data?.items ?? []),
    ].map((activityPlan) => [activityPlan.id, activityPlan] as const);
    return Object.fromEntries(entries);
  }, [activityPlansQuery.data?.pages, linkedActivityPlansQuery.data?.items]);
  const publishedProjection = useMemo(() => {
    if (publishedStateQuery.isLoading || profileQuery.isLoading)
      return { status: "loading" as const };
    if (publishedStateQuery.isError || profileQuery.isError) return { status: "error" as const };
    const baseline = publishedStateQuery.data?.currentBaseline?.baseline;
    if (!baseline) return { status: "unavailable" as const };
    let structure: ReturnType<typeof toTrainingPlanStructure>;
    try {
      structure = toTrainingPlanStructure(state);
    } catch {
      return { status: "unavailable" as const };
    }
    const activityPlans = state.structure.sessions.flatMap((session) => {
      const plan = session.activityPlan;
      const load = plan?.prescriptionQuantification?.summary.commonLoad;
      const category = plan?.prescriptionQuantification?.members[0]?.activity_category;
      return plan && load && load.status !== "unavailable" && load.load !== null && category
        ? [{ activityPlanId: plan.id, activityCategory: category, commonLoad: load.load }]
        : [];
    });
    const planningTimezone =
      creationContextQuery.data?.currentBaseline?.planningTimezone ??
      profileQuery.data?.planning_timezone ??
      "UTC";
    const result = deriveDraftPlanProjection({
      baseline,
      planId: projectionPlanId ?? draftProjectionPlanId,
      structure,
      activityPlans,
      planningTimezone,
      startDate: state.scheduling.startDate,
    });
    if (result.status === "unavailable")
      return { status: "unavailable" as const, reason: result.reason };
    return {
      status:
        publishedStateQuery.data?.status?.freshness === "stale"
          ? ("stale" as const)
          : ("available" as const),
      importStatus: publishedStateQuery.data?.status?.importStatus ?? "complete",
      simulation: result.simulation,
    };
  }, [
    draftProjectionPlanId,
    profileQuery.data?.planning_timezone,
    profileQuery.isError,
    profileQuery.isLoading,
    creationContextQuery.data?.currentBaseline?.planningTimezone,
    publishedStateQuery.data?.currentBaseline?.baseline,
    publishedStateQuery.data?.status?.freshness,
    publishedStateQuery.data?.status?.importStatus,
    publishedStateQuery.isError,
    publishedStateQuery.isLoading,
    projectionPlanId,
    state,
  ]);
  const localProjection = useMemo(
    () => deriveTrainingPlanLocalProjection(state, activityPlansById),
    [activityPlansById, state],
  );
  const { structureProposal } = localProjection;
  const authoritativePreviewInput = useMemo(() => {
    try {
      const payload = toTrainingPlanCreatePayload(state);
      const commonDraft = {
        name: payload.name,
        description: payload.description ?? null,
        contentVisibility: payload.content_visibility,
        structure: toTrainingPlanStructure(state),
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
  const planningSession = useMemo(
    () =>
      deriveTrainingPlanCreationSession({
        authoritativeProjection,
        authoritativePreviewInputAvailable: authoritativePreviewInput !== null,
        authoritativePreviewReason:
          authoritativePreviewInput === null
            ? "Published athlete state and a valid draft are required for authoritative preview."
            : "Authoritative projection preview is available.",
        backendPreviewInputEnabled: backendPreviewInput !== null,
        isBackendPlanningInputStale,
        localProjection,
        previewQuery: {
          error: backendPlanningPreviewQuery.error,
          isFetching: backendPlanningPreviewQuery.isFetching,
          isLoading: backendPlanningPreviewQuery.isLoading,
        },
      }),
    [
      authoritativeProjection,
      authoritativePreviewInput,
      backendPreviewInput,
      backendPlanningPreviewQuery.error,
      backendPlanningPreviewQuery.isFetching,
      backendPlanningPreviewQuery.isLoading,
      isBackendPlanningInputStale,
      localProjection,
    ],
  );
  const { previewLifecycle, projection, saveLifecycle } = planningSession;
  const activeSaveLifecycle = mode === "edit" ? saveLifecycle.update : saveLifecycle.create;
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
    const existingPlanId = planId ?? persistedPlanId;
    const basePublishedRevision = publishedStateQuery.data?.publishedRevision;
    if (basePublishedRevision === null || basePublishedRevision === undefined) {
      setProjectionConflict("Published athlete state is unavailable. Refresh and retry.");
      return;
    }
    try {
      const payload = toTrainingPlanCreatePayload(state);
      const commonDraft = {
        name: payload.name,
        description: payload.description ?? null,
        contentVisibility: payload.content_visibility,
        structure: toTrainingPlanStructure(state),
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
    publishedStateQuery,
    state,
  ]);

  const savePlan = useMemo(() => {
    const readiness = deriveTrainingPlanReadinessPresentation({
      canSave:
        localProjection.saveReadiness.canSave &&
        (publishedProjection.status === "available" || publishedProjection.status === "stale"),
      localBlockerCount: localProjection.saveReadiness.blockers.length,
      mode,
      previewLifecycle,
      saveLifecycle: activeSaveLifecycle,
    });
    return {
      mode,
      label: mode === "edit" ? "Save" : "Create",
      canSave:
        localProjection.saveReadiness.canSave &&
        (publishedProjection.status === "available" || publishedProjection.status === "stale"),
      blockers: localProjection.saveReadiness.blockers,
      degradedReason: null,
      isPending: commitPlanMutation.isPending,
      previewLifecycle,
      readiness: {
        ...readiness,
        detail: `Save readiness: ${readiness.detail}`,
      },
      route: "canonical" as const,
      saveLifecycle: activeSaveLifecycle,
      execute: persistAndValidatePlan,
    };
  }, [
    activeSaveLifecycle,
    commitPlanMutation.isPending,
    localProjection.saveReadiness.blockers,
    localProjection.saveReadiness.canSave,
    mode,
    persistAndValidatePlan,
    previewLifecycle,
    publishedProjection.status,
  ]);
  const viewModel = useMemo(
    () => ({
      strategy: {
        state,
        viewModel: localProjection.builderViewModel,
        projection,
        canUseStructureProposal: localProjection.canUseStructureProposal,
        structureProposal: localProjection.structureProposal,
      },
      schedule: {
        state,
        viewModel: localProjection.builderViewModel,
        schedulingPreview: localProjection.schedulingPreview,
        projection,
      },
      sheets: {
        planningConstraintFields: localProjection.planningConstraintFields,
        planPreferences: state.planPreferences,
      },
    }),
    [
      localProjection.builderViewModel,
      localProjection.canUseStructureProposal,
      localProjection.planningConstraintFields,
      localProjection.schedulingPreview,
      localProjection.structureProposal,
      projection,
      state,
    ],
  );

  const actions = useMemo(
    () =>
      createTrainingPlanBuilderActions({
        dispatch,
        state,
        createLocalId,
        createSession,
        structureProposalSessions: structureProposal.sessions,
        toSelectedGoalBlueprint: mapProfileGoalToSelectedBlueprint,
      }),
    [mapProfileGoalToSelectedBlueprint, state, structureProposal.sessions],
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
      ...localProjection,
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
      publishedProjection,
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
