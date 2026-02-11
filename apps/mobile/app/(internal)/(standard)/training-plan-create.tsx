import {
  type GoalTargetFormData,
  SinglePageForm,
  type TrainingPlanFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";
import { useRouter, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import type { MinimalTrainingPlanCreate } from "@repo/core";

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

export default function CreateTrainingPlan() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Calculate default target date (16 weeks from now)
  const defaultTargetDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 112); // 16 weeks
    return date.toISOString().split("T")[0]!;
  }, []);

  // Form state
  const [formData, setFormData] = useState<TrainingPlanFormData>({
    goals: [createDefaultGoal(defaultTargetDate)],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);

  const createPlanMutation = useReliableMutation(
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

  const buildPayload = (): MinimalTrainingPlanCreate => ({
    goals: formData.goals.map((goal) => ({
      name: goal.name.trim(),
      target_date: goal.targetDate,
      priority: goal.priority,
      targets: goal.targets.map(toPayloadTarget),
    })),
  });

  // Handle form data changes
  const handleFormDataChange = (nextData: TrainingPlanFormData) => {
    setFormData(nextData);

    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  };

  // Validate form
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

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setIsCreating(true);

    try {
      const createdPlan = await createPlanMutation.mutateAsync(buildPayload());
      router.replace({
        pathname: ROUTES.PLAN.TRAINING_PLAN.INDEX,
        params: { id: createdPlan.id, nextStep: "refine" },
      } as any);
    } catch (error) {
      console.error("Failed to create minimal training plan:", error);
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
              <Text className="text-primary font-semibold">
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
          errors={errors}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
