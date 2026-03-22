import type { CreationAvailabilityConfig, CreationConstraints } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Form, FormIntegerStepperField, FormSelectField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import type { TrainingPlanConfigFormData } from "../SinglePageForm";

const goalDifficultySchema = z.object({
  goal_difficulty_preference: z.enum(["balanced", "conservative", "stretch"]),
});

const optimizationProfileSchema = z.object({
  optimizationProfile: z.enum(["balanced", "outcome_first", "sustainable"]),
});

const constraintsStepperSchema = z.object({
  max_sessions_per_week: z.number().min(0).max(14),
  max_single_session_duration_minutes: z.number().min(20).max(600),
  min_sessions_per_week: z.number().min(0).max(14),
  post_goal_recovery_days: z.number().min(0).max(28),
});

interface ConstraintsTabProps {
  configData: TrainingPlanConfigFormData;
  expanded: boolean;
  showDetails: boolean;
  informationalConflicts: string[];
  restDaysCount: number;
  weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]>;
  goalDifficultyOptions: Array<{
    value: NonNullable<CreationConstraints["goal_difficulty_preference"]>;
    label: string;
  }>;
  optimizationProfileOptions: Array<{
    value: TrainingPlanConfigFormData["optimizationProfile"];
    label: string;
  }>;
  optimizationProfileHelperCopy: Record<TrainingPlanConfigFormData["optimizationProfile"], string>;
  optimizationProfileDetailCopy: Record<TrainingPlanConfigFormData["optimizationProfile"], string>;
  postGoalRecoveryDetailCopy: string;
  getWeekDayLabel: (day: string) => string;
  onToggleExpanded: () => void;
  onToggleDetails: () => void;
  updateConfig: (updater: (draft: TrainingPlanConfigFormData) => void) => void;
}

export function ConstraintsTab({
  configData,
  expanded,
  showDetails,
  informationalConflicts,
  restDaysCount,
  weekDays,
  goalDifficultyOptions,
  optimizationProfileOptions,
  optimizationProfileHelperCopy,
  optimizationProfileDetailCopy,
  postGoalRecoveryDetailCopy,
  getWeekDayLabel,
  onToggleExpanded,
  onToggleDetails,
  updateConfig,
}: ConstraintsTabProps) {
  const goalDifficultyForm = useZodForm({
    schema: goalDifficultySchema,
    defaultValues: {
      goal_difficulty_preference: configData.constraints.goal_difficulty_preference ?? "balanced",
    },
  });

  const optimizationProfileForm = useZodForm({
    schema: optimizationProfileSchema,
    defaultValues: {
      optimizationProfile: configData.optimizationProfile,
    },
  });

  const constraintsStepperForm = useZodForm({
    schema: constraintsStepperSchema,
    defaultValues: {
      max_sessions_per_week: configData.constraints.max_sessions_per_week ?? 0,
      max_single_session_duration_minutes:
        configData.constraints.max_single_session_duration_minutes ?? 90,
      min_sessions_per_week: configData.constraints.min_sessions_per_week ?? 0,
      post_goal_recovery_days: configData.postGoalRecoveryDays,
    },
  });

  const selectedGoalDifficulty = goalDifficultyForm.watch("goal_difficulty_preference");
  const selectedOptimizationProfile = optimizationProfileForm.watch("optimizationProfile");
  const stepperValues = constraintsStepperForm.watch();

  useEffect(() => {
    goalDifficultyForm.reset({
      goal_difficulty_preference: configData.constraints.goal_difficulty_preference ?? "balanced",
    });
  }, [configData.constraints.goal_difficulty_preference, goalDifficultyForm]);

  useEffect(() => {
    optimizationProfileForm.reset({
      optimizationProfile: configData.optimizationProfile,
    });
  }, [configData.optimizationProfile, optimizationProfileForm]);

  useEffect(() => {
    constraintsStepperForm.reset({
      max_sessions_per_week: configData.constraints.max_sessions_per_week ?? 0,
      max_single_session_duration_minutes:
        configData.constraints.max_single_session_duration_minutes ?? 90,
      min_sessions_per_week: configData.constraints.min_sessions_per_week ?? 0,
      post_goal_recovery_days: configData.postGoalRecoveryDays,
    });
  }, [
    configData.constraints.max_sessions_per_week,
    configData.constraints.max_single_session_duration_minutes,
    configData.constraints.min_sessions_per_week,
    configData.postGoalRecoveryDays,
    constraintsStepperForm,
  ]);

  useEffect(() => {
    if (selectedGoalDifficulty === configData.constraints.goal_difficulty_preference) {
      return;
    }
    updateConfig((draft) => {
      draft.constraints.goal_difficulty_preference = selectedGoalDifficulty;
      draft.constraintsSource = "user";
    });
  }, [configData.constraints.goal_difficulty_preference, selectedGoalDifficulty, updateConfig]);

  useEffect(() => {
    if (selectedOptimizationProfile === configData.optimizationProfile) {
      return;
    }
    updateConfig((draft) => {
      draft.optimizationProfile = selectedOptimizationProfile;
    });
  }, [configData.optimizationProfile, selectedOptimizationProfile, updateConfig]);

  useEffect(() => {
    if (
      stepperValues.min_sessions_per_week === (configData.constraints.min_sessions_per_week ?? 0) &&
      stepperValues.max_sessions_per_week === (configData.constraints.max_sessions_per_week ?? 0) &&
      stepperValues.max_single_session_duration_minutes ===
        (configData.constraints.max_single_session_duration_minutes ?? 90) &&
      stepperValues.post_goal_recovery_days === configData.postGoalRecoveryDays
    ) {
      return;
    }

    updateConfig((draft) => {
      draft.constraints.min_sessions_per_week = stepperValues.min_sessions_per_week;
      draft.constraints.max_sessions_per_week = stepperValues.max_sessions_per_week;
      draft.constraints.max_single_session_duration_minutes =
        stepperValues.max_single_session_duration_minutes;
      draft.constraintsSource = "user";
      draft.postGoalRecoveryDays = stepperValues.post_goal_recovery_days;
    });
  }, [
    configData.constraints.max_sessions_per_week,
    configData.constraints.max_single_session_duration_minutes,
    configData.constraints.min_sessions_per_week,
    configData.postGoalRecoveryDays,
    stepperValues,
    updateConfig,
  ]);

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
      <Pressable
        onPress={onToggleExpanded}
        className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <View className="flex-1">
          <Text className="text-sm font-medium">Limits</Text>
          <Text className="text-xs text-muted-foreground">
            Rest {restDaysCount}d, sessions {configData.constraints.min_sessions_per_week ?? 0}-
            {configData.constraints.max_sessions_per_week ?? 0}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">{expanded ? "Hide" : "Edit"}</Text>
          {expanded ? (
            <ChevronUp size={16} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={16} className="text-muted-foreground" />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View className="gap-2 rounded-md border border-border bg-muted/20 p-2.5">
          <View className="items-end">
            <Button variant="outline" size="sm" onPress={onToggleDetails}>
              <Text>{showDetails ? "Hide details" : "Learn"}</Text>
            </Button>
          </View>

          <Text className="text-sm">Sessions / week</Text>
          <Form {...constraintsStepperForm}>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <FormIntegerStepperField
                  control={constraintsStepperForm.control}
                  label="Min"
                  max={14}
                  min={0}
                  name="min_sessions_per_week"
                  testId="min-sessions-per-week"
                />
              </View>
              <View className="flex-1">
                <FormIntegerStepperField
                  control={constraintsStepperForm.control}
                  label="Max"
                  max={14}
                  min={0}
                  name="max_sessions_per_week"
                  testId="max-sessions-per-week"
                />
              </View>
            </View>
          </Form>

          <View className="gap-1.5">
            <Text className="text-sm">Hard rest days</Text>
            <View className="flex-row flex-wrap gap-2">
              {weekDays.map((day) => {
                const selected = configData.constraints.hard_rest_days.includes(day);
                return (
                  <Button
                    key={`rest-${day}`}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    onPress={() => {
                      updateConfig((draft) => {
                        draft.constraints.hard_rest_days = selected
                          ? draft.constraints.hard_rest_days.filter(
                              (candidate) => candidate !== day,
                            )
                          : [...draft.constraints.hard_rest_days, day];
                        draft.constraintsSource = "user";
                      });
                    }}
                  >
                    <Text>{getWeekDayLabel(day)}</Text>
                  </Button>
                );
              })}
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-sm">Max session (min)</Text>
            <Form {...constraintsStepperForm}>
              <FormIntegerStepperField
                control={constraintsStepperForm.control}
                label="Max session (min)"
                max={600}
                min={20}
                name="max_single_session_duration_minutes"
                testId="max-session-duration"
              />
            </Form>
          </View>

          <View className="gap-1.5">
            <Text className="text-sm">Goal difficulty</Text>
            <Form {...goalDifficultyForm}>
              <FormSelectField
                control={goalDifficultyForm.control}
                label="Goal difficulty"
                name="goal_difficulty_preference"
                options={goalDifficultyOptions}
                placeholder="Choose preference"
              />
            </Form>
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <Text className="text-sm font-medium">Plan style</Text>
            <Form {...optimizationProfileForm}>
              <FormSelectField
                control={optimizationProfileForm.control}
                label="Plan style"
                name="optimizationProfile"
                options={optimizationProfileOptions}
                placeholder="Choose profile"
              />
            </Form>
            <Text className="text-[11px] text-muted-foreground">
              {optimizationProfileHelperCopy[configData.optimizationProfile]}
            </Text>
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {optimizationProfileDetailCopy[configData.optimizationProfile]}
              </Text>
            )}
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <Text className="text-sm">Recovery days</Text>
            <Form {...constraintsStepperForm}>
              <FormIntegerStepperField
                control={constraintsStepperForm.control}
                label="Recovery days"
                max={28}
                min={0}
                name="post_goal_recovery_days"
                testId="post-goal-recovery-days"
              />
            </Form>
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {postGoalRecoveryDetailCopy}
              </Text>
            )}
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <Text className="text-sm">Safety caps</Text>
            <Text className="text-[11px] text-muted-foreground">
              Weekly ramp and CTL safety caps remain enforced internally.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
