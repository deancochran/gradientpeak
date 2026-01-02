import {
  SinglePageForm,
  type TrainingPlanFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { useRouter, Stack } from "expo-router";
import React, { useState, useMemo } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";

export default function CreateTrainingPlan() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get current CTL
  const { data: currentStatus } =
    trpc.trainingPlans.getCurrentStatus.useQuery();
  const currentCTL = currentStatus?.ctl || 0;

  // Calculate default target date (16 weeks from now)
  const defaultTargetDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 112); // 16 weeks
    return date.toISOString().split("T")[0]!;
  }, []);

  // Form state
  const [formData, setFormData] = useState<TrainingPlanFormData>({
    name: "",
    description: "",
    preset: "intermediate",
    targetDate: defaultTargetDate,
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
    startingCTL: currentCTL,
    targetCTL: 0, // Will be auto-calculated if 0
    rampRate: 0.07,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update starting CTL when currentCTL changes
  React.useEffect(() => {
    if (currentCTL > 0 && formData.startingCTL === 0) {
      setFormData((prev) => ({ ...prev, startingCTL: currentCTL }));
    }
  }, [currentCTL, formData.startingCTL]);

  // Create mutation
  const createPlanMutation = useReliableMutation(trpc.trainingPlans.create, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Training plan created successfully.", [
        {
          text: "View Plan",
          onPress: () => {
            router.replace("/training-plan" as any);
          },
        },
      ]);
    },
    onError: (error) => {
      const errorMessage = error.message || "Failed to create training plan.";
      Alert.alert("Error", errorMessage, [{ text: "OK" }]);
      setIsSubmitting(false);
    },
  });

  // Handle form data changes
  const handleFormDataChange = (updates: Partial<TrainingPlanFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));

    // Clear related errors
    if (updates.name !== undefined && errors.name) {
      setErrors((prev) => {
        const { name, ...rest } = prev;
        return rest;
      });
    }
    if (updates.targetDate !== undefined && errors.targetDate) {
      setErrors((prev) => {
        const { targetDate, ...rest } = prev;
        return rest;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Plan name is required";
    }

    if (!formData.targetDate) {
      newErrors.targetDate = "Target date is required";
    } else {
      const targetDate = new Date(formData.targetDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (targetDate < today) {
        newErrors.targetDate = "Target date must be in the future";
      }
    }

    if (formData.tssMin < 0) {
      newErrors.tssMin = "Min TSS must be at least 0";
    }

    if (formData.tssMax < formData.tssMin) {
      newErrors.tssMax = "Max TSS must be greater than or equal to Min TSS";
    }

    if (formData.activitiesPerWeek < 1 || formData.activitiesPerWeek > 14) {
      newErrors.activitiesPerWeek =
        "Activities per week must be between 1 and 14";
    }

    if (formData.maxConsecutiveDays < 1 || formData.maxConsecutiveDays > 7) {
      newErrors.maxConsecutiveDays =
        "Max consecutive days must be between 1 and 7";
    }

    if (formData.minRestDays < 0 || formData.minRestDays > 7) {
      newErrors.minRestDays = "Min rest days must be between 0 and 7";
    }

    if (formData.activitiesPerWeek + formData.minRestDays > 7) {
      newErrors.schedule = "Activities per week plus rest days cannot exceed 7";
    }

    if (formData.startingCTL < 0) {
      newErrors.startingCTL = "Starting CTL must be at least 0";
    }

    if (formData.rampRate < 0.01 || formData.rampRate > 0.15) {
      newErrors.rampRate = "Ramp rate must be between 0.01 and 0.15";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const avgWeeklyTSS = (formData.tssMin + formData.tssMax) / 2;

      // Use provided target CTL or calculate from weekly TSS
      const targetCTL =
        formData.targetCTL > 0
          ? formData.targetCTL
          : Math.max(
              Math.round(avgWeeklyTSS * 0.15),
              formData.startingCTL + 10,
            );

      const periodizationData = {
        starting_ctl: formData.startingCTL,
        target_ctl: targetCTL,
        ramp_rate: formData.rampRate,
        target_date: formData.targetDate,
        mesocycles: formData.mesocycles,
        recovery_week_frequency: 3,
        recovery_week_reduction: 0.5,
      };

      await createPlanMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        structure: {
          plan_type: "periodized" as const,
          target_weekly_tss_min: formData.tssMin,
          target_weekly_tss_max: formData.tssMax,
          target_activities_per_week: formData.activitiesPerWeek,
          max_consecutive_training_days: formData.maxConsecutiveDays,
          min_rest_days_per_week: formData.minRestDays,
          max_consecutive_rest_days: 3,
          activity_type_distribution: formData.activityDistribution ?? {
            run: 1.0,
          },
          periodization_template: periodizationData,
        },
      });
    } catch (error) {
      console.error("Failed to create training plan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (formData.name.trim() || formData.description.trim()) {
      Alert.alert(
        "Discard Changes?",
        "Are you sure you want to cancel? Your progress will be lost.",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Create Training Plan",
          headerShown: true,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <SinglePageForm
          formData={formData}
          onFormDataChange={handleFormDataChange}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          errors={errors}
          currentCTL={currentCTL}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
