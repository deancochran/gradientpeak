import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import React, {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useState,
} from "react";
import { ScrollView, View } from "react-native";

interface StepperContextType {
  currentStep: number;
  totalSteps: number;
  goToNext: () => void;
  goToPrev: () => void;
  goToStep: (step: number) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  progress: number;
}

const StepperContext = createContext<StepperContextType | undefined>(undefined);

function useStepper() {
  const context = useContext(StepperContext);
  if (!context) {
    throw new Error("useStepper must be used within a Stepper");
  }
  return context;
}

export interface StepperActions {
  goToNext: () => void;
  goToPrev: () => void;
  goToStep: (step: number) => void;
}

interface StepperProps {
  children: React.ReactNode;
  initialStep?: number;
  onComplete?: () => void;
  onStepChange?: (step: number) => void;
  className?: string;
  header?: (context: StepperContextType) => React.ReactNode;
  footer?: (context: StepperContextType) => React.ReactNode;
  scrollable?: boolean;
  showScrollIndicator?: boolean;
}

const Stepper = forwardRef<StepperActions, StepperProps>(
  (
    {
      children,
      initialStep = 0,
      onComplete,
      onStepChange,
      className,
      header,
      footer,
      scrollable = true,
      showScrollIndicator = false,
    },
    ref,
  ) => {
    const [currentStep, setCurrentStep] = useState(initialStep);

    const steps = React.Children.toArray(children);
    const totalSteps = steps.length;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep >= totalSteps - 1;
    const canGoPrev = currentStep > 0;
    const canGoNext = currentStep < totalSteps - 1;
    const progress =
      totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;

    const goToStep = (step: number) => {
      if (step >= 0 && step < totalSteps) {
        setCurrentStep(step);
        onStepChange?.(step);
      }
    };

    const goToNext = () => {
      if (canGoNext) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        onStepChange?.(nextStep);
      } else if (isLastStep) {
        onComplete?.();
      }
    };

    const goToPrev = () => {
      if (canGoPrev) {
        const prevStep = currentStep - 1;
        setCurrentStep(prevStep);
        onStepChange?.(prevStep);
      }
    };

    useImperativeHandle(ref, () => ({
      goToNext,
      goToPrev,
      goToStep,
    }));

    const contextValue: StepperContextType = {
      currentStep,
      totalSteps,
      goToNext,
      goToPrev,
      goToStep,
      canGoNext,
      canGoPrev,
      isFirstStep,
      isLastStep,
      progress,
    };

    const StepContent = () => {
      if (scrollable) {
        return (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={showScrollIndicator}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {steps[currentStep]}
          </ScrollView>
        );
      }

      return <View className="flex-1">{steps[currentStep]}</View>;
    };

    return (
      <StepperContext.Provider value={contextValue}>
        <View className={cn("flex-1", className)}>
          {/* Dynamic Header */}
          {header && <View>{header(contextValue)}</View>}

          {/* Current Step Content - Now Scrollable */}
          <StepContent />

          {/* Dynamic Footer */}
          {footer && <View>{footer(contextValue)}</View>}
        </View>
      </StepperContext.Provider>
    );
  },
);

Stepper.displayName = "Stepper";

interface StepProps {
  children: React.ReactNode;
  className?: string;
}

function Step({ children, className }: StepProps) {
  return <View className={cn("flex-1", className)}>{children}</View>;
}

// Simple Progress Indicator Component
function ProgressIndicator({ className }: { className?: string }) {
  const { currentStep, totalSteps, progress } = useStepper();

  return (
    <View className={cn("px-6 py-4", className)}>
      <View className="flex-row justify-between mb-2">
        <Text className="text-sm text-muted-foreground">
          Step {currentStep + 1} of {totalSteps}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {Math.round(progress)}%
        </Text>
      </View>
      <View className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </View>
    </View>
  );
}

// Simple Controls Component
function Controls({
  backLabel = "Back",
  nextLabel = "Next",
  completeLabel = "Complete",
  className,
}: {
  backLabel?: string;
  nextLabel?: string;
  completeLabel?: string;
  className?: string;
}) {
  const { goToNext, goToPrev, canGoPrev, isLastStep } = useStepper();

  return (
    <View className={cn("p-6 border-t border-border", className)}>
      <View className="flex-row justify-between">
        {canGoPrev ? (
          <Button variant="outline" onPress={goToPrev}>
            <Text>{backLabel}</Text>
          </Button>
        ) : (
          <View />
        )}

        <Button onPress={goToNext}>
          <Text>{isLastStep ? completeLabel : nextLabel}</Text>
        </Button>
      </View>
    </View>
  );
}

// Attach components for compound pattern
const StepperWithSubComponents = Stepper as typeof Stepper & {
  Step: typeof Step;
  Progress: typeof ProgressIndicator;
  Controls: typeof Controls;
};

StepperWithSubComponents.Step = Step;
StepperWithSubComponents.Progress = ProgressIndicator;
StepperWithSubComponents.Controls = Controls;

export { StepperWithSubComponents as Stepper, useStepper };
export type { StepperProps, StepProps };
