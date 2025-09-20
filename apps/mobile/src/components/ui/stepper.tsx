import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";

interface StepperContextType {
  currentStep: number;
  totalSteps: number;
  activeSteps: number[];
  goToNext: () => void;
  goToPrev: () => void;
  goToStep: (step: number) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  validateStep?: (step: number) => boolean;
  isStepValid: (step: number) => boolean;
}

const StepperContext = createContext<StepperContextType | undefined>(undefined);

function useStepper() {
  const context = useContext(StepperContext);
  if (!context) {
    throw new Error("useStepper must be used within a Stepper");
  }
  return context;
}

interface StepperProps {
  children: React.ReactNode;
  initialStep?: number;
  onComplete?: () => void;
  onStepChange?: (step: number) => void;
  validateStep?: (step: number) => boolean;
  resetOnMount?: boolean;
  className?: string;
}

function Stepper({
  children,
  initialStep = 0,
  onComplete,
  onStepChange,
  validateStep,
  resetOnMount = false,
  className,
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Reset to initial step on mount if specified
  useEffect(() => {
    if (resetOnMount) {
      setCurrentStep(initialStep);
    }
  }, [resetOnMount, initialStep]);

  // Filter valid steps based on conditions
  const validSteps = useMemo(() => {
    const steps = React.Children.toArray(children);
    return steps.filter((child, index) => {
      if (!React.isValidElement(child) || child.type !== StepperStep) {
        return false;
      }
      const props = child.props as StepperStepProps;
      return props.condition !== false;
    });
  }, [children]);

  // Get indices of valid steps in the original children array
  const activeSteps = useMemo(() => {
    const steps = React.Children.toArray(children);
    const indices: number[] = [];
    steps.forEach((child, index) => {
      if (React.isValidElement(child) && child.type === StepperStep) {
        const props = child.props as StepperStepProps;
        if (props.condition !== false) {
          indices.push(index);
        }
      }
    });
    return indices;
  }, [children]);

  const totalSteps = validSteps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;
  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < totalSteps - 1;

  const isStepValid = (step: number): boolean => {
    if (validateStep) {
      return validateStep(step);
    }
    return true;
  };

  const goToStep = (step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
      onStepChange?.(step);
    }
  };

  const goToNext = () => {
    if (canGoNext && isStepValid(currentStep)) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onStepChange?.(nextStep);
    } else if (isLastStep && isStepValid(currentStep) && onComplete) {
      onComplete();
    }
  };

  const goToPrev = () => {
    if (canGoPrev) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onStepChange?.(prevStep);
    }
  };

  const contextValue: StepperContextType = {
    currentStep,
    totalSteps,
    activeSteps,
    goToNext,
    goToPrev,
    goToStep,
    canGoNext,
    canGoPrev,
    isFirstStep,
    isLastStep,
    validateStep,
    isStepValid,
  };

  return (
    <StepperContext.Provider value={contextValue}>
      <View className={cn("flex-1", className)}>
        <StepperIndicator />
        <View className="flex-1">{validSteps[currentStep]}</View>
        <StepperControls />
      </View>
    </StepperContext.Provider>
  );
}

interface StepperIndicatorProps {
  showLabels?: boolean;
  variant?: "dots" | "progress" | "numbered";
  className?: string;
}

function StepperIndicator({
  showLabels = false,
  variant = "dots",
  className,
}: StepperIndicatorProps = {}) {
  const { currentStep, totalSteps } = useStepper();

  if (variant === "progress") {
    const progress = ((currentStep + 1) / totalSteps) * 100;
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
        <View className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <View
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>
    );
  }

  if (variant === "numbered") {
    return (
      <View className={cn("flex-row justify-center p-4", className)}>
        {Array.from({ length: totalSteps }).map((_, index) => (
          <View
            key={index}
            className={cn(
              "w-8 h-8 rounded-full mx-1 items-center justify-center border-2",
              index === currentStep
                ? "bg-primary border-primary"
                : index < currentStep
                  ? "bg-primary/20 border-primary"
                  : "bg-muted border-muted-foreground/20",
            )}
          >
            <Text
              className={cn(
                "text-xs font-medium",
                index === currentStep
                  ? "text-primary-foreground"
                  : index < currentStep
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {index + 1}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // Default dots variant
  return (
    <View className={cn("flex-row justify-center p-4", className)}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          className={cn(
            "w-3 h-3 rounded-full mx-1 transition-all duration-200",
            index === currentStep
              ? "bg-primary scale-110"
              : index < currentStep
                ? "bg-primary/60"
                : "bg-muted",
          )}
        />
      ))}
    </View>
  );
}

interface StepperControlsProps {
  backLabel?: string;
  nextLabel?: string;
  completeLabel?: string;
  hideBackOnFirst?: boolean;
  className?: string;
}

function StepperControls({
  backLabel = "Back",
  nextLabel = "Next",
  completeLabel = "Begin Activity",
  hideBackOnFirst = false,
  className,
}: StepperControlsProps = {}) {
  const {
    goToNext,
    goToPrev,
    canGoNext,
    canGoPrev,
    isFirstStep,
    isLastStep,
    isStepValid,
    currentStep,
  } = useStepper();

  const showBackButton = canGoPrev && !(hideBackOnFirst && isFirstStep);
  const isCurrentStepValid = isStepValid(currentStep);

  return (
    <View className={cn("p-6 border-t border-border bg-background", className)}>
      <View className="flex-row justify-between items-center">
        {showBackButton ? (
          <Button variant="outline" onPress={goToPrev} size="default">
            <Text>{backLabel}</Text>
          </Button>
        ) : (
          <View />
        )}

        <View className={cn(!showBackButton && "ml-auto")}>
          {isLastStep ? (
            <Button
              onPress={goToNext}
              disabled={!isCurrentStepValid}
              size="default"
            >
              <Text>{completeLabel}</Text>
            </Button>
          ) : (
            <Button
              onPress={goToNext}
              disabled={!isCurrentStepValid}
              size="default"
            >
              <Text>{nextLabel}</Text>
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}

interface StepperStepProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  condition?: boolean;
  className?: string;
  contentClassName?: string;
}

function StepperStep({
  children,
  title,
  description,
  condition = true,
  className,
  contentClassName,
}: StepperStepProps) {
  // Note: condition filtering is handled in the parent Stepper component
  // This component just renders the step content

  return (
    <View className={cn("flex-1", className)}>
      {(title || description) && (
        <View className="px-6 py-4 border-b border-border/50">
          {title && (
            <Text className="text-xl font-semibold text-foreground mb-1">
              {title}
            </Text>
          )}
          {description && (
            <Text className="text-sm text-muted-foreground">{description}</Text>
          )}
        </View>
      )}
      <View className={cn("flex-1 px-6 py-4", contentClassName)}>
        {children}
      </View>
    </View>
  );
}

// Enhanced compound component pattern
Stepper.Step = StepperStep;
Stepper.Indicator = StepperIndicator;
Stepper.Controls = StepperControls;

// Hook for external access
export { Stepper, useStepper };
export type {
  StepperControlsProps,
  StepperIndicatorProps,
  StepperProps,
  StepperStepProps,
};
