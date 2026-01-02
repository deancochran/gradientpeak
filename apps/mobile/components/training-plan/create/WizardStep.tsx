import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";

interface WizardStepProps {
  /** Current step number (1-based) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Step title */
  title: string;
  /** Optional step description */
  description?: string;
  /** Children components (form fields) */
  children: React.ReactNode;
  /** Called when back button is pressed */
  onBack?: () => void;
  /** Called when next/finish button is pressed */
  onNext: () => void;
  /** Whether the next button should be disabled */
  nextDisabled?: boolean;
  /** Whether we're currently submitting/processing */
  isSubmitting?: boolean;
  /** Custom text for next button (default: "Next" or "Finish" on last step) */
  nextButtonText?: string;
  /** Whether to show the back button (default: true) */
  showBackButton?: boolean;
}

export function WizardStep({
  currentStep,
  totalSteps,
  title,
  description,
  children,
  onBack,
  onNext,
  nextDisabled = false,
  isSubmitting = false,
  nextButtonText,
  showBackButton = true,
}: WizardStepProps) {
  const isLastStep = currentStep === totalSteps;
  const defaultNextText = isLastStep ? "Review Plan" : "Next";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* Progress Indicator */}
      <View className="bg-card border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm text-muted-foreground">
            Step {currentStep} of {totalSteps}
          </Text>
          <Text className="text-sm font-medium text-foreground">
            {Math.round((currentStep / totalSteps) * 100)}%
          </Text>
        </View>

        {/* Progress Bar */}
        <View className="h-2 bg-muted rounded-full overflow-hidden">
          <View
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </View>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-foreground mb-2">
            {title}
          </Text>
          {description && (
            <Text className="text-muted-foreground">{description}</Text>
          )}
        </View>

        {/* Step Content */}
        <View className="gap-4">{children}</View>
      </ScrollView>

      {/* Footer Navigation */}
      <View className="border-t border-border bg-card px-4 py-3">
        <View className="flex-row gap-3">
          {showBackButton && onBack && (
            <Button
              variant="outline"
              onPress={onBack}
              disabled={isSubmitting}
              className="flex-1"
            >
              <ChevronLeft size={20} className="text-foreground" />
              <Text>Back</Text>
            </Button>
          )}

          <Button
            onPress={onNext}
            disabled={nextDisabled || isSubmitting}
            className={showBackButton && onBack ? "flex-1" : "w-full"}
          >
            <Text>{nextButtonText || defaultNextText}</Text>
            {!isLastStep && (
              <ChevronRight size={20} className="text-primary-foreground" />
            )}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
