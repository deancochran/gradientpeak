import {
  type GoalTargetFormData,
  SinglePageForm,
  type TrainingPlanConfigConflict,
  type TrainingPlanConfigFormData,
  type TrainingPlanFormData,
} from "../../../components/training-plan/create/SinglePageForm";
import { featureFlags } from "../../../lib/constants/features";
import { ROUTES } from "../../../lib/constants/routes";
import { useReliableMutation } from "../../../lib/hooks/useReliableMutation";
import {
  buildMinimalTrainingPlanPayload,
  toCreationNormalizationInput,
} from "../../../lib/training-plan-form/adapters";
import {
  getTopBlockingIssues,
  validateTrainingPlanForm,
} from "../../../lib/training-plan-form/validation";
import {
  nextPendingPreviewCount,
  shouldIgnorePreviewResponse,
} from "../../../lib/training-plan-form/previewRequestState";
import { trpc } from "../../../lib/trpc";
import { Text } from "../../../components/ui/text";
import {
  buildPreviewMinimalPlanFromForm,
  projectionControlV2Schema,
  reducePreviewState,
  trainingPlanCalibrationConfigSchema,
} from "@repo/core";
import type {
  CreationAvailabilityConfig,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  PreviewReadinessSnapshot,
  CreationValueSource,
  PreviewState,
  ProjectionChartPayload,
  ReadinessDeltaDiagnostics,
} from "@repo/core";
import { Stack, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";

const HIGH_IMPACT_RECOMPUTE_DELAY_MS = 500;
const PREVIEW_REFRESH_DELAY_MS = 350;

const weekDays: CreationAvailabilityConfig["days"][number]["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const createLocalId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultTarget = (): GoalTargetFormData => ({
  id: createLocalId(),
  targetType: "race_performance",
  activityCategory: "run",
});

const createDefaultGoal = (targetDate: string) => ({
  id: createLocalId(),
  name: "",
  targetDate,
  priority: 1,
  targets: [createDefaultTarget()],
});

const areJsonStructurallyEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left) === JSON.stringify(right);
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createDefaultAvailability = (): CreationAvailabilityConfig => ({
  template: "custom",
  days: weekDays.map((day) => ({
    day,
    windows:
      day === "wednesday" ||
      day === "friday" ||
      day === "saturday" ||
      day === "sunday"
        ? [{ start_minute_of_day: 360, end_minute_of_day: 450 }]
        : [],
    max_sessions:
      day === "wednesday" ||
      day === "friday" ||
      day === "saturday" ||
      day === "sunday"
        ? 1
        : 0,
  })),
});

const createProvenance = (
  source: CreationValueSource,
  rationale: string[] = [],
): CreationProvenance => ({
  source,
  confidence: source === "user" ? null : 0,
  rationale,
  references: [],
  updated_at: new Date().toISOString(),
});

const createDefaultConfigState = (): TrainingPlanConfigFormData => ({
  availabilityConfig: createDefaultAvailability(),
  availabilityProvenance: createProvenance("default", ["initial_default"]),
  recentInfluenceScore: 0,
  recentInfluenceAction: "disabled",
  recentInfluenceProvenance: createProvenance("default", ["initial_default"]),
  constraints: {
    hard_rest_days: ["monday", "tuesday", "thursday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "balanced",
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  maxWeeklyTssRampPct: 7,
  maxCtlRampPerWeek: 3,
  startingCtlAssumption: undefined,
  startingFatigueState: undefined,
  projectionControlV2: projectionControlV2Schema.parse({}),
  calibration: trainingPlanCalibrationConfigSchema.parse({}),
  calibrationCompositeLocks: {
    target_attainment_weight: false,
    envelope_weight: false,
    durability_weight: false,
    evidence_weight: false,
  },
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    recent_influence: { locked: false },
    hard_rest_days: { locked: false },
    min_sessions_per_week: { locked: false },
    max_sessions_per_week: { locked: false },
    max_single_session_duration_minutes: { locked: false },
    goal_difficulty_preference: { locked: false },
    optimization_profile: { locked: false },
    post_goal_recovery_days: { locked: false },
    max_weekly_tss_ramp_pct: { locked: false },
    max_ctl_ramp_per_week: { locked: false },
  },
});

const mergeSuggestedProjectionControls = (
  current: TrainingPlanConfigFormData["projectionControlV2"],
  suggested: TrainingPlanConfigFormData["projectionControlV2"] | undefined,
) => {
  if (!suggested) {
    return current;
  }

  return projectionControlV2Schema.parse({
    mode: current.user_owned.mode ? current.mode : suggested.mode,
    ambition: current.user_owned.ambition
      ? current.ambition
      : suggested.ambition,
    risk_tolerance: current.user_owned.risk_tolerance
      ? current.risk_tolerance
      : suggested.risk_tolerance,
    curvature: current.user_owned.curvature
      ? current.curvature
      : suggested.curvature,
    curvature_strength: current.user_owned.curvature_strength
      ? current.curvature_strength
      : suggested.curvature_strength,
    user_owned: { ...current.user_owned },
  });
};

export default function CreateTrainingPlan() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const defaultTargetDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 112);
    return date.toISOString().split("T")[0]!;
  }, []);

  const [formData, setFormData] = useState<TrainingPlanFormData>({
    planStartDate: undefined,
    goals: [createDefaultGoal(defaultTargetDate)],
  });
  const [configData, setConfigData] = useState<TrainingPlanConfigFormData>(
    createDefaultConfigState,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewPending, setIsPreviewPending] = useState(false);
  const [hasSeededDefaults, setHasSeededDefaults] = useState(false);
  const [dirtyState, setDirtyState] = useState({
    availability: false,
    recent: false,
    constraints: false,
  });
  const [contextSummary, setContextSummary] = useState<
    CreationContextSummary | undefined
  >(undefined);
  const [feasibilitySummary, setFeasibilitySummary] = useState<
    CreationFeasibilitySafetySummary | undefined
  >(undefined);
  const [conflictItems, setConflictItems] = useState<
    TrainingPlanConfigConflict[]
  >([]);
  const [previewSnapshotToken, setPreviewSnapshotToken] = useState<
    string | undefined
  >(undefined);
  const [previewState, setPreviewState] = useState<
    PreviewState<ProjectionChartPayload>
  >({});
  const [readinessDeltaDiagnostics, setReadinessDeltaDiagnostics] = useState<
    ReadinessDeltaDiagnostics | undefined
  >(undefined);
  const [previewBaselineSnapshot, setPreviewBaselineSnapshot] =
    useState<PreviewReadinessSnapshot | null>(null);
  const [informationalConflicts, setInformationalConflicts] = useState<
    string[]
  >([]);
  const [recomputeNonce, setRecomputeNonce] = useState(0);
  const lastHandledRecomputeNonceRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const latestAppliedPreviewRequestIdRef = useRef(0);
  const previewPendingRequestCountRef = useRef(0);
  const previewBaselineSnapshotRef = useRef<PreviewReadinessSnapshot | null>(
    null,
  );
  const scheduledPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activePreviewCancellationRef = useRef<(() => void) | null>(null);
  const initializedFormDefaultsRef = useRef<TrainingPlanFormData | null>(null);
  const initializedConfigDefaultsRef =
    useRef<TrainingPlanConfigFormData | null>(null);

  const blockingIssues = useMemo(
    () =>
      getTopBlockingIssues({
        conflictItems,
        feasibilitySafetySummary: feasibilitySummary,
      }),
    [conflictItems, feasibilitySummary],
  );
  const canCreatePlan = !isCreating;

  const suggestionsQuery = trpc.trainingPlans.getCreationSuggestions.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      enabled: featureFlags.trainingPlanCreateConfigMvp,
    },
  );
  const previewCreationConfigQuery =
    utils.client.trainingPlans.previewCreationConfig.query;
  const getCreationSuggestionsQuery =
    utils.client.trainingPlans.getCreationSuggestions.query;
  type CreationSuggestionsResponse = Awaited<
    ReturnType<typeof getCreationSuggestionsQuery>
  >;

  const createPlanLegacyMutation = useReliableMutation(
    trpc.trainingPlans.createFromMinimalGoal,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        const errorMessage = error.message || "Failed to create training plan.";
        Alert.alert("Error", errorMessage, [{ text: "OK" }]);
        setIsCreating(false);
      },
    },
  );

  const createPlanMutation = useReliableMutation(
    trpc.trainingPlans.createFromCreationConfig,
    {
      invalidate: [utils.trainingPlans],
      onError: (error) => {
        const errorMessage =
          error.message || "Failed to create training plan from config.";
        Alert.alert("Error", errorMessage, [{ text: "OK" }]);
        setIsCreating(false);
      },
    },
  );

  const buildMinimalPayload = useCallback(
    () =>
      buildMinimalTrainingPlanPayload({
        planStartDate: formData.planStartDate,
        goals: formData.goals,
      }),
    [formData.goals, formData.planStartDate],
  );

  const buildCreationInput = toCreationNormalizationInput;

  const resolveStartingAtlOverride = (
    config: TrainingPlanConfigFormData,
  ): number | undefined => {
    if (typeof config.startingCtlAssumption !== "number") {
      return undefined;
    }

    const offset =
      config.startingFatigueState === "fresh"
        ? -6
        : config.startingFatigueState === "fatigued"
          ? 8
          : 0;
    return Number(
      Math.max(0, Math.min(200, config.startingCtlAssumption + offset)).toFixed(
        1,
      ),
    );
  };

  const mergeSuggestionsIntoConfig = useCallback(
    (
      current: TrainingPlanConfigFormData,
      suggestionResponse: CreationSuggestionsResponse,
      mode: "seed" | "recompute",
    ): TrainingPlanConfigFormData => {
      const suggestions = suggestionResponse.suggestions;
      const next = { ...current };

      const canApplyAvailability =
        mode === "seed" ||
        (!dirtyState.availability && !current.locks.availability_config.locked);
      if (canApplyAvailability) {
        next.availabilityConfig = suggestions.availability_config;
        next.availabilityProvenance = suggestions.availability_provenance;
      }

      const canApplyRecent =
        mode === "seed" ||
        (!dirtyState.recent && !current.locks.recent_influence.locked);
      if (canApplyRecent) {
        next.recentInfluenceScore =
          suggestions.recent_influence.influence_score;
        next.recentInfluenceAction = suggestions.recent_influence_action;
        next.recentInfluenceProvenance =
          suggestions.recent_influence_provenance;
      }

      const canApplyConstraints = mode === "seed" || !dirtyState.constraints;
      if (canApplyConstraints) {
        next.constraints = suggestions.constraints;
        next.constraintsSource = "suggested";
      }

      const canApplyMaxWeeklyTssRamp =
        mode === "seed" || !current.locks.max_weekly_tss_ramp_pct.locked;
      if (canApplyMaxWeeklyTssRamp) {
        next.maxWeeklyTssRampPct = suggestions.max_weekly_tss_ramp_pct;
      }

      const canApplyMaxCtlRamp =
        mode === "seed" || !current.locks.max_ctl_ramp_per_week.locked;
      if (canApplyMaxCtlRamp) {
        next.maxCtlRampPerWeek = suggestions.max_ctl_ramp_per_week;
      }

      next.projectionControlV2 = mergeSuggestedProjectionControls(
        current.projectionControlV2,
        (
          suggestions as {
            projection_control_v2?: TrainingPlanConfigFormData["projectionControlV2"];
          }
        ).projection_control_v2,
      );

      setInformationalConflicts(suggestions.locked_conflicts ?? []);
      setContextSummary(suggestionResponse.context_summary);

      return next;
    },
    [dirtyState],
  );

  const refreshPreview = useCallback(async () => {
    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    const previewMinimalPlan = buildPreviewMinimalPlanFromForm(formData);
    if (!previewMinimalPlan) {
      previewBaselineSnapshotRef.current = null;
      setPreviewBaselineSnapshot(null);
      setReadinessDeltaDiagnostics(undefined);
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "failure",
          errorMessage: "",
        }),
      );
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    if (activePreviewCancellationRef.current) {
      activePreviewCancellationRef.current();
    }

    let cancelled = false;
    activePreviewCancellationRef.current = () => {
      cancelled = true;
    };

    previewPendingRequestCountRef.current = nextPendingPreviewCount({
      pendingCount: previewPendingRequestCountRef.current,
      delta: 1,
    });
    setIsPreviewPending(true);

    try {
      const preview = await previewCreationConfigQuery({
        minimal_plan: previewMinimalPlan,
        creation_input: buildCreationInput(configData),
        starting_ctl_override: configData.startingCtlAssumption,
        starting_atl_override: resolveStartingAtlOverride(configData),
        preview_baseline: previewBaselineSnapshotRef.current ?? undefined,
        post_create_behavior: {
          autonomous_mutation_enabled: false,
        },
      });

      if (
        shouldIgnorePreviewResponse({
          requestId,
          latestAppliedRequestId: latestAppliedPreviewRequestIdRef.current,
          cancelled,
        })
      ) {
        return;
      }
      latestAppliedPreviewRequestIdRef.current = requestId;

      setContextSummary(preview.creation_context_summary);
      setFeasibilitySummary(preview.feasibility_safety);
      setPreviewSnapshotToken(preview.preview_snapshot?.token);
      setReadinessDeltaDiagnostics(preview.readiness_delta_diagnostics);
      previewBaselineSnapshotRef.current =
        preview.preview_snapshot_baseline ?? null;
      setPreviewBaselineSnapshot(preview.preview_snapshot_baseline ?? null);
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "success",
          projectionChart: preview.projection_chart as ProjectionChartPayload,
        }),
      );

      const previewStartingState =
        preview.projection_chart.constraint_summary.starting_state;
      if (previewStartingState) {
        setConfigData((previous) => {
          const nextCtl =
            previous.startingCtlAssumption ??
            Number(previewStartingState.starting_ctl.toFixed(1));
          const nextFatigueState =
            previous.startingFatigueState ??
            (previewStartingState.starting_tsb > 5
              ? "fresh"
              : previewStartingState.starting_tsb < -5
                ? "fatigued"
                : "normal");

          if (
            previous.startingCtlAssumption === nextCtl &&
            previous.startingFatigueState === nextFatigueState
          ) {
            return previous;
          }

          return {
            ...previous,
            startingCtlAssumption: nextCtl,
            startingFatigueState: nextFatigueState,
          };
        });
      }

      const nextConflicts: TrainingPlanConfigConflict[] =
        preview.conflicts.items.map((conflict) => ({
          code: conflict.code,
          severity: conflict.severity,
          message: conflict.message,
          suggestions: conflict.suggestions,
        }));
      setConflictItems(nextConflicts);

      return;
    } catch {
      if (
        shouldIgnorePreviewResponse({
          requestId,
          latestAppliedRequestId: latestAppliedPreviewRequestIdRef.current,
          cancelled,
        })
      ) {
        return;
      }

      setPreviewSnapshotToken(undefined);
      setReadinessDeltaDiagnostics(undefined);
      previewBaselineSnapshotRef.current = null;
      setPreviewBaselineSnapshot(null);
      setPreviewState((previous) =>
        reducePreviewState(previous, {
          status: "failure",
          errorMessage:
            "Could not compute feasibility and safety preview. Check goal details and try again.",
        }),
      );
      return;
    } finally {
      previewPendingRequestCountRef.current = nextPendingPreviewCount({
        pendingCount: previewPendingRequestCountRef.current,
        delta: -1,
      });
      setIsPreviewPending(previewPendingRequestCountRef.current > 0);
    }
  }, [buildCreationInput, configData, formData, previewCreationConfigQuery]);

  useEffect(() => {
    if (!featureFlags.trainingPlanCreateConfigMvp || hasSeededDefaults) {
      return;
    }

    if (suggestionsQuery.data) {
      setConfigData((previous) =>
        mergeSuggestionsIntoConfig(previous, suggestionsQuery.data, "seed"),
      );
      setHasSeededDefaults(true);
      return;
    }

    if (!suggestionsQuery.isLoading && !suggestionsQuery.isFetching) {
      setHasSeededDefaults(true);
    }
  }, [
    hasSeededDefaults,
    mergeSuggestionsIntoConfig,
    suggestionsQuery.data,
    suggestionsQuery.isFetching,
    suggestionsQuery.isLoading,
  ]);

  useEffect(() => {
    if (!hasSeededDefaults || recomputeNonce === 0) {
      return;
    }

    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    if (lastHandledRecomputeNonceRef.current === recomputeNonce) {
      return;
    }
    lastHandledRecomputeNonceRef.current = recomputeNonce;

    const timer = setTimeout(async () => {
      try {
        const suggestions = await getCreationSuggestionsQuery({
          locks: configData.locks,
          existing_values: {
            availability_config: configData.availabilityConfig,
            recent_influence: {
              influence_score: configData.recentInfluenceScore,
            },
            projection_control_v2: configData.projectionControlV2,
            max_weekly_tss_ramp_pct: configData.maxWeeklyTssRampPct,
            max_ctl_ramp_per_week: configData.maxCtlRampPerWeek,
            constraints: configData.constraints,
          },
        });

        setConfigData((previous) =>
          mergeSuggestionsIntoConfig(previous, suggestions, "recompute"),
        );
      } catch {
        // Keep user-edited values intact if recompute fails.
      }
    }, HIGH_IMPACT_RECOMPUTE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    configData.availabilityConfig,
    configData.constraints,
    configData.locks,
    configData.recentInfluenceScore,
    configData.recentInfluenceAction,
    hasSeededDefaults,
    mergeSuggestionsIntoConfig,
    recomputeNonce,
    getCreationSuggestionsQuery,
  ]);

  useEffect(() => {
    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    if (!hasSeededDefaults) {
      return;
    }

    if (scheduledPreviewTimerRef.current) {
      clearTimeout(scheduledPreviewTimerRef.current);
    }

    scheduledPreviewTimerRef.current = setTimeout(() => {
      void refreshPreview();
    }, PREVIEW_REFRESH_DELAY_MS);

    return () => {
      if (scheduledPreviewTimerRef.current) {
        clearTimeout(scheduledPreviewTimerRef.current);
        scheduledPreviewTimerRef.current = null;
      }
    };
  }, [configData, hasSeededDefaults, refreshPreview]);

  useEffect(() => {
    return () => {
      if (scheduledPreviewTimerRef.current) {
        clearTimeout(scheduledPreviewTimerRef.current);
      }
      if (activePreviewCancellationRef.current) {
        activePreviewCancellationRef.current();
      }
    };
  }, []);

  const handleFormDataChange = (nextData: TrainingPlanFormData) => {
    setPreviewSnapshotToken(undefined);
    setFormData(nextData);
    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  };

  const handleConfigChange = (nextData: TrainingPlanConfigFormData) => {
    const suggestionRelevantChanged =
      configData.recentInfluenceScore !== nextData.recentInfluenceScore ||
      configData.recentInfluenceAction !== nextData.recentInfluenceAction ||
      !areJsonStructurallyEqual(
        configData.availabilityConfig,
        nextData.availabilityConfig,
      ) ||
      !areJsonStructurallyEqual(configData.constraints, nextData.constraints) ||
      !areJsonStructurallyEqual(
        configData.projectionControlV2,
        nextData.projectionControlV2,
      ) ||
      !areJsonStructurallyEqual(configData.locks, nextData.locks);

    if (suggestionRelevantChanged) {
      setPreviewSnapshotToken(undefined);
      setRecomputeNonce((value) => value + 1);
    }

    setDirtyState((previous) => ({
      availability:
        previous.availability ||
        nextData.availabilityProvenance.source === "user",
      recent:
        previous.recent ||
        nextData.recentInfluenceAction !== "accepted" ||
        nextData.recentInfluenceProvenance.source === "user",
      constraints:
        previous.constraints || nextData.constraintsSource === "user",
    }));

    setConfigData(nextData);
  };

  useEffect(() => {
    if (!hasSeededDefaults) {
      return;
    }

    if (initializedFormDefaultsRef.current === null) {
      initializedFormDefaultsRef.current = cloneJson(formData);
    }

    if (initializedConfigDefaultsRef.current === null) {
      initializedConfigDefaultsRef.current = cloneJson(configData);
    }
  }, [configData, formData, hasSeededDefaults]);

  const handleResetGoals = useCallback(() => {
    const baseline = initializedFormDefaultsRef.current;
    if (!baseline) {
      return;
    }

    setPreviewSnapshotToken(undefined);
    setFormData((previous) => ({
      ...previous,
      goals: cloneJson(baseline.goals),
    }));
    setErrors((previous) => ({
      ...previous,
      goals: "",
    }));
  }, []);

  const handleResetAvailability = useCallback(() => {
    const baselineForm = initializedFormDefaultsRef.current;
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineForm || !baselineConfig) {
      return;
    }

    setPreviewSnapshotToken(undefined);
    setFormData((previous) => ({
      ...previous,
      planStartDate: baselineForm.planStartDate,
    }));

    setConfigData((previous) => ({
      ...previous,
      availabilityConfig: cloneJson(baselineConfig.availabilityConfig),
      availabilityProvenance: cloneJson(baselineConfig.availabilityProvenance),
      locks: {
        ...previous.locks,
        availability_config: cloneJson(
          baselineConfig.locks.availability_config,
        ),
      },
    }));

    setDirtyState((previous) => ({ ...previous, availability: false }));
    setRecomputeNonce((value) => value + 1);
  }, []);

  const handleResetLimits = useCallback(() => {
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineConfig) {
      return;
    }

    setPreviewSnapshotToken(undefined);
    setConfigData((previous) => ({
      ...previous,
      postGoalRecoveryDays: baselineConfig.postGoalRecoveryDays,
      maxWeeklyTssRampPct: baselineConfig.maxWeeklyTssRampPct,
      maxCtlRampPerWeek: baselineConfig.maxCtlRampPerWeek,
      startingCtlAssumption: baselineConfig.startingCtlAssumption,
      startingFatigueState: baselineConfig.startingFatigueState,
      locks: {
        ...previous.locks,
        post_goal_recovery_days: cloneJson(
          baselineConfig.locks.post_goal_recovery_days,
        ),
        max_weekly_tss_ramp_pct: cloneJson(
          baselineConfig.locks.max_weekly_tss_ramp_pct,
        ),
        max_ctl_ramp_per_week: cloneJson(
          baselineConfig.locks.max_ctl_ramp_per_week,
        ),
      },
    }));

    setRecomputeNonce((value) => value + 1);
  }, []);

  const handleResetProjectionAll = useCallback(() => {
    const baselineConfig = initializedConfigDefaultsRef.current;
    if (!baselineConfig) {
      return;
    }

    setPreviewSnapshotToken(undefined);
    setConfigData((previous) => ({
      ...previous,
      projectionControlV2: {
        ...cloneJson(baselineConfig.projectionControlV2),
        user_owned: {
          mode: false,
          ambition: false,
          risk_tolerance: false,
          curvature: false,
          curvature_strength: false,
        },
      },
      calibration: cloneJson(baselineConfig.calibration),
      calibrationCompositeLocks: cloneJson(
        baselineConfig.calibrationCompositeLocks,
      ),
    }));

    setRecomputeNonce((value) => value + 1);
  }, []);

  const validateForm = (): boolean => {
    const nextErrors = validateTrainingPlanForm(formData);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!canCreatePlan) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsCreating(true);

    try {
      if (!featureFlags.trainingPlanCreateConfigMvp) {
        const createdPlan = await createPlanLegacyMutation.mutateAsync(
          buildMinimalPayload(),
        );
        router.replace({
          pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
          params: { id: createdPlan.id, nextStep: "refine" },
        });
        return;
      }

      const createdPlan = await createPlanMutation.mutateAsync({
        minimal_plan: buildMinimalPayload(),
        creation_input: buildCreationInput(configData),
        starting_ctl_override: configData.startingCtlAssumption,
        starting_atl_override: resolveStartingAtlOverride(configData),
        preview_snapshot_token: isPreviewPending
          ? undefined
          : previewSnapshotToken,
        post_create_behavior: {
          autonomous_mutation_enabled: false,
        },
        is_active: true,
      });

      router.replace({
        pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
        params: { id: createdPlan.id, nextStep: "refine" },
      });
    } catch (error) {
      console.error(
        "Failed to create training plan from creation config:",
        error,
      );
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create training plan from creation config.";
      Alert.alert("Error", message, [{ text: "OK" }]);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Create Training Plan",
          headerShown: true,
          headerRight: () => (
            <Pressable
              onPress={handleCreate}
              disabled={!canCreatePlan}
              hitSlop={8}
              className={canCreatePlan ? "opacity-100" : "opacity-50"}
              accessibilityRole="button"
              accessibilityLabel={
                isCreating ? "Creating training plan" : "Create training plan"
              }
              accessibilityHint={"Saves your plan and opens it"}
              accessibilityState={{
                disabled: !canCreatePlan,
                busy: isCreating,
              }}
            >
              <Text className="font-semibold text-primary">
                {isCreating ? "Saving..." : "Create"}
              </Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {previewState.previewError ? (
          <View className="px-4 pt-3">
            <Text className="text-xs text-destructive">
              {previewState.previewError}
            </Text>
          </View>
        ) : null}
        <SinglePageForm
          formData={formData}
          onFormDataChange={handleFormDataChange}
          onResetGoals={handleResetGoals}
          showCreationConfig={featureFlags.trainingPlanCreateConfigMvp}
          configData={configData}
          projectionChart={previewState.projectionChart}
          readinessDeltaDiagnostics={readinessDeltaDiagnostics}
          onConfigChange={handleConfigChange}
          onResetAvailability={handleResetAvailability}
          onResetLimits={handleResetLimits}
          onResetProjectionAll={handleResetProjectionAll}
          contextSummary={contextSummary}
          feasibilitySafetySummary={feasibilitySummary}
          informationalConflicts={informationalConflicts}
          blockingIssues={blockingIssues}
          isPreviewPending={
            isPreviewPending ||
            suggestionsQuery.isLoading ||
            suggestionsQuery.isFetching
          }
          errors={errors}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
