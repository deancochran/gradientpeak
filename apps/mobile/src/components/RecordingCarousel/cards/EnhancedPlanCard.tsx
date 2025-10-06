import { TargetMetricsGrid } from "@/components/ActivityPlan/TargetMetricsCard";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  usePlan,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { FlattenedStep } from "@repo/core";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Target,
} from "lucide-react-native";
import React, { memo, useEffect, useState } from "react";
import { View } from "react-native";

// ================================
// Types
// ================================

interface EnhancedPlanCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

// ================================
// Helper Functions
// ================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ================================
// Custom Hooks
// ================================

/**
 * Get current step details from plan manager
 */
function useCurrentStep(
  service: ActivityRecorderService | null,
): FlattenedStep | undefined {
  const [currentStep, setCurrentStep] = useState<FlattenedStep | undefined>(
    () => service?.planManager?.getCurrentStep(),
  );

  useEffect(() => {
    if (!service) {
      setCurrentStep(undefined);
      return;
    }

    const updateStep = () => {
      setCurrentStep(service.planManager?.getCurrentStep());
    };

    service.on("planProgressUpdate", updateStep);
    service.on("stepAdvanced", updateStep);
    service.on("planStarted", updateStep);
    updateStep();

    return () => {
      service.off("planProgressUpdate", updateStep);
      service.off("stepAdvanced", updateStep);
      service.off("planStarted", updateStep);
    };
  }, [service]);

  return currentStep;
}

/**
 * Get next step preview
 */
function useNextStep(
  service: ActivityRecorderService | null,
): FlattenedStep | undefined {
  const { progress } = usePlan(service);
  const [nextStep, setNextStep] = useState<FlattenedStep | undefined>();

  useEffect(() => {
    if (!service?.planManager || !progress) {
      setNextStep(undefined);
      return;
    }

    const nextIndex = progress.currentStepIndex + 1;
    const allSteps = (service.planManager as any).flattenedSteps || [];
    setNextStep(allSteps[nextIndex]);
  }, [service, progress]);

  return nextStep;
}

/**
 * Get first step for preview when pending
 */
function useFirstStep(
  service: ActivityRecorderService | null,
): FlattenedStep | undefined {
  const [firstStep, setFirstStep] = useState<FlattenedStep | undefined>();

  useEffect(() => {
    if (!service?.planManager) {
      setFirstStep(undefined);
      return;
    }

    const allSteps = (service.planManager as any).flattenedSteps || [];
    setFirstStep(allSteps[0]);
  }, [service]);

  return firstStep;
}

/**
 * Real-time countdown for current step
 */
function useStepTimeRemaining(
  service: ActivityRecorderService | null,
): number | null {
  const { progress } = usePlan(service);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!service || !progress || !progress.duration) {
      setTimeRemaining(null);
      return;
    }

    const updateRemaining = () => {
      if (progress.duration && progress.elapsedInStep !== undefined) {
        const remaining = Math.max(
          0,
          progress.duration - progress.elapsedInStep,
        );
        setTimeRemaining(remaining);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 100);

    return () => clearInterval(interval);
  }, [service, progress]);

  return timeRemaining;
}

// ================================
// Empty State Component
// ================================

const EmptyPlanState = memo(() => (
  <View className="flex-1 items-center justify-center py-16">
    <View className="items-center">
      <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center mb-4">
        <Icon as={Calendar} size={32} className="text-muted-foreground" />
      </View>
      <Text className="text-lg font-medium text-center mb-2">
        No Active Plan
      </Text>
      <Text className="text-center text-sm text-muted-foreground px-8">
        Select a training plan to see workout details and track your progress
      </Text>
    </View>
  </View>
));

EmptyPlanState.displayName = "EmptyPlanState";

// ================================
// Finished State Component
// ================================

const FinishedPlanState = memo<{ planName: string; totalSteps: number }>(
  ({ planName, totalSteps }) => (
    <View className="flex-1 items-center justify-center py-16">
      <View className="items-center">
        <View className="w-16 h-16 bg-green-500/20 rounded-full items-center justify-center mb-4">
          <Icon as={CheckCircle2} size={32} className="text-green-500" />
        </View>
        <Text className="text-lg font-medium text-center mb-2">
          Workout Complete!
        </Text>
        <Text className="text-center text-sm text-muted-foreground px-8 mb-2">
          You&apos;ve completed all {totalSteps} intervals of {planName}
        </Text>
        <Text className="text-center text-xs text-muted-foreground px-8">
          Great work! Stop recording to save your activity.
        </Text>
      </View>
    </View>
  ),
);

FinishedPlanState.displayName = "FinishedPlanState";

// ================================
// Main Enhanced Plan Card
// ================================

export const EnhancedPlanCard = memo<EnhancedPlanCardProps>(
  ({ service, screenWidth }) => {
    // Hooks
    const current = useCurrentReadings(service);
    const { plan, progress } = usePlan(service);
    const state = useRecordingState(service);
    const currentStep = useCurrentStep(service);
    const nextStep = useNextStep(service);
    const firstStep = useFirstStep(service);
    const timeRemaining = useStepTimeRemaining(service);

    // Derive current metrics
    const currentMetrics = {
      power: current.power,
      heartRate: current.heartRate,
      cadence: current.cadence,
      speed: current.speed,
    };

    // Handle no plan selected
    if (!plan) {
      return (
        <View style={{ width: screenWidth }} className="flex-1 p-4">
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <EmptyPlanState />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Handle finished state
    if (progress?.state === "finished") {
      return (
        <View style={{ width: screenWidth }} className="flex-1 p-4">
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <FinishedPlanState
                planName={plan.name}
                totalSteps={progress.totalSteps}
              />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Determine which step to display
    // If pending/not_started, show the first step as preview
    // Otherwise show current step
    const isPending = state === "pending" || progress?.state === "not_started";
    const isRecording = state === "recording";
    const isPaused = state === "paused";

    const displayStep = isPending ? firstStep : currentStep;
    const displayNextStep = isPending
      ? (service?.planManager as any)?.flattenedSteps?.[1] // Second step when pending
      : nextStep;

    // Progress calculations
    const totalDuration = progress?.duration || 0;
    const elapsed = isPending ? 0 : progress?.elapsedInStep || 0;
    const percentage = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

    // Status indicator
    const getStatusInfo = () => {
      if (isRecording) {
        return {
          color: "bg-green-500",
          text: "LIVE",
          show: true,
        };
      }
      if (isPaused) {
        return {
          color: "bg-orange-500",
          text: "PAUSED",
          show: true,
        };
      }
      if (isPending) {
        return {
          color: "bg-blue-500",
          text: "PREVIEW",
          show: true,
        };
      }
      return { show: false };
    };

    const statusInfo = getStatusInfo();

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent>
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center">
                <Icon as={Target} size={24} className="text-primary mr-2" />
                <Text className="text-lg font-semibold">{plan.name}</Text>
              </View>
              {statusInfo.show && (
                <View className="flex-row items-center">
                  <View
                    className={`w-2 h-2 ${statusInfo.color} rounded-full mr-2`}
                  />
                  <Text className="text-xs text-muted-foreground">
                    {statusInfo.text}
                  </Text>
                </View>
              )}
            </View>

            {/* Current/Preview Step Name - Large Display */}
            {displayStep && (
              <View className="items-center mb-6">
                <Text className="text-3xl font-bold text-center mb-1">
                  {displayStep.name ||
                    `Step ${(progress?.currentStepIndex ?? 0) + 1}`}
                </Text>
                {displayStep.description && (
                  <Text className="text-sm text-muted-foreground text-center">
                    {displayStep.description}
                  </Text>
                )}
              </View>
            )}

            {/* Time Remaining & Progress */}
            {totalDuration > 0 && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={16}
                      className="text-muted-foreground mr-2"
                    />
                    <Text className="text-sm font-medium text-muted-foreground">
                      {isPending ? "Duration" : "Time Remaining"}
                    </Text>
                  </View>
                  <Text className="text-2xl font-bold">
                    {isPending
                      ? formatTime(totalDuration)
                      : timeRemaining !== null
                        ? formatTime(timeRemaining)
                        : "--:--"}
                  </Text>
                </View>
                {!isPending && (
                  <View className="h-2 bg-muted rounded-full overflow-hidden">
                    <View
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Target Metrics vs Current */}
            {displayStep?.targets && displayStep.targets.length > 0 && (
              <View className="mb-6">
                <TargetMetricsGrid
                  targets={displayStep.targets}
                  currentMetrics={currentMetrics}
                />
              </View>
            )}

            {/* Next Interval Preview */}
            {displayNextStep && (
              <View>
                <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  {isPending ? "Second Interval" : "Next Interval"}
                </Text>
                <View className="p-3 bg-muted/10 rounded-lg border border-muted/20">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-base font-semibold mb-1">
                        {displayNextStep.name || "Next Step"}
                      </Text>
                      {displayNextStep.description && (
                        <Text className="text-xs text-muted-foreground">
                          {displayNextStep.description}
                        </Text>
                      )}
                      {displayNextStep.targets &&
                        displayNextStep.targets.length > 0 && (
                          <View className="flex-row flex-wrap gap-2 mt-2">
                            {displayNextStep.targets.map(
                              (target: any, idx: number) => {
                                const targetDisplay = target.target
                                  ? `${Math.round(target.target)}`
                                  : target.min && target.max
                                    ? `${Math.round(target.min)}-${Math.round(target.max)}`
                                    : "";
                                return (
                                  <View
                                    key={idx}
                                    className="px-2 py-1 bg-muted/30 rounded-md"
                                  >
                                    <Text className="text-xs text-muted-foreground">
                                      {target.type}: {targetDisplay}
                                    </Text>
                                  </View>
                                );
                              },
                            )}
                          </View>
                        )}
                    </View>
                    <Icon
                      as={ChevronRight}
                      size={20}
                      className="text-muted-foreground ml-2"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Overall Progress Footer */}
            <View className="mt-6 pt-4 border-t border-muted/20">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  {isPending ? "Total Plan" : "Overall Progress"}
                </Text>
                <Text className="text-xs font-semibold">
                  {isPending
                    ? `${progress?.totalSteps ?? 0} intervals`
                    : `${progress?.completedSteps ?? 0} / ${progress?.totalSteps ?? 0} steps`}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);

EnhancedPlanCard.displayName = "EnhancedPlanCard";
