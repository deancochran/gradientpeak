import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  nextButtonLabel?: string;
  submitButtonLabel?: string;
}

/**
 * Simplified wizard navigation
 * Clean back/next/submit buttons without clutter
 */
export function WizardNavigation({
  currentStep,
  totalSteps,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  onSubmit,
  isSubmitting = false,
  nextButtonLabel = "Continue",
  submitButtonLabel = "Create Plan",
}: WizardNavigationProps) {
  return (
    <View className="border-t border-border bg-card px-4 py-3">
      <View className="flex-row items-center gap-3">
        {/* Back Button */}
        {!isFirstStep && (
          <Button
            variant="outline"
            onPress={onBack}
            disabled={isSubmitting}
            className="w-12 h-12"
            size="icon"
          >
            <Icon as={ChevronLeft} size={20} className="text-foreground" />
          </Button>
        )}

        {/* Next/Submit Button */}
        {!isLastStep ? (
          <Button onPress={onNext} disabled={isSubmitting} className="flex-1">
            <Text className="text-primary-foreground font-semibold">
              {nextButtonLabel}
            </Text>
          </Button>
        ) : (
          <Button onPress={onSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-primary-foreground font-semibold">
                  Creating...
                </Text>
              </View>
            ) : (
              <Text className="text-primary-foreground font-semibold">
                {submitButtonLabel}
              </Text>
            )}
          </Button>
        )}
      </View>
    </View>
  );
}
