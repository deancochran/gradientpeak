import { createAthletePlanningContextFromSnapshot, diffDateOnlyUtcDays } from "@repo/core";
import { skipToken } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
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
  toTrainingPlanUpdatePayload,
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
  const hasHydratedAthleteContextRef = useRef(false);
  const hydratedEditPlanIdRef = useRef<string | null>(null);
  const {
    profileQuery,
    profileMetricsQuery,
    activityEffortsQuery,
    currentTrainingStatusQuery,
    profileGoalsQuery,
    activityPlansQuery,
    editPlanQuery,
    linkedActivityPlansQuery,
    createPlanMutation,
    updatePlanMutation,
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
      hasHydratedAthleteContextRef.current ||
      !profileQuery.data ||
      !profileMetricsQuery.data ||
      !activityEffortsQuery.data ||
      currentTrainingStatusQuery.isLoading
    ) {
      return;
    }

    dispatch({
      type: "athleteContext.replace",
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: {
          dob: profileQuery.data.dob,
          gender:
            profileQuery.data.gender === "male" ||
            profileQuery.data.gender === "female" ||
            profileQuery.data.gender === "other"
              ? profileQuery.data.gender
              : null,
          preferred_units: profileQuery.data.preferred_units,
        },
        profileMetrics: profileMetricsQuery.data.items.map((metric) => ({
          metric_type: metric.metric_type,
          value: metric.value,
          unit: metric.unit,
          recorded_at: metric.recorded_at,
          notes: metric.notes,
          reference_activity_id: metric.reference_activity_id,
        })),
        activityEfforts: activityEffortsQuery.data.map((effort) => ({
          activity_category: effort.activity_category,
          effort_type: effort.effort_type,
          duration_seconds: effort.duration_seconds,
          value: effort.value,
          unit: effort.unit,
          recorded_at: effort.recorded_at,
          activity_id: effort.activity_id,
        })),
        currentFitness: currentTrainingStatusQuery.data
          ? {
              ctl: currentTrainingStatusQuery.data.ctl,
              atl: currentTrainingStatusQuery.data.atl,
              tsb: currentTrainingStatusQuery.data.tsb,
              recorded_at: new Date().toISOString(),
            }
          : null,
      }),
    });
    hasHydratedAthleteContextRef.current = true;
  }, [
    activityEffortsQuery.data,
    currentTrainingStatusQuery.data,
    currentTrainingStatusQuery.isLoading,
    isEditMode,
    profileMetricsQuery.data,
    profileQuery.data,
  ]);

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
  const localProjection = useMemo(
    () => deriveTrainingPlanLocalProjection(state, activityPlansById),
    [activityPlansById, state],
  );
  const { structureProposal } = localProjection;
  const debouncedBackendPlanningFingerprint = useDebouncedValue(
    localProjection.backendPlanning.contextFingerprint,
    500,
  );
  const backendPreviewInput =
    debouncedBackendPlanningFingerprint === localProjection.backendPlanning.contextFingerprint
      ? localProjection.backendPlanning.previewInput
      : null;
  const backendPlanningPreviewQuery = api.trainingPlans.previewCreationConfig.useQuery(
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
    debouncedBackendPlanningFingerprint !== localProjection.backendPlanning.contextFingerprint;
  const planningSession = useMemo(
    () =>
      deriveTrainingPlanCreationSession({
        authoritativeProjection,
        backendPreviewInputEnabled: backendPreviewInput !== null,
        isBackendPlanningInputStale,
        localProjection,
        planId,
        previewQuery: {
          error: backendPlanningPreviewQuery.error,
          isFetching: backendPlanningPreviewQuery.isFetching,
          isLoading: backendPlanningPreviewQuery.isLoading,
        },
      }),
    [
      authoritativeProjection,
      backendPreviewInput,
      backendPlanningPreviewQuery.error,
      backendPlanningPreviewQuery.isFetching,
      backendPlanningPreviewQuery.isLoading,
      isBackendPlanningInputStale,
      localProjection,
      planId,
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

  const createPlan = useCallback(async () => {
    await createPlanMutation.mutateAsync(
      toTrainingPlanCreatePayload(state, {
        backendPlanning: {
          projectionSource:
            previewLifecycle.status === "backend_preview_ready" ? "backend" : "local",
          previewSnapshotToken:
            previewLifecycle.status === "backend_preview_ready"
              ? previewLifecycle.snapshotToken
              : null,
        },
      }),
    );
  }, [createPlanMutation, previewLifecycle, state]);

  const updatePlan = useCallback(async () => {
    if (!planId) {
      throw new Error("Missing training plan id for update.");
    }
    await updatePlanMutation.mutateAsync(
      toTrainingPlanUpdatePayload(planId, state, {
        backendPlanning: {
          projectionSource:
            previewLifecycle.status === "backend_preview_ready" ? "backend" : "local",
          previewSnapshotToken:
            previewLifecycle.status === "backend_preview_ready"
              ? previewLifecycle.snapshotToken
              : null,
        },
      }),
    );
  }, [planId, previewLifecycle, state, updatePlanMutation]);

  const savePlan = useMemo(() => {
    const readiness = deriveTrainingPlanReadinessPresentation({
      canSave: localProjection.saveReadiness.canSave,
      localBlockerCount: localProjection.saveReadiness.blockers.length,
      mode,
      previewLifecycle,
      saveLifecycle: activeSaveLifecycle,
    });
    return {
      mode,
      label: mode === "edit" ? "Save" : "Create",
      canSave: localProjection.saveReadiness.canSave,
      blockers: localProjection.saveReadiness.blockers,
      degradedReason: null,
      isPending: createPlanMutation.isPending || updatePlanMutation.isPending,
      previewLifecycle,
      readiness: {
        ...readiness,
        detail: `Save readiness: ${readiness.detail}`,
      },
      route: "canonical" as const,
      saveLifecycle: activeSaveLifecycle,
      execute: mode === "edit" ? updatePlan : createPlan,
    };
  }, [
    activeSaveLifecycle,
    createPlan,
    createPlanMutation.isPending,
    localProjection.saveReadiness.blockers,
    localProjection.saveReadiness.canSave,
    mode,
    previewLifecycle,
    updatePlan,
    updatePlanMutation.isPending,
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
    currentTrainingStatusQuery,
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
      savePlan,
      viewModel,
    },
    queries: {
      profile: profileQuery,
      profileMetrics: profileMetricsQuery,
      activityEfforts: activityEffortsQuery,
      profileGoals: profileGoalsQuery,
      activityPlans: activityPlansQuery,
    },
    actions,
  };
}
