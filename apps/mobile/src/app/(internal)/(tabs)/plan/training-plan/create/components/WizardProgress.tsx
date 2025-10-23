import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
  stepTitles: string[];
}

/**
 * Wizard progress indicator component
 * Shows current step number, progress bar, and step title
 */
export function WizardProgress({
  currentStep,
  totalSteps,
  stepTitles,
}: WizardProgressProps) {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <View className="mb-6">
      {/* Step Counter */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {Math.round(progressPercentage)}% Complete
        </Text>
      </View>

      {/* Progress Bar */}
      <View className="bg-muted rounded-full h-2 overflow-hidden mb-3">
        <View
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </View>

      {/* Current Step Title */}
      <Text className="text-2xl font-bold">
        {stepTitles[currentStep - 1]}
      </Text>

      {/* Step Indicators */}
      <View className="flex-row items-center justify-between mt-4">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <View
              key={stepNumber}
              className="flex-1 flex-row items-center"
            >
              {/* Step Circle */}
              <View
                className={`w-8 h-8 rounded-full items-center justify-center ${
                  isCompleted
                    ? "bg-primary"
                    : isCurrent
                    ? "bg-primary border-2 border-primary"
                    : "bg-muted border-2 border-muted-foreground/30"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isCompleted || isCurrent
                      ? "text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {stepNumber}
                </Text>
              </View>

              {/* Connecting Line (except for last step) */}
              {index < totalSteps - 1 && (
                <View
                  className={`flex-1 h-0.5 mx-1 ${
                    isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
