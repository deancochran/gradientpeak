import React, { memo, useState, useEffect } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  Activity,
  Clock,
  Zap,
  Play,
  Timer,
  ChevronRight,
  Target,
} from "lucide-react-native";
import { ActivityPlanStructure } from "@repo/core";
import { useMetric } from "@/lib/hooks/useActivityRecorderEvents";
import {
  WorkoutGraph,
  WorkoutProgressGraph,
  WorkoutMetricsGrid,
  TargetMetricsGrid,
  StepBreakdown,
  UpcomingStepsPreview,
} from "./WorkoutVisualization";
import {
  extractWorkoutProfile,
  calculateWorkoutStats,
  formatDuration,
  formatDurationCompact,
  flattenPlanSteps,
} from "./utils";

// ================================
// Types
// ================================

interface EnhancedPlanCardProps {
  planProgress?: any;
  activityPlan?: any;
  state?: string;
  onNextStep?: () => void;
  isAdvancing?: boolean;
  service?: any;
  style?: { width: number };
  className?: string;
}

interface CurrentMetrics {
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
}

// ================================
// Plan Card Header
// ================================

const PlanCardHeader = memo<{
  activityPlan: any;
  viewMode: "preview" | "active";
  onModeChange: (mode: "preview" | "active") => void;
  canToggle: boolean;
}>(function PlanCardHeader({
  activityPlan,
  viewMode,
  onModeChange,
  canToggle,
}) {
  const workoutStats = calculateWorkoutStats(activityPlan.structure);

  return (
    <View className="mb-4">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-4">
          <Text className="text-lg font-semibold">{activityPlan.name}</Text>
          {activityPlan.description && (
            <Text className="text-sm text-muted-foreground mt-1">
              {activityPlan.description}
            </Text>
          )}
        </View>

        {/* Mode Toggle */}
        {canToggle && (
          <View className="flex-row bg-muted rounded-md p-1">
            <Pressable
              onPress={() => onModeChange("preview")}
              className={`px-3 py-1.5 rounded-sm ${
                viewMode === "preview" ? "bg-background shadow-sm" : ""
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  viewMode === "preview"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Preview
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onModeChange("active")}
              className={`px-3 py-1.5 rounded-sm ${
                viewMode === "active" ? "bg-background shadow-sm" : ""
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  viewMode === "active"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Active
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Workout Stats Summary */}
      <View className="flex-row gap-4 mt-3">
        <View className="flex-row items-center gap-1">
          <Icon as={Clock} size={14} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            {formatDurationCompact(workoutStats.totalDuration)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon as={Activity} size={14} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            {workoutStats.totalSteps} steps
          </Text>
        </View>
        {workoutStats.avgPower > 0 && (
          <View className="flex-row items-center gap-1">
            <Icon as={Zap} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {Math.round(workoutStats.avgPower)}% avg
            </Text>
          </View>
        )}
        {workoutStats.intervalCount > 0 && (
          <View className="flex-row items-center gap-1">
            <Icon as={Target} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {workoutStats.intervalCount} intervals
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

PlanCardHeader.displayName = "PlanCardHeader";

// ================================
// Workout Preview Mode
// ================================

const WorkoutPreviewMode = memo<{ structure: ActivityPlanStructure }>(
  function WorkoutPreviewMode({ structure }) {
    const profileData = extractWorkoutProfile(structure);

    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Workout Graph */}
        <View className="mb-6">
          <WorkoutGraph structure={structure} />
        </View>

        {/* Key Workout Metrics */}
        <WorkoutMetricsGrid structure={structure} />

        {/* Step Breakdown Preview */}
        <StepBreakdown
          steps={profileData.slice(0, 6)}
          maxSteps={6}
          showAll={false}
          title="Workout Steps"
        />

        {/* Ready to Start */}
        <View className="flex-1 items-center justify-center py-8 min-h-32">
          <View className="items-center">
            <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-4">
              <Icon as={Play} size={32} className="text-primary ml-1" />
            </View>
            <Text className="text-lg font-medium text-center mb-2">
              Ready to start workout
            </Text>
            <Text className="text-center text-sm text-muted-foreground max-w-64">
              Press Start Activity to begin your planned training session
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  },
);

WorkoutPreviewMode.displayName = "WorkoutPreviewMode";

// ================================
// Progress Tracking Display
// ================================

const ProgressTrackingDisplay = memo<{
  planProgress: any;
  structure: ActivityPlanStructure;
  currentMetrics: CurrentMetrics;
}>(function ProgressTrackingDisplay({
  planProgress,
  structure,
  currentMetrics,
}) {
  const overallProgress =
    (planProgress.completedSteps / planProgress.totalSteps) * 100;
  const stepProgress =
    planProgress.duration > 0
      ? (planProgress.elapsedInStep / planProgress.duration) * 100
      : 0;

  return (
    <View className="mb-6">
      {/* Big Picture Progress */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium">Workout Progress</Text>
          <Text className="text-sm text-muted-foreground">
            {Math.round(overallProgress)}%
          </Text>
        </View>

        {/* Overall progress bar */}
        <View className="h-3 bg-muted rounded-full overflow-hidden mb-3">
          <View
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </View>

        {/* Mini workout graph with current position indicator */}
        <WorkoutProgressGraph
          structure={structure}
          currentStep={planProgress.currentStepIndex}
          className="h-8 mb-2"
        />

        <Text className="text-xs text-muted-foreground">
          Step {planProgress.currentStepIndex + 1} of {planProgress.totalSteps}
        </Text>
      </View>

      {/* Fine-grained Step Progress */}
      <View>
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium">Current Step Progress</Text>
          <Text className="text-sm text-muted-foreground">
            {formatDuration(planProgress.elapsedInStep / 1000)} /{" "}
            {formatDuration(planProgress.duration / 1000)}
          </Text>
        </View>

        <View className="h-2 bg-muted rounded-full overflow-hidden">
          <View
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(stepProgress, 100)}%` }}
          />
        </View>
      </View>
    </View>
  );
});

ProgressTrackingDisplay.displayName = "ProgressTrackingDisplay";

// ================================
// Current Step Display
// ================================

const CurrentStepDisplay = memo<{
  planProgress: any;
  currentMetrics: CurrentMetrics;
  onNextStep?: () => void;
  isAdvancing: boolean;
  structure: ActivityPlanStructure;
}>(function CurrentStepDisplay({
  planProgress,
  currentMetrics,
  onNextStep,
  isAdvancing,
  structure,
}) {
  const flattenedSteps = flattenPlanSteps(structure.steps);
  const currentStep = flattenedSteps[planProgress.currentStepIndex];
  const stepTargets = planProgress.targets;

  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-sm font-medium">Current Step</Text>
        {onNextStep && planProgress.duration === 0 && (
          <Button
            variant="outline"
            size="sm"
            onPress={onNextStep}
            disabled={isAdvancing}
            className="h-8 px-3"
          >
            <View className="flex-row items-center gap-1">
              {isAdvancing ? (
                <Icon as={Timer} size={14} className="text-muted-foreground" />
              ) : (
                <Icon
                  as={ChevronRight}
                  size={14}
                  className="text-muted-foreground"
                />
              )}
              <Text className="text-xs font-medium">
                {isAdvancing ? "Advancing..." : "Next Step"}
              </Text>
            </View>
          </Button>
        )}
      </View>

      {/* Current Step Details */}
      {currentStep && (
        <View className="p-4 bg-muted/20 rounded-lg mb-4">
          <View className="mb-3">
            <Text className="text-base font-semibold">
              {currentStep.name || `Step ${planProgress.currentStepIndex + 1}`}
            </Text>
            {currentStep.description && (
              <Text className="text-sm text-muted-foreground mt-1">
                {currentStep.description}
              </Text>
            )}
            {currentStep.notes && (
              <Text className="text-xs text-muted-foreground mt-2 italic">
                Note: {currentStep.notes}
              </Text>
            )}
          </View>

          {/* Step Duration Info */}
          <View className="flex-row items-center gap-2">
            <Icon as={Clock} size={16} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {planProgress.duration > 0
                ? `${formatDuration(planProgress.duration / 1000)} duration`
                : "Manual advancement"}
            </Text>
          </View>
        </View>
      )}

      {/* Target vs Current Metrics */}
      {stepTargets && (
        <TargetMetricsGrid
          targets={stepTargets}
          currentMetrics={currentMetrics}
        />
      )}
    </View>
  );
});

CurrentStepDisplay.displayName = "CurrentStepDisplay";

// ================================
// Active Workout Mode
// ================================

const ActiveWorkoutMode = memo<{
  planProgress?: any;
  activityPlan?: any;
  currentMetrics: CurrentMetrics;
  onNextStep?: () => void;
  isAdvancing: boolean;
  structure: ActivityPlanStructure;
}>(function ActiveWorkoutMode({
  planProgress,
  activityPlan,
  currentMetrics,
  onNextStep,
  isAdvancing,
  structure,
}) {
  if (!planProgress) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="items-center">
          <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center mb-4">
            <Icon as={Activity} size={32} className="text-muted-foreground" />
          </View>
          <Text className="text-lg font-medium text-center mb-2">
            Start recording to begin
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Press Start Activity to activate your plan
          </Text>
        </View>
      </View>
    );
  }

  const profileData = extractWorkoutProfile(structure);
  const upcomingSteps = profileData.slice(
    planProgress.currentStepIndex + 1,
    planProgress.currentStepIndex + 4,
  );

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      {/* Progress Overview */}
      <ProgressTrackingDisplay
        planProgress={planProgress}
        structure={structure}
        currentMetrics={currentMetrics}
      />

      {/* Current Step Details */}
      <CurrentStepDisplay
        planProgress={planProgress}
        currentMetrics={currentMetrics}
        onNextStep={onNextStep}
        isAdvancing={isAdvancing}
        structure={structure}
      />

      {/* Upcoming Steps Preview */}
      {upcomingSteps.length > 0 && (
        <UpcomingStepsPreview steps={upcomingSteps} title="Coming Up Next" />
      )}
    </ScrollView>
  );
});

ActiveWorkoutMode.displayName = "ActiveWorkoutMode";

// ================================
// Main Enhanced Plan Card
// ================================

export const EnhancedPlanCard = memo<EnhancedPlanCardProps>(
  ({
    planProgress,
    activityPlan,
    state,
    onNextStep,
    isAdvancing = false,
    service,
    style,
    className = "flex-1 p-4",
  }) => {
    const [viewMode, setViewMode] = useState<"preview" | "active">("preview");

    // Get current metrics for target comparison
    const heartRate = useMetric(service, "heartrate");
    const power = useMetric(service, "power");
    const cadence = useMetric(service, "cadence");
    const speed = useMetric(service, "speed");

    const currentMetrics: CurrentMetrics = {
      heartRate,
      power,
      cadence,
      speed,
    };

    // Auto-switch to active mode when recording starts
    useEffect(() => {
      if (state === "recording" || state === "paused") {
        setViewMode("active");
      }
    }, [state]);

    const isActive = state === "recording" || state === "paused";
    const canToggle = !isActive;

    if (!activityPlan) {
      return (
        <View style={style} className={className}>
          <Card className="flex-1">
            <CardContent className="flex-1 items-center justify-center">
              <View className="items-center">
                <Icon
                  as={Activity}
                  size={48}
                  className="text-muted-foreground/50 mb-4"
                />
                <Text className="text-lg text-muted-foreground">
                  No plan loaded
                </Text>
                <Text className="text-sm text-muted-foreground mt-2">
                  Select a workout plan to get started
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>
      );
    }

    return (
      <View style={style} className={className}>
        <Card className="flex-1">
          <CardContent className="p-4 flex-1">
            {/* Header with mode toggle */}
            <PlanCardHeader
              activityPlan={activityPlan}
              viewMode={viewMode}
              onModeChange={setViewMode}
              canToggle={canToggle}
            />

            {/* Content based on mode */}
            {viewMode === "preview" ? (
              <WorkoutPreviewMode structure={activityPlan.structure} />
            ) : (
              <ActiveWorkoutMode
                planProgress={planProgress}
                activityPlan={activityPlan}
                currentMetrics={currentMetrics}
                onNextStep={onNextStep}
                isAdvancing={isAdvancing}
                structure={activityPlan.structure}
              />
            )}
          </CardContent>
        </Card>
      </View>
    );
  },
);

EnhancedPlanCard.displayName = "EnhancedPlanCard";
