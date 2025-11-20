import { View } from "react-native";

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
}

/**
 * Minimal progress indicator showing current step progress
 */
export function WizardProgress({
  currentStep,
  totalSteps,
}: WizardProgressProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <View className="mt-3">
      <View className="h-1 bg-muted rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </View>
    </View>
  );
}
