import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import {
  ActivityPayload,
  ActivityPayloadSchema,
  formatDurationCompact,
  getDurationMs,
  getIntensityColor,
} from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Play,
  Target,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

export default function FollowAlongScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [workout, setWorkout] = useState<any>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from payload
  useEffect(() => {
    const initializeFromPayload = async () => {
      try {
        if (params.payload && typeof params.payload === "string") {
          const payloadData = JSON.parse(decodeURIComponent(params.payload));
          const validatedPayload = ActivityPayloadSchema.safeParse(payloadData);

          if (!validatedPayload.success) {
            Alert.alert("Error", "Invalid workout data. Please try again.");
            router.back();
            return;
          }

          const payload: ActivityPayload = validatedPayload.data;

          if (!payload.plan) {
            Alert.alert("Error", "No workout plan found.");
            router.back();
            return;
          }

          setWorkout(payload.plan);
        } else {
          Alert.alert("Error", "No workout data provided.");
          router.back();
          return;
        }
      } catch (error) {
        console.error("[FollowAlong] Error initializing:", error);
        Alert.alert("Error", "Failed to load workout.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    initializeFromPayload();
  }, [params.payload, router]);

  // Get flattened steps
  const steps = workout?.structure?.steps
    ? flattenSteps(workout.structure.steps)
    : [];
  const currentStep = steps[currentStepIndex];
  const progress =
    steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  // Start recording with the same payload
  const handleStartRecording = () => {
    if (params.payload) {
      router.push(`/record?payload=${params.payload}` as any);
    }
  };

  // Navigation
  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Loading workout...</Text>
      </View>
    );
  }

  // Show error if no workout
  if (!workout) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Icon as={Target} size={48} className="text-muted-foreground mb-4" />
        <Text className="text-lg font-semibold mb-2">Workout Not Found</Text>
        <Text className="text-muted-foreground text-center mb-6">
          Unable to load the workout plan.
        </Text>
        <Button onPress={() => router.back()}>
          <Text>Go Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border bg-card">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => router.back()}
          className="mr-2"
        >
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <View className="flex-1 items-center">
          <Text className="text-lg font-semibold">{workout.name}</Text>
          <Text className="text-sm text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1">
        {/* Workout Progress */}
        <View className="p-4 bg-card border-b border-border">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-medium">Workout Progress</Text>
            <Text className="text-sm text-muted-foreground">
              {Math.round(progress)}%
            </Text>
          </View>
          <Progress value={progress} className="h-2" />
        </View>

        {/* Workout Description */}
        {workout.description && (
          <View className="p-4 border-b border-border">
            <Text className="text-muted-foreground">{workout.description}</Text>
          </View>
        )}

        {/* Current Step */}
        {currentStep && (
          <View className="p-4">
            <StepCard step={currentStep} stepNumber={currentStepIndex + 1} />
          </View>
        )}

        {/* Step Navigation */}
        <View className="p-4 border-t border-border">
          <View className="flex-row justify-between">
            <Button
              variant="outline"
              onPress={goToPreviousStep}
              disabled={currentStepIndex === 0}
              className="flex-1 mr-2"
            >
              <Icon as={ChevronLeft} size={16} className="mr-1" />
              <Text>Previous</Text>
            </Button>
            <Button
              variant="outline"
              onPress={goToNextStep}
              disabled={currentStepIndex === steps.length - 1}
              className="flex-1 ml-2"
            >
              <Text>Next</Text>
              <Icon as={ChevronRight} size={16} className="ml-1" />
            </Button>
          </View>
        </View>

        {/* Workout Overview */}
        <View className="p-4 border-t border-border">
          <Text className="text-lg font-semibold mb-3">Workout Overview</Text>
          <View className="gap-2">
            {steps.map((step, index) => (
              <StepSummary
                key={index}
                step={step}
                stepNumber={index + 1}
                isActive={index === currentStepIndex}
                onPress={() => setCurrentStepIndex(index)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Footer - Start Recording */}
      <View className="p-4 border-t border-border bg-card">
        <Button
          onPress={handleStartRecording}
          className="w-full h-14 rounded-xl"
        >
          <Icon as={Play} size={24} className="color-background mr-3" />
          <Text className="font-semibold text-lg">Start Recording</Text>
        </Button>
      </View>
    </View>
  );
}

// Step Card Component
interface StepCardProps {
  step: any;
  stepNumber: number;
}

function StepCard({ step, stepNumber }: StepCardProps) {
  const stepDurationMs = step.duration ? getDurationMs(step.duration) : 0;

  return (
    <View className="bg-card border border-border rounded-xl p-4">
      {/* Step Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1">
          <Text className="text-xl font-bold">
            Step {stepNumber}: {step.name || "Exercise"}
          </Text>
          {step.description && (
            <Text className="text-muted-foreground mt-1">
              {step.description}
            </Text>
          )}
        </View>
        {stepDurationMs > 0 && (
          <View className="items-end">
            <Icon as={Clock} size={16} className="text-muted-foreground mb-1" />
            <Text className="text-sm font-medium">
              {formatDurationCompact(stepDurationMs / 1000)}
            </Text>
          </View>
        )}
      </View>

      {/* Duration Info */}
      {step.duration && step.duration !== "untilFinished" && (
        <View className="mb-3 p-3 bg-muted rounded-lg">
          <Text className="text-sm font-medium mb-1">Duration</Text>
          <Text className="text-lg">
            {step.duration.value} {step.duration.unit}
          </Text>
        </View>
      )}

      {/* Targets */}
      {step.targets && step.targets.length > 0 && (
        <View className="mb-3">
          <Text className="text-sm font-semibold mb-2">Target Zones</Text>
          <View className="gap-2">
            {step.targets.map((target: any, index: number) => (
              <TargetCard key={index} target={target} />
            ))}
          </View>
        </View>
      )}

      {/* Notes */}
      {step.notes && (
        <View className="mt-3 p-3 bg-muted rounded-lg">
          <Text className="text-sm font-medium mb-1">Notes</Text>
          <Text className="text-sm">{step.notes}</Text>
        </View>
      )}
    </View>
  );
}

// Target Card Component
interface TargetCardProps {
  target: any;
}

function TargetCard({ target }: TargetCardProps) {
  const intensity = target.intensity || 0;
  const color = getIntensityColor(intensity, target.type);

  return (
    <View className="flex-row items-center justify-between p-3 border border-border rounded-lg">
      <View className="flex-1">
        <Text className="font-medium">{getTargetDisplayName(target.type)}</Text>
        <Text className="text-sm text-muted-foreground">
          Target: {intensity}
          {getTargetUnit(target.type)}
        </Text>
      </View>
      <View
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: color }}
      />
    </View>
  );
}

// Step Summary Component
interface StepSummaryProps {
  step: any;
  stepNumber: number;
  isActive: boolean;
  onPress: () => void;
}

function StepSummary({
  step,
  stepNumber,
  isActive,
  onPress,
}: StepSummaryProps) {
  const stepDurationMs = step.duration ? getDurationMs(step.duration) : 0;

  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      onPress={onPress}
      className="h-auto p-3 justify-start"
    >
      <View className="flex-row items-center w-full">
        <View className="flex-1">
          <Text
            className={`font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}
          >
            {stepNumber}. {step.name || "Exercise"}
          </Text>
          {stepDurationMs > 0 && (
            <Text className="text-xs text-muted-foreground">
              {formatDurationCompact(stepDurationMs / 1000)}
            </Text>
          )}
        </View>
        {isActive && <Icon as={Play} size={16} className="text-primary" />}
      </View>
    </Button>
  );
}

// Helper Functions
function flattenSteps(steps: any[], result: any[] = []): any[] {
  for (const step of steps) {
    if (step.type === "step") {
      result.push(step);
    } else if (step.type === "repetition") {
      for (let i = 0; i < step.repeat; i++) {
        for (const subStep of step.steps) {
          result.push({
            ...subStep,
            name: `${subStep.name || "Exercise"} (${i + 1}/${step.repeat})`,
          });
        }
      }
    }
  }
  return result;
}

function getTargetDisplayName(type: string): string {
  switch (type) {
    case "%FTP":
      return "Power (FTP)";
    case "%MaxHR":
      return "Heart Rate (Max)";
    case "%ThresholdHR":
      return "Heart Rate (LT)";
    case "watts":
      return "Power";
    case "bpm":
      return "Heart Rate";
    case "speed":
      return "Speed";
    case "cadence":
      return "Cadence";
    case "RPE":
      return "Effort (RPE)";
    default:
      return type;
  }
}

function getTargetUnit(type: string): string {
  switch (type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return "%";
    case "watts":
      return "W";
    case "bpm":
      return " bpm";
    case "speed":
      return " km/h";
    case "cadence":
      return " rpm";
    case "RPE":
      return "/10";
    default:
      return "";
  }
}
