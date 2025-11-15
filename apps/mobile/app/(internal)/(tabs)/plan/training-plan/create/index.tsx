import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useWizardForm } from "./components/hooks/useWizardForm";
import { Step1BasicInfo } from "./components/steps/Step1BasicInfo";
import { Step2WeeklyTargets } from "./components/steps/Step2WeeklyTargets";
import { Step3RecoveryRules } from "./components/steps/Step3RecoveryRules";
import { Step4Periodization } from "./components/steps/Step4Periodization";
import { WizardNavigation } from "./components/WizardNavigation";
import { WizardProgress } from "./components/WizardProgress";

const STEP_TITLES = [
  "Basic Information",
  "Weekly Targets",
  "Recovery Rules",
  "Periodization (Optional)",
];

/**
 * Create Training Plan Wizard
 * Phase 3 of Training Plans UI-First Implementation
 * Multi-step form for creating a new training plan
 */
export default function CreateTrainingPlan() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const {
    currentStep,
    formData,
    errors,
    updateField,
    updatePeriodization,
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
              router.replace("./");
            },
          },
        ],
      );
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to create training plan: ${error.message}`, [
        { text: "OK" },
      ]);
      setIsSubmitting(false);
    },
  });

  // Handle next button press
  const handleNext = () => {
    if (nextStep()) {
      // Successfully moved to next step
    }
  };

  // Handle back button press
  const handleBack = () => {
    previousStep();
  };

  // Handle skip button (for optional periodization step)
  const handleSkip = () => {
    // Clear periodization data and submit
    updateField("periodization", undefined);
    handleSubmit();
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setIsSubmitting(true);

    try {
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
          periodization: formData.periodization,
        },
      });
    } catch (error) {
      // Error handled in mutation
      console.error("Failed to create training plan:", error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    Alert.alert(
      "Cancel Creation",
      "Are you sure you want to cancel? All progress will be lost.",
      [
        {
          text: "Continue Editing",
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
  };

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            name={formData.name}
            description={formData.description}
            onNameChange={(value) => updateField("name", value)}
            onDescriptionChange={(value) => updateField("description", value)}
            errors={errors}
          />
        );

      case 2:
        return (
          <Step2WeeklyTargets
            tssMin={formData.tssMin}
            tssMax={formData.tssMax}
            activitiesPerWeek={formData.activitiesPerWeek}
            onTssMinChange={(value) => updateField("tssMin", value)}
            onTssMaxChange={(value) => updateField("tssMax", value)}
            onActivitiesPerWeekChange={(value) =>
              updateField("activitiesPerWeek", value)
            }
            errors={errors}
          />
        );

      case 3:
        return (
          <Step3RecoveryRules
            maxConsecutiveDays={formData.maxConsecutiveDays}
            minRestDays={formData.minRestDays}
            minHoursBetweenHard={formData.minHoursBetweenHard}
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

      case 4:
        return (
          <Step4Periodization
            periodization={formData.periodization}
            onPeriodizationChange={updatePeriodization}
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
      <View className="flex-1">
        {/* Header */}
        <View className="bg-card border-b border-border p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold">Create Training Plan</Text>
            <Button variant="ghost" onPress={handleCancel} size="sm">
              <Text className="text-muted-foreground">Cancel</Text>
            </Button>
          </View>
        </View>

        {/* Progress Indicator */}
        <View className="p-4 bg-card">
          <WizardProgress
            currentStep={currentStep}
            totalSteps={totalSteps}
            stepTitles={STEP_TITLES}
          />
        </View>

        {/* Step Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          keyboardShouldPersistTaps="handled"
        >
          {renderStepContent()}

          {/* Loading Overlay */}
          {isSubmitting && (
            <View className="absolute inset-0 bg-background/80 items-center justify-center">
              <View className="bg-card rounded-lg p-6 items-center shadow-lg">
                <ActivityIndicator size="large" />
                <Text className="text-lg font-semibold mt-4">
                  Creating your training plan...
                </Text>
                <Text className="text-sm text-muted-foreground mt-2">
                  This may take a moment
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Navigation Footer */}
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={totalSteps}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={handleSubmit}
          onSkip={handleSkip}
          isSubmitting={isSubmitting}
          showSkip={isLastStep && !formData.periodization}
          nextButtonLabel="Next"
          submitButtonLabel="Create Plan"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
