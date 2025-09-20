import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import React, { createContext, useContext, useState } from "react";
import { View } from "react-native";

interface StepperContextType {
  currentStep: number;
  totalSteps: number;
  goToNext: () => void;
  goToPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
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
  className?: string;
}

function Stepper({
  children,
  initialStep = 0,
  onComplete,
  className,
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const steps = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && child.type === StepperStep,
  );
  const totalSteps = steps.length;

  const canGoNext = currentStep < totalSteps - 1;
  const canGoPrev = currentStep > 0;

  const goToNext = () => {
    if (canGoNext) {
      setCurrentStep((prev) => prev + 1);
    } else if (onComplete) {
      onComplete();
    }
  };

  const goToPrev = () => {
    if (canGoPrev) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <StepperContext.Provider
      value={{
        currentStep,
        totalSteps,
        goToNext,
        goToPrev,
        canGoNext,
        canGoPrev,
      }}
    >
      <View className={cn("flex-1", className)}>
        <StepperIndicator />
        {steps[currentStep]}
        <StepperControls />
      </View>
    </StepperContext.Provider>
  );
}

function StepperIndicator() {
  const { currentStep, totalSteps } = useStepper();

  return (
    <View className="flex-row justify-center p-4">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          className={cn(
            "w-3 h-3 rounded-full mx-1 transition-colors",
            index === currentStep ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </View>
  );
}

function StepperControls() {
  const { currentStep, totalSteps, goToNext, goToPrev, canGoNext, canGoPrev } =
    useStepper();

  return (
    <View className="p-6 border-t border-border">
      <View className="flex-row justify-between">
        {canGoPrev && (
          <Button variant="outline" onPress={goToPrev}>
            Back
          </Button>
        )}
        <View className={cn(!canGoPrev && "ml-auto")}>
          {currentStep < totalSteps - 1 ? (
            <Button onPress={goToNext}>Next</Button>
          ) : (
            <Button onPress={goToNext}>Begin Activity</Button>
          )}
        </View>
      </View>
    </View>
  );
}

interface StepperStepProps {
  children: React.ReactNode;
  title?: string;
  condition?: boolean;
  className?: string;
}

function StepperStep({
  children,
  title,
  condition = true,
  className,
}: StepperStepProps) {
  const { currentStep } = useStepper();

  if (!condition) {
    return null;
  }

  return (
    <View className={cn("flex-1", className)}>
      {title && (
        <Text variant="h3" className="px-6 pb-4">
          {title}
        </Text>
      )}
      <View className="flex-1">{children}</View>
    </View>
  );
}

// Assign sub-components
Stepper.Step = StepperStep;
Stepper.Indicator = StepperIndicator;
Stepper.Controls = StepperControls;

export { Stepper };
export type { StepperProps, StepperStepProps };
