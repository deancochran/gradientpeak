import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChevronLeft, ChevronRight, Save } from "lucide-react-native";
import { View } from "react-native";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  onSkip?: () => void;
  isSubmitting?: boolean;
  showSkip?: boolean;
  nextButtonLabel?: string;
  submitButtonLabel?: string;
}

/**
 * Wizard navigation component
 * Provides back, next, skip, and submit buttons based on current step
 */
export function WizardNavigation({
  currentStep,
  totalSteps,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  onSubmit,
  onSkip,
  isSubmitting = false,
  showSkip = false,
  nextButtonLabel = "Next",
  submitButtonLabel = "Create Plan",
}: WizardNavigationProps) {
  return (
    <View className="border-t border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        {/* Back Button */}
        {!isFirstStep && (
          <Button
            variant="outline"
            onPress={onBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            <View className="flex-row items-center gap-2">
              <Icon as={ChevronLeft} size={18} className="text-foreground" />
              <Text className="text-foreground font-medium">Back</Text>
            </View>
          </Button>
        )}

        {/* Skip Button (optional, for last step only) */}
        {showSkip && isLastStep && !isSubmitting && (
          <Button
            variant="ghost"
            onPress={onSkip}
            className="flex-1"
          >
            <Text className="text-muted-foreground font-medium">
              Skip (Optional)
            </Text>
          </Button>
        )}

        {/* Next/Submit Button */}
        {!isLastStep ? (
          <Button
            onPress={onNext}
            disabled={isSubmitting}
            className="flex-1"
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-primary-foreground font-semibold">
                {nextButtonLabel}
              </Text>
              <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
            </View>
          </Button>
        ) : (
          <Button
            onPress={onSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            <View className="flex-row items-center gap-2">
              {isSubmitting ? (
                <>
                  <Text className="text-primary-foreground font-semibold">
                    Creating...
                  </Text>
                </>
              ) : (
                <>
                  <Icon as={Save} size={18} className="text-primary-foreground" />
                  <Text className="text-primary-foreground font-semibold">
                    {submitButtonLabel}
                  </Text>
                </>
              )}
            </View>
          </Button>
        )}
      </View>

      {/* Helper Text */}
      {!isLastStep && (
        <Text className="text-xs text-muted-foreground text-center mt-2">
          {totalSteps - currentStep} step{totalSteps - currentStep !== 1 ? "s" : ""} remaining
        </Text>
      )}
    </View>
  );
}
