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
  MAX_SAFE_CTL_RAMP_PER_WEEK,
  MAX_SAFE_WEEKLY_TSS_RAMP_PCT,
  MIN_PREP_DAYS_BETWEEN_GOALS,
  getAvailableTrainingDays,
  getCreateDisabledReason,
  getMinimumGoalGapDays,
  getTopBlockingIssues,
  validateTrainingPlanForm,
} from "../../../lib/training-plan-form/validation";
import { trpc } from "../../../lib/trpc";
import { Text } from "../../../components/ui/text";
import {
  buildPreviewMinimalPlanFromForm,
  reducePreviewState,
} from "@repo/core";
import type {
  CreationAvailabilityConfig,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  CreationValueSource,
  PreviewState,
  ProjectionChartPayload,
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

const createDefaultAvailability = (): CreationAvailabilityConfig => ({
  template: "moderate",
  days: weekDays.map((day) => ({
    day,
    windows:
      day === "wednesday" || day === "friday"
        ? []
        : [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
    max_sessions: day === "wednesday" || day === "friday" ? 0 : 1,
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
    hard_rest_days: ["wednesday", "friday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "balanced",
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  maxWeeklyTssRampPct: 7,
  maxCtlRampPerWeek: 3,
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
  const [informationalConflicts, setInformationalConflicts] = useState<
    string[]
  >([]);
  const [recomputeNonce, setRecomputeNonce] = useState(0);
  const lastHandledRecomputeNonceRef = useRef(0);

  const blockingIssues = useMemo(
    () =>
      getTopBlockingIssues({
        conflictItems,
        feasibilitySafetySummary: feasibilitySummary,
      }),
    [conflictItems, feasibilitySummary],
  );
  const createDisabledReason = useMemo(
    () => getCreateDisabledReason(blockingIssues),
    [blockingIssues],
  );
  const canCreatePlan = !isCreating && !createDisabledReason;
  const effectiveCreateDisabledReason = createDisabledReason;

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

      setInformationalConflicts(suggestions.locked_conflicts ?? []);
      setContextSummary(suggestionResponse.context_summary);

      return next;
    },
    [dirtyState],
  );

  const refreshPreview = useCallback(
    async (showBlockingAlert: boolean) => {
      if (!featureFlags.trainingPlanCreateConfigMvp) {
        return { blocked: false };
      }

      const previewMinimalPlan = buildPreviewMinimalPlanFromForm(formData);
      if (!previewMinimalPlan) {
        setPreviewState((previous) =>
          reducePreviewState(previous, {
            status: "failure",
            errorMessage: "",
          }),
        );
        return { blocked: true };
      }

      setIsPreviewPending(true);
      try {
        const preview = await previewCreationConfigQuery({
          minimal_plan: previewMinimalPlan,
          creation_input: buildCreationInput(configData),
          post_create_behavior: {
            autonomous_mutation_enabled: false,
          },
        });

        setContextSummary(preview.creation_context_summary);
        setFeasibilitySummary(preview.feasibility_safety);
        setPreviewSnapshotToken(preview.preview_snapshot?.token);
        setPreviewState((previous) =>
          reducePreviewState(previous, {
            status: "success",
            projectionChart: preview.projection_chart as ProjectionChartPayload,
          }),
        );
        const nextConflicts: TrainingPlanConfigConflict[] =
          preview.conflicts.items.map((conflict) => ({
            code: conflict.code,
            severity: conflict.severity,
            message: conflict.message,
            suggestions: conflict.suggestions,
          }));
        setConflictItems(nextConflicts);

        if (
          showBlockingAlert &&
          (preview.conflicts.is_blocking ||
            preview.feasibility_safety.blockers.length > 0)
        ) {
          Alert.alert(
            "Resolve configuration",
            "Your current settings have blocking conflicts. Apply a quick fix or adjust the advanced fields.",
            [{ text: "OK" }],
          );
          return {
            blocked: true,
            previewSnapshotToken: preview.preview_snapshot?.token,
          };
        }

        return {
          blocked: false,
          previewSnapshotToken: preview.preview_snapshot?.token,
        };
      } catch {
        setPreviewSnapshotToken(undefined);
        setPreviewState((previous) =>
          reducePreviewState(previous, {
            status: "failure",
            errorMessage:
              "Could not compute feasibility and safety preview. Check goal details and try again.",
          }),
        );
        if (showBlockingAlert) {
          Alert.alert(
            "Preview failed",
            "Could not compute feasibility and safety preview. Please check your goal details and try again.",
            [{ text: "OK" }],
          );
        }
        return { blocked: true };
      } finally {
        setIsPreviewPending(false);
      }
    },
    [buildCreationInput, configData, formData, previewCreationConfigQuery],
  );

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
            optimization_profile: configData.optimizationProfile,
            post_goal_recovery_days: configData.postGoalRecoveryDays,
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
    configData.maxCtlRampPerWeek,
    configData.maxWeeklyTssRampPct,
    configData.optimizationProfile,
    configData.postGoalRecoveryDays,
    configData.recentInfluenceScore,
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

    const timer = setTimeout(() => {
      void refreshPreview(false);
    }, PREVIEW_REFRESH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [configData, hasSeededDefaults, refreshPreview]);

  const handleFormDataChange = (nextData: TrainingPlanFormData) => {
    setFormData(nextData);
    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  };

  const handleConfigChange = (nextData: TrainingPlanConfigFormData) => {
    const highImpactChanged =
      configData.optimizationProfile !== nextData.optimizationProfile ||
      configData.postGoalRecoveryDays !== nextData.postGoalRecoveryDays ||
      configData.maxWeeklyTssRampPct !== nextData.maxWeeklyTssRampPct ||
      configData.maxCtlRampPerWeek !== nextData.maxCtlRampPerWeek ||
      !areJsonStructurallyEqual(
        configData.availabilityConfig,
        nextData.availabilityConfig,
      ) ||
      !areJsonStructurallyEqual(configData.constraints, nextData.constraints) ||
      !areJsonStructurallyEqual(configData.locks, nextData.locks);

    if (highImpactChanged) {
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

  const validateForm = (): boolean => {
    const nextErrors = validateTrainingPlanForm(formData);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleResolveConflict = (code: string) => {
    setConfigData((previous) => {
      const next = {
        ...previous,
        constraints: {
          ...previous.constraints,
          hard_rest_days: [...previous.constraints.hard_rest_days],
        },
      };

      const availableDays = getAvailableTrainingDays(previous);

      switch (code) {
        case "min_sessions_exceeds_max":
          next.constraints.max_sessions_per_week = Math.max(
            next.constraints.max_sessions_per_week ?? 0,
            next.constraints.min_sessions_per_week ?? 0,
          );
          next.constraintsSource = "user";
          break;
        case "min_sessions_exceeds_available_days":
          next.constraints.min_sessions_per_week = availableDays;
          next.constraintsSource = "user";
          break;
        case "max_sessions_exceeds_available_days":
          next.constraints.max_sessions_per_week = availableDays;
          next.constraintsSource = "user";
          break;
        case "required_tss_ramp_exceeds_cap":
          next.maxWeeklyTssRampPct = MAX_SAFE_WEEKLY_TSS_RAMP_PCT;
          break;
        case "required_ctl_ramp_exceeds_cap":
          next.maxCtlRampPerWeek = MAX_SAFE_CTL_RAMP_PER_WEEK;
          break;
        case "post_goal_recovery_overlaps_next_goal":
        case "post_goal_recovery_compresses_next_goal_prep": {
          const minimumGoalGapDays = getMinimumGoalGapDays(formData.goals);
          const maxRecoveryDaysForPrepWindow =
            minimumGoalGapDays === undefined
              ? 0
              : Math.max(0, minimumGoalGapDays - MIN_PREP_DAYS_BETWEEN_GOALS);

          next.postGoalRecoveryDays = Math.max(
            0,
            Math.min(next.postGoalRecoveryDays, maxRecoveryDaysForPrepWindow),
          );
          break;
        }
      }

      return next;
    });
    setRecomputeNonce((value) => value + 1);
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

      const previewResult = await refreshPreview(true);
      if (!previewResult || previewResult.blocked) {
        return;
      }

      const createdPlan = await createPlanMutation.mutateAsync({
        minimal_plan: buildMinimalPayload(),
        creation_input: buildCreationInput(configData),
        preview_snapshot_token:
          previewResult.previewSnapshotToken ?? previewSnapshotToken,
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
              accessibilityHint={
                effectiveCreateDisabledReason ?? "Saves your plan and opens it"
              }
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
          showCreationConfig={featureFlags.trainingPlanCreateConfigMvp}
          configData={configData}
          projectionChart={previewState.projectionChart}
          onConfigChange={handleConfigChange}
          contextSummary={contextSummary}
          feasibilitySafetySummary={feasibilitySummary}
          informationalConflicts={informationalConflicts}
          blockingIssues={blockingIssues}
          createDisabledReason={effectiveCreateDisabledReason}
          isPreviewPending={
            isPreviewPending ||
            suggestionsQuery.isLoading ||
            suggestionsQuery.isFetching
          }
          onResolveConflict={handleResolveConflict}
          errors={errors}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
