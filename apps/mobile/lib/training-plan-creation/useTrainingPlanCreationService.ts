import { createAthletePlanningContextFromSnapshot, diffDateOnlyUtcDays } from "@repo/core";
import { skipToken } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { deriveActivityPlanPickerState } from "./activity-plan-picker";
import {
  deriveTrainingPathChartFromActiveProjection,
  deriveTrainingPathProjectionStatus,
  mapBackendPlanningCreateCommitInput,
  mapBackendPlanningUpdateCommitInput,
  normalizeBackendPlanningPreview,
  selectActiveTrainingPlanProjection,
} from "./backend-planning-client";
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
  createTrainingPlanProjectionFacade,
  createTrainingPlanSavePlanFacade,
} from "./planning-session";
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

function isActiveProfileGoal(goal: TrainingPlanCreationProfileGoalSnapshot, anchorDate: string) {
  return typeof goal.target_date === "string" && goal.target_date >= anchorDate;
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
  const hasHydratedActiveGoalsRef = useRef(false);
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
    createFromCreationConfigMutation,
    updateFromCreationConfigMutation,
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
    if (
      isEditMode ||
      hasHydratedActiveGoalsRef.current ||
      !profileGoalsQuery.hasProfileId ||
      profileGoalsQuery.isLoading ||
      profileGoalsQuery.isFetching
    ) {
      return;
    }

    const activeGoals = profileGoalsQuery.goals
      .filter((goal) => isActiveProfileGoal(goal, state.anchorDate))
      .map((goal) =>
        toSelectedGoalBlueprint({
          anchorDate: state.anchorDate,
          createLocalId,
          goal,
        }),
      );

    if (activeGoals.length > 0) {
      const existingLocalGoals = state.goalContext.selectedGoals.filter(
        (goal) => !goal.sourceProfileGoalId,
      );
      const existingProfileGoalIds = new Set(
        state.goalContext.selectedGoals.flatMap((goal) =>
          goal.sourceProfileGoalId ? [goal.sourceProfileGoalId] : [],
        ),
      );
      dispatch({
        type: "goalContext.replaceSelectedGoals",
        goals: [
          ...existingLocalGoals,
          ...state.goalContext.selectedGoals.filter((goal) => goal.sourceProfileGoalId),
          ...activeGoals.filter(
            (goal) => !existingProfileGoalIds.has(goal.sourceProfileGoalId ?? ""),
          ),
        ],
      });
    }

    hasHydratedActiveGoalsRef.current = true;
  }, [
    isEditMode,
    profileGoalsQuery.goals,
    profileGoalsQuery.hasProfileId,
    profileGoalsQuery.isFetching,
    profileGoalsQuery.isLoading,
    state.anchorDate,
    state.goalContext.selectedGoals,
  ]);

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
  const estimatedPayloadState = useMemo(() => {
    const estimatedContext = localProjection.planningProjection.estimatedContext;
    return {
      ...state,
      anchorDate: estimatedContext.anchorDate,
      athleteContext: estimatedContext.athleteContext,
      goalContext: { selectedGoals: estimatedContext.goals },
      planPreferences: estimatedContext.preferences,
      scheduling: estimatedContext.scheduling,
      structure: { sessions: estimatedContext.sessions },
    };
  }, [localProjection.planningProjection.estimatedContext, state]);
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
  const activeProjection = useMemo(
    () =>
      selectActiveTrainingPlanProjection({
        backendPreview: authoritativeProjection,
        backendPreviewEnabled: backendPreviewInput !== null,
        isBackendInputStale: isBackendPlanningInputStale,
        localChart: localProjection.builderViewModel.dailyTrainingPathChart,
      }),
    [
      authoritativeProjection,
      backendPreviewInput,
      isBackendPlanningInputStale,
      localProjection.builderViewModel.dailyTrainingPathChart,
    ],
  );
  const backendPlanningCommit = useMemo(
    () => ({
      create: mapBackendPlanningCreateCommitInput({
        previewInput: localProjection.backendPlanning.previewInput,
        previewSnapshotToken: authoritativeProjection?.previewSnapshotToken,
      }),
      update: mapBackendPlanningUpdateCommitInput({
        planId,
        previewInput: localProjection.backendPlanning.previewInput,
        previewSnapshotToken: authoritativeProjection?.previewSnapshotToken,
      }),
    }),
    [
      authoritativeProjection?.previewSnapshotToken,
      localProjection.backendPlanning.previewInput,
      planId,
    ],
  );
  const trainingPathChartProjection = useMemo(
    () =>
      deriveTrainingPathChartFromActiveProjection({
        activeProjection,
        localChart: localProjection.builderViewModel.dailyTrainingPathChart,
      }),
    [activeProjection, localProjection.builderViewModel.dailyTrainingPathChart],
  );
  const trainingPathProjectionStatus = useMemo(
    () =>
      deriveTrainingPathProjectionStatus({
        activeProjection,
        backendInputAvailable: localProjection.backendPlanning.previewInput !== null,
        backendPlanningReason: localProjection.backendPlanning.status.reason,
        backendPreviewEnabled: backendPreviewInput !== null,
        backendPreviewError: backendPlanningPreviewQuery.error,
        backendPreviewLoading:
          backendPlanningPreviewQuery.isLoading || backendPlanningPreviewQuery.isFetching,
        chartSource: trainingPathChartProjection.source,
      }),
    [
      activeProjection,
      backendPreviewInput,
      backendPlanningPreviewQuery.error,
      backendPlanningPreviewQuery.isFetching,
      backendPlanningPreviewQuery.isLoading,
      localProjection.backendPlanning.previewInput,
      localProjection.backendPlanning.status.reason,
      trainingPathChartProjection.source,
    ],
  );
  const builderPlanningSnapshotOptions = useMemo(
    () => ({
      backendPlanning: {
        projectionSource: trainingPathProjectionStatus.source,
        previewSnapshotToken: authoritativeProjection?.previewSnapshotToken ?? null,
      },
    }),
    [authoritativeProjection?.previewSnapshotToken, trainingPathProjectionStatus.source],
  );
  const projection = useMemo(
    () =>
      createTrainingPlanProjectionFacade({
        activeProjection,
        authoritativeProjection,
        inspectorInsight: null,
        trainingPathChartProjection,
        trainingPathProjectionStatus,
      }),
    [
      activeProjection,
      authoritativeProjection,
      trainingPathChartProjection,
      trainingPathProjectionStatus,
    ],
  );
  const savePlanRoute = useMemo(
    () =>
      createTrainingPlanSavePlanFacade({
        createCommit: backendPlanningCommit.create,
        updateCommit: backendPlanningCommit.update,
      }),
    [backendPlanningCommit.create, backendPlanningCommit.update],
  );
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
    if (savePlanRoute.createRoute === "backend") {
      if (!savePlanRoute.createCommit.ok) return;
      await createFromCreationConfigMutation.mutateAsync(savePlanRoute.createCommit.input);
      return;
    }
    await createPlanMutation.mutateAsync(
      toTrainingPlanCreatePayload(estimatedPayloadState, builderPlanningSnapshotOptions),
    );
  }, [
    builderPlanningSnapshotOptions,
    createFromCreationConfigMutation,
    createPlanMutation,
    savePlanRoute.createCommit,
    savePlanRoute.createRoute,
    estimatedPayloadState,
  ]);

  const updatePlan = useCallback(async () => {
    if (!planId) {
      throw new Error("Missing training plan id for update.");
    }
    if (savePlanRoute.updateRoute === "backend") {
      if (!savePlanRoute.updateCommit.ok) return;
      await updateFromCreationConfigMutation.mutateAsync(savePlanRoute.updateCommit.input);
      return;
    }
    await updatePlanMutation.mutateAsync(
      toTrainingPlanUpdatePayload(planId, estimatedPayloadState, builderPlanningSnapshotOptions),
    );
  }, [
    builderPlanningSnapshotOptions,
    planId,
    savePlanRoute.updateCommit,
    savePlanRoute.updateRoute,
    estimatedPayloadState,
    updateFromCreationConfigMutation,
    updatePlanMutation,
  ]);

  const savePlan = useMemo(
    () => ({
      ...savePlanRoute,
      mode,
      label: mode === "edit" ? "Save" : "Create",
      canSave: localProjection.saveReadiness.canSave,
      blockers: localProjection.saveReadiness.blockers,
      isPending:
        createPlanMutation.isPending ||
        updatePlanMutation.isPending ||
        createFromCreationConfigMutation.isPending ||
        updateFromCreationConfigMutation.isPending,
      route: mode === "edit" ? savePlanRoute.updateRoute : savePlanRoute.createRoute,
      execute: mode === "edit" ? updatePlan : createPlan,
    }),
    [
      createFromCreationConfigMutation.isPending,
      createPlan,
      createPlanMutation.isPending,
      localProjection.saveReadiness.blockers,
      localProjection.saveReadiness.canSave,
      mode,
      savePlanRoute,
      updateFromCreationConfigMutation.isPending,
      updatePlan,
      updatePlanMutation.isPending,
    ],
  );
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
