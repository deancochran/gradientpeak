import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useWizardForm } from "./components/hooks/useWizardForm";
import { Step1BasicInfo } from "./components/steps/Step1BasicInfo";
import { Step2WeeklyTargets } from "./components/steps/Step2WeeklyTargets";
import { Step3Periodization } from "./components/steps/Step4Periodization";
import { WizardNavigation } from "./components/WizardNavigation";
import { WizardProgress } from "./components/WizardProgress";

const STEP_TITLES = [
  "Plan Basics",
  "Training Schedule",
  "Periodization (Optional)",
];

/**
 * Streamlined Training Plan Creation Wizard
 * Simplified 3-step process with smart presets and better defaults
 */
export default function CreateTrainingPlan() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const {
    currentStep,
    formData,
    errors,
    updateField,
    applyPreset,
    nextStep,
    previousStep,
    resetForm,
    validateCurrentStep,
    isFirstStep,
    isLastStep,
    totalSteps,
  } = useWizardForm();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create training plan mutation
  const createPlanMutation = trpc.trainingPlans.create.useMutation({
    onSuccess: () => {
      // Invalidate queries to refresh data
      utils.trainingPlans.get.invalidate();
      utils.trainingPlans.getCurrentStatus.invalidate();

      // Show success message
      Alert.alert(
        "Success!",
        "Your training plan has been created successfully.",
        [
          {
            text: "View Plan",
            onPress: () => {
              resetForm();
              router.replace("/plan/training-plan" as any);
            },
          },
        ],
      );
    },
    onError: (error) => {
      const errorMessage = error.message.includes("structure")
        ? "Invalid training plan structure. Please check your inputs and try again."
        : error.message || "An unexpected error occurred.";

      Alert.alert("Creation Failed", errorMessage, [{ text: "OK" }]);
      setIsSubmitting(false);
    },
  });

  // Handle next button press
  const handleNext = () => {
    nextStep();
  };

  // Handle back button press
  const handleBack = () => {
    previousStep();
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare periodization data
      let periodizationData = undefined;
      if (formData.usePeriodization) {
        // Validate periodization fields
        if (
          formData.startingCTL !== undefined &&
          formData.targetCTL !== undefined &&
          formData.rampRate !== undefined &&
          formData.targetCTL > formData.startingCTL &&
          formData.rampRate > 0
        ) {
          periodizationData = {
            startingCTL: formData.startingCTL,
            targetCTL: formData.targetCTL,
            rampRate: formData.rampRate,
          };
        } else {
          Alert.alert(
            "Invalid Periodization",
            "Please check your periodization values or disable it to continue.",
            [{ text: "OK" }],
          );
          setIsSubmitting(false);
          return;
        }
      }

      await createPlanMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        structure: {
          target_weekly_tss_min: formData.tssMin,
          target_weekly_tss_max: formData.tssMax,
          target_activities_per_week: formData.activitiesPerWeek,
          max_consecutive_training_days: formData.maxConsecutiveDays,
          min_rest_days_per_week: formData.minRestDays,
          min_hours_between_hard_activities: formData.minHoursBetweenHard,
          periodization: periodizationData,
        },
      });
    } catch (error) {
      // Error handled in mutation onError
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
          {
            text: "Keep Editing",
            style: "cancel",
          },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              resetForm();
              router.back();
            },
          },
        ],
      );
    } else {
      resetForm();
      router.back();
    }
  };

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            name={formData.name}
            description={formData.description}
            preset={formData.preset}
            onNameChange={(value) => updateField("name", value)}
            onDescriptionChange={(value) => updateField("description", value)}
            onPresetChange={(preset) => applyPreset(preset)}
            errors={errors}
          />
        );

      case 2:
        return (
          <Step2WeeklyTargets
            tssMin={formData.tssMin}
            tssMax={formData.tssMax}
            activitiesPerWeek={formData.activitiesPerWeek}
            maxConsecutiveDays={formData.maxConsecutiveDays}
            minRestDays={formData.minRestDays}
            minHoursBetweenHard={formData.minHoursBetweenHard}
            onTssMinChange={(value) => updateField("tssMin", value)}
            onTssMaxChange={(value) => updateField("tssMax", value)}
            onActivitiesPerWeekChange={(value) =>
              updateField("activitiesPerWeek", value)
            }
            onMaxConsecutiveDaysChange={(value) =>
              updateField("maxConsecutiveDays", value)
            }
            onMinRestDaysChange={(value) => updateField("minRestDays", value)}
            onMinHoursBetweenHardChange={(value) =>
              updateField("minHoursBetweenHard", value)
            }
            errors={errors}
          />
        );

      case 3:
        return (
          <Step3Periodization
            usePeriodization={formData.usePeriodization}
            startingCTL={formData.startingCTL}
            targetCTL={formData.targetCTL}
            rampRate={formData.rampRate}
            onUsePeriodizationChange={(value) =>
              updateField("usePeriodization", value)
            }
            onStartingCTLChange={(value) => updateField("startingCTL", value)}
            onTargetCTLChange={(value) => updateField("targetCTL", value)}
            onRampRateChange={(value) => updateField("rampRate", value)}
            errors={errors}
          />
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* Header */}
      <View className="bg-card border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={handleCancel}>
            <Text className="text-base text-muted-foreground">Cancel</Text>
          </TouchableOpacity>

          <View className="items-center">
            <Text className="text-lg font-semibold">
              {STEP_TITLES[currentStep - 1]}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Step {currentStep} of {totalSteps}
            </Text>
          </View>

          <View className="w-16" />
        </View>

        {/* Progress Bar */}
        <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}
      </ScrollView>

      {/* Navigation */}
      <WizardNavigation
        currentStep={currentStep}
        totalSteps={totalSteps}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        nextButtonLabel="Continue"
        submitButtonLabel="Create Plan"
      />
    </KeyboardAvoidingView>
  );
}
