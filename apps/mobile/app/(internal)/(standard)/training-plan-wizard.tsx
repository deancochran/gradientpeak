import { GoalSelectionStep } from "@/components/training-plan/create/steps/GoalSelectionStep";
import { CurrentFitnessStep } from "@/components/training-plan/create/steps/CurrentFitnessStep";
import { SportMixStep } from "@/components/training-plan/create/steps/SportMixStep";
import { AvailabilityStep } from "@/components/training-plan/create/steps/AvailabilityStep";
import { ExperienceLevelStep } from "@/components/training-plan/create/steps/ExperienceLevelStep";
import { trpc } from "@/lib/trpc";
import { useRouter, Stack } from "expo-router";
import React, { useState } from "react";
import { View, Alert, BackHandler } from "react-native";
import type {
  WizardGoalInput,
  WizardFitnessInput,
  WizardConstraintsInput,
  WizardPeriodizedInput,
} from "@repo/core";

const TOTAL_STEPS = 5;

export default function TrainingPlanWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Get current CTL
  const { data: currentStatus } =
    trpc.trainingPlans.getCurrentStatus.useQuery();
  const currentCTL = currentStatus?.ctl || 0;

  // Calculate default target date (16 weeks from now)
  const defaultTargetDate = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 112); // 16 weeks
    return date.toISOString().split("T")[0] || "";
  }, []);

  const defaultStartDate = React.useMemo(() => {
    return new Date().toISOString().split("T")[0] || "";
  }, []);

  // Wizard state
  const [goal, setGoal] = useState<WizardGoalInput>({
    name: "",
    target_date: defaultTargetDate,
    target_performance: "",
    notes: "",
  });

  const [fitness, setFitness] = useState<WizardFitnessInput>({
    starting_ctl: currentCTL > 0 ? currentCTL : undefined,
    estimated_from_weekly_hours: undefined,
    estimated_from_weekly_tss: undefined,
  });

  const [activities, setActivities] = useState<Record<string, number>>({
    run: 1.0,
  });

  const [constraints, setConstraints] = useState<WizardConstraintsInput>({
    max_hours_per_week: undefined,
    max_sessions_per_week: undefined,
    available_days: undefined,
    min_rest_days_per_week: 1,
  });

  const [experienceLevel, setExperienceLevel] = useState<
    "beginner" | "intermediate" | "advanced"
  >("intermediate");

  const [intensityPreset, setIntensityPreset] = useState<
    "polarized" | "pyramidal" | "threshold"
  >("pyramidal");

  // Handle back button
  React.useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (currentStep > 1) {
          setCurrentStep(currentStep - 1);
          return true;
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      // Navigate to review screen with wizard data
      const wizardInput: WizardPeriodizedInput = {
        plan_type: "periodized",
        name: undefined, // Will be generated or set in review
        start_date: defaultStartDate,
        goals: [goal],
        fitness,
        activities,
        constraints,
        intensity_preset: intensityPreset,
        experience_level: experienceLevel,
      };

      // Navigate to review screen with the wizard data
      router.push({
        pathname: "/training-plan-review" as any,
        params: {
          wizardData: JSON.stringify(wizardInput),
        },
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      // Confirm exit on first step
      Alert.alert(
        "Exit Wizard?",
        "Your progress will be lost. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Exit",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Create Training Plan",
          headerShown: true,
          headerBackVisible: false,
        }}
      />

      {currentStep === 1 && (
        <GoalSelectionStep
          goal={goal}
          onGoalChange={setGoal}
          onNext={handleNext}
          onBack={undefined} // No back on first step, use alert instead
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {currentStep === 2 && (
        <CurrentFitnessStep
          fitness={fitness}
          onFitnessChange={setFitness}
          onNext={handleNext}
          onBack={handleBack}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          currentCTL={currentCTL}
        />
      )}

      {currentStep === 3 && (
        <SportMixStep
          activities={activities}
          onActivitiesChange={setActivities}
          onNext={handleNext}
          onBack={handleBack}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {currentStep === 4 && (
        <AvailabilityStep
          constraints={constraints}
          onConstraintsChange={setConstraints}
          onNext={handleNext}
          onBack={handleBack}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
        />
      )}

      {currentStep === 5 && (
        <ExperienceLevelStep
          experienceLevel={experienceLevel}
          intensityPreset={intensityPreset}
          onExperienceLevelChange={setExperienceLevel}
          onIntensityPresetChange={setIntensityPreset}
          onNext={handleNext}
          onBack={handleBack}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
        />
      )}
    </View>
  );
}
