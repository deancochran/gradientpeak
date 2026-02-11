import {
  type GoalTargetFormData,
  SinglePageForm,
  type TrainingPlanConfigConflict,
  type TrainingPlanConfigFormData,
  type TrainingPlanFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { ROUTES } from "@/lib/constants/routes";
import { featureFlags } from "@/lib/constants/features";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { Text } from "@/components/ui/text";
import type {
  CreationAvailabilityConfig,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  CreationValueSource,
  MinimalTrainingPlanCreate,
} from "@repo/core";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";

const HIGH_IMPACT_RECOMPUTE_DELAY_MS = 500;
const PREVIEW_REFRESH_DELAY_MS = 350;

const weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]> = [
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

const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMS_PATTERN = /^([0-9]+):([0-5][0-9])$/;

const parseHmsToSeconds = (value: string): number | undefined => {
  const trimmed = value.trim();
  const match = HMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
};

const parseMmSsToSeconds = (value: string): number | undefined => {
  const trimmed = value.trim();
  const match = MMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
};

const parseDistanceKmToMeters = (
  value: string | undefined,
): number | undefined => {
  if (!value?.trim()) {
    return undefined;
  }

  const distanceKm = Number(value);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return undefined;
  }

  return Math.round(distanceKm * 1000);
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
  baselineLoadWeeklyTss: 180,
  baselineLoadProvenance: createProvenance("default", ["initial_default"]),
  recentInfluenceScore: 0,
  recentInfluenceAction: "disabled",
  recentInfluenceProvenance: createProvenance("default", ["initial_default"]),
  constraints: {
    weekly_load_floor_tss: 120,
    weekly_load_cap_tss: 260,
    hard_rest_days: ["wednesday", "friday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "balanced",
  },
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    baseline_load: { locked: false },
    recent_influence: { locked: false },
    weekly_load_floor_tss: { locked: false },
    weekly_load_cap_tss: { locked: false },
    hard_rest_days: { locked: false },
    min_sessions_per_week: { locked: false },
    max_sessions_per_week: { locked: false },
    max_single_session_duration_minutes: { locked: false },
    goal_difficulty_preference: { locked: false },
  },
});

const getAvailableTrainingDays = (config: TrainingPlanConfigFormData) => {
  const availableDays = new Set(
    config.availabilityConfig.days
      .filter((day) => day.windows.length > 0 && (day.max_sessions ?? 0) > 0)
      .map((day) => day.day),
  );
  for (const day of config.constraints.hard_rest_days) {
    availableDays.delete(day);
  }
  return availableDays.size;
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
    baseline: false,
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
  const [informationalConflicts, setInformationalConflicts] = useState<
    string[]
  >([]);
  const [recomputeNonce, setRecomputeNonce] = useState(0);

  const suggestionsQuery = trpc.trainingPlans.getCreationSuggestions.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      enabled: featureFlags.trainingPlanCreateConfigMvp,
    },
  );

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

  const toPayloadTarget = (
    target: GoalTargetFormData,
  ): MinimalTrainingPlanCreate["goals"][number]["targets"][number] => {
    switch (target.targetType) {
      case "race_performance": {
        const distanceM = parseDistanceKmToMeters(target.distanceKm);
        const targetTimeS = parseHmsToSeconds(target.completionTimeHms ?? "");
        const activityCategory = target.activityCategory;

        if (!distanceM || !targetTimeS || !activityCategory) {
          throw new Error(
            "race_performance target requires activity, distance, and time",
          );
        }

        return {
          target_type: "race_performance",
          distance_m: distanceM,
          target_time_s: targetTimeS,
          activity_category: activityCategory,
        };
      }
      case "pace_threshold": {
        const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
        const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
        const activityCategory = target.activityCategory;

        if (!paceSeconds || !testDurationS || !activityCategory) {
          throw new Error(
            "pace_threshold target requires pace, activity, and test duration",
          );
        }

        return {
          target_type: "pace_threshold",
          target_speed_mps: 1000 / paceSeconds,
          test_duration_s: testDurationS,
          activity_category: activityCategory,
        };
      }
      case "power_threshold": {
        const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
        const activityCategory = target.activityCategory;

        if (!target.targetWatts || !testDurationS || !activityCategory) {
          throw new Error(
            "power_threshold target requires watts, activity, and test duration",
          );
        }

        return {
          target_type: "power_threshold",
          target_watts: target.targetWatts,
          test_duration_s: testDurationS,
          activity_category: activityCategory,
        };
      }
      case "hr_threshold": {
        if (!target.targetLthrBpm) {
          throw new Error("hr_threshold target requires lthr bpm");
        }

        return {
          target_type: "hr_threshold",
          target_lthr_bpm: Math.round(target.targetLthrBpm),
        };
      }
    }
  };

  const buildMinimalPayload = useCallback((): MinimalTrainingPlanCreate => {
    return {
      goals: formData.goals.map((goal) => ({
        name: goal.name.trim(),
        target_date: goal.targetDate,
        priority: goal.priority,
        targets: goal.targets.map(toPayloadTarget),
      })),
    };
  }, [formData.goals]);

  const buildCreationInput = useCallback(
    (state: TrainingPlanConfigFormData) => ({
      user_values: {
        availability_config: state.availabilityConfig,
        baseline_load: { weekly_tss: state.baselineLoadWeeklyTss },
        recent_influence: { influence_score: state.recentInfluenceScore },
        recent_influence_action: state.recentInfluenceAction,
        constraints: state.constraints,
        locks: state.locks,
      },
      provenance_overrides: {
        availability_provenance: state.availabilityProvenance,
        baseline_load_provenance: state.baselineLoadProvenance,
        recent_influence_provenance: state.recentInfluenceProvenance,
      },
    }),
    [],
  );

  const mergeSuggestionsIntoConfig = useCallback(
    (
      current: TrainingPlanConfigFormData,
      suggestionResponse: NonNullable<typeof suggestionsQuery.data>,
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

      const canApplyBaseline =
        mode === "seed" ||
        (!dirtyState.baseline && !current.locks.baseline_load.locked);
      if (canApplyBaseline) {
        next.baselineLoadWeeklyTss = suggestions.baseline_load.weekly_tss;
        next.baselineLoadProvenance = suggestions.baseline_load_provenance;
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

      const minimalPlan = buildMinimalPayload();
      setIsPreviewPending(true);
      try {
        const preview =
          await utils.client.trainingPlans.previewCreationConfig.query({
            minimal_plan: minimalPlan,
            creation_input: buildCreationInput(configData),
            post_create_behavior: {
              autonomous_mutation_enabled: false,
            },
          });

        setContextSummary(preview.creation_context_summary);
        setFeasibilitySummary(preview.feasibility_safety);
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
          return { blocked: true };
        }

        return { blocked: false };
      } catch (error) {
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
    [
      buildCreationInput,
      buildMinimalPayload,
      configData,
      utils.client.trainingPlans.previewCreationConfig.query,
    ],
  );

  useEffect(() => {
    if (!suggestionsQuery.data || hasSeededDefaults) {
      return;
    }
    setConfigData((previous) =>
      mergeSuggestionsIntoConfig(previous, suggestionsQuery.data, "seed"),
    );
    setHasSeededDefaults(true);
  }, [hasSeededDefaults, mergeSuggestionsIntoConfig, suggestionsQuery.data]);

  useEffect(() => {
    if (!hasSeededDefaults || recomputeNonce === 0) {
      return;
    }

    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const suggestions =
          await utils.client.trainingPlans.getCreationSuggestions.query({
            locks: configData.locks,
            existing_values: {
              availability_config: configData.availabilityConfig,
              baseline_load_weekly_tss: configData.baselineLoadWeeklyTss,
              recent_influence_score: configData.recentInfluenceScore,
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
    configData.baselineLoadWeeklyTss,
    configData.constraints,
    configData.locks,
    configData.recentInfluenceScore,
    hasSeededDefaults,
    mergeSuggestionsIntoConfig,
    recomputeNonce,
    utils.client.trainingPlans.getCreationSuggestions.query,
  ]);

  useEffect(() => {
    if (!hasSeededDefaults) {
      return;
    }

    if (!featureFlags.trainingPlanCreateConfigMvp) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshPreview(false);
    }, PREVIEW_REFRESH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [buildMinimalPayload, configData, hasSeededDefaults, refreshPreview]);

  const handleFormDataChange = (nextData: TrainingPlanFormData) => {
    setFormData(nextData);
    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  };

  const handleConfigChange = (nextData: TrainingPlanConfigFormData) => {
    const highImpactChanged =
      JSON.stringify(configData.availabilityConfig) !==
        JSON.stringify(nextData.availabilityConfig) ||
      configData.baselineLoadWeeklyTss !== nextData.baselineLoadWeeklyTss ||
      JSON.stringify(configData.constraints) !==
        JSON.stringify(nextData.constraints) ||
      JSON.stringify(configData.locks) !== JSON.stringify(nextData.locks);

    if (highImpactChanged) {
      setRecomputeNonce((value) => value + 1);
    }

    setDirtyState((previous) => ({
      availability:
        previous.availability ||
        nextData.availabilityProvenance.source === "user",
      baseline:
        previous.baseline || nextData.baselineLoadProvenance.source === "user",
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
    const newErrors: Record<string, string> = {};

    if (!formData.goals.length) {
      newErrors.goals = "At least one goal is required";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    formData.goals.forEach((goal, goalIndex) => {
      if (!goal.name.trim()) {
        newErrors[`goals.${goalIndex}.name`] = "Goal name is required";
      }

      if (!goal.targetDate) {
        newErrors[`goals.${goalIndex}.targetDate`] = "Target date is required";
      } else {
        const targetDate = new Date(goal.targetDate);
        if (targetDate < today) {
          newErrors[`goals.${goalIndex}.targetDate`] =
            "Target date must be in the future";
        }
      }

      if (goal.priority < 1 || goal.priority > 10) {
        newErrors[`goals.${goalIndex}.priority`] =
          "Priority must be between 1 and 10";
      }

      if (!goal.targets.length) {
        newErrors[`goals.${goalIndex}.targets`] =
          "At least one target is required";
        return;
      }

      goal.targets.forEach((target, targetIndex) => {
        switch (target.targetType) {
          case "race_performance": {
            if (!target.activityCategory) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
              ] = "Select an activity for race performance";
            }
            const distanceM = parseDistanceKmToMeters(target.distanceKm);
            if (!distanceM) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.distanceKm`
              ] = "Distance (km) must be greater than 0";
            }
            const targetTimeS = parseHmsToSeconds(
              target.completionTimeHms ?? "",
            );
            if (!targetTimeS) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.completionTimeHms`
              ] = "Completion time must use h:mm:ss";
            }
            break;
          }
          case "pace_threshold": {
            const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
            if (!paceSeconds) {
              newErrors[`goals.${goalIndex}.targets.${targetIndex}.paceMmSs`] =
                "Pace must use mm:ss";
            }
            if (!target.activityCategory) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
              ] = "Select an activity for pace threshold";
            }
            const testDurationS = parseHmsToSeconds(
              target.testDurationHms ?? "",
            );
            if (!testDurationS) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.testDurationHms`
              ] = "Test duration must use h:mm:ss";
            }
            break;
          }
          case "power_threshold": {
            if (!target.targetWatts || target.targetWatts <= 0) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.targetWatts`
              ] = "Target watts must be greater than 0";
            }
            if (!target.activityCategory) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
              ] = "Select an activity for power threshold";
            }
            const testDurationS = parseHmsToSeconds(
              target.testDurationHms ?? "",
            );
            if (!testDurationS) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.testDurationHms`
              ] = "Test duration must use h:mm:ss";
            }
            break;
          }
          case "hr_threshold": {
            if (!target.targetLthrBpm || target.targetLthrBpm <= 0) {
              newErrors[
                `goals.${goalIndex}.targets.${targetIndex}.targetLthrBpm`
              ] = "LTHR must be greater than 0";
            }
            break;
          }
        }
      });
    });

    if (Object.keys(newErrors).some((key) => key.includes(".targets"))) {
      newErrors.goals =
        newErrors.goals ?? "Each goal must include valid target details";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
        case "baseline_below_floor":
          next.baselineLoadWeeklyTss = Math.max(
            next.baselineLoadWeeklyTss,
            next.constraints.weekly_load_floor_tss ??
              next.baselineLoadWeeklyTss,
          );
          next.baselineLoadProvenance = createProvenance("user", ["quick_fix"]);
          break;
        case "baseline_above_cap":
          next.baselineLoadWeeklyTss = Math.min(
            next.baselineLoadWeeklyTss,
            next.constraints.weekly_load_cap_tss ?? next.baselineLoadWeeklyTss,
          );
          next.baselineLoadProvenance = createProvenance("user", ["quick_fix"]);
          break;
        case "weekly_load_floor_exceeds_cap":
          next.constraints.weekly_load_floor_tss = Math.min(
            next.constraints.weekly_load_floor_tss ?? 0,
            next.constraints.weekly_load_cap_tss ?? 0,
          );
          next.constraintsSource = "user";
          break;
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
      }

      return next;
    });
    setRecomputeNonce((value) => value + 1);
  };

  const handleCreate = async () => {
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
        } as any);
        return;
      }

      const previewResult = await refreshPreview(true);
      if (!previewResult || previewResult.blocked) {
        return;
      }

      const createdPlan = await createPlanMutation.mutateAsync({
        minimal_plan: buildMinimalPayload(),
        creation_input: buildCreationInput(configData),
        post_create_behavior: {
          autonomous_mutation_enabled: false,
        },
        is_active: true,
      });

      router.replace({
        pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
        params: { id: createdPlan.id, nextStep: "refine" },
      } as any);
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
              disabled={isCreating}
              hitSlop={8}
              className={isCreating ? "opacity-50" : "opacity-100"}
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
        <SinglePageForm
          formData={formData}
          onFormDataChange={handleFormDataChange}
          showCreationConfig={featureFlags.trainingPlanCreateConfigMvp}
          configData={configData}
          onConfigChange={handleConfigChange}
          contextSummary={contextSummary}
          feasibilitySafetySummary={feasibilitySummary}
          conflictItems={conflictItems}
          informationalConflicts={informationalConflicts}
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
