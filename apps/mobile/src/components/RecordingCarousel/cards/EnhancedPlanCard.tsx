import { TargetMetricsGrid } from "@/components/ActivityPlan/TargetMetricsCard";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentPlanStep,
  useCurrentReadings,
  useHasPlan,
  usePlanStepProgress,
  useStepTimer,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Target,
} from "lucide-react-native";
import React, { memo } from "react";
import { View } from "react-native";

// ================================
// Types
// ================================

interface EnhancedPlanCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
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
    // Direct service access hooks
    const hasPlan = useHasPlan(service);
    const currentStep = useCurrentPlanStep(service);
    const { index, total } = usePlanStepProgress(service);
    const timer = useStepTimer(service);
    const current = useCurrentReadings(service);

    // Derive next step
    const nextStep = service?.getPlanStep(index + 1);

    // Derive current metrics
    const currentMetrics = {
      power: current.power,
      heartRate: current.heartRate,
      cadence: current.cadence,
      speed: current.speed,
    };

    // Handle no plan selected
    if (!hasPlan) {
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
    if (service?.isPlanFinished) {
      return (
        <View style={{ width: screenWidth }} className="flex-1 p-4">
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <FinishedPlanState
                planName={currentStep?.name || "Workout"}
                totalSteps={total}
              />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Progress calculations
    const totalDuration = timer?.remaining
      ? timer.elapsed + timer.remaining
      : 0;
    const elapsed = timer?.elapsed || 0;
    const percentage = timer?.progress ? timer.progress * 100 : 0;

    // Check if recording hasn't started yet
    const isPending = service?.state !== "recording";

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent>
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="flex-row items-center">
                <Icon as={Target} size={24} className="text-primary mr-2" />
                <Text className="text-lg font-semibold">
                  Step {index + 1} of {total}
                </Text>
              </View>
            </View>

            {/* Current/Preview Step Name  */}
            <View className="items-start mb-6">
              <Text className="text-sm font-bold text-center mb-1">
                {currentStep?.name || `Step ${index + 1}`}
              </Text>
              {currentStep?.description && (
                <Text className="text-sm text-muted-foreground text-center">
                  {currentStep.description}
                </Text>
              )}
            </View>

            {/* Time Remaining & Progress */}
            {timer && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={16}
                      className="text-muted-foreground mr-2"
                    />
                    <Text className="text-sm font-medium text-muted-foreground">
                      Time Remaining
                    </Text>
                  </View>
                  <Text className="text-2xl font-bold">
                    {isPending
                      ? formatTime(totalDuration)
                      : formatTime(timer.remaining)}
                  </Text>
                </View>
                <View className="h-2 bg-muted rounded-full overflow-hidden">
                  <View
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </View>
              </View>
            )}

            {/* Target Metrics vs Current */}
            {currentStep?.targets && currentStep.targets.length > 0 && (
              <View className="mb-6">
                <TargetMetricsGrid
                  targets={currentStep.targets}
                  currentMetrics={currentMetrics}
                />
              </View>
            )}

            {/* Next Step Preview */}
            {nextStep && !service?.isLastPlanStep && (
              <View>
                <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Next Interval
                </Text>
                <View className="p-3 bg-muted/10 rounded-lg border border-muted/20">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-base font-semibold mb-1">
                        {nextStep.name || "Next Step"}
                      </Text>
                      {nextStep.description && (
                        <Text className="text-xs text-muted-foreground">
                          {nextStep.description}
                        </Text>
                      )}
                      {nextStep.targets && nextStep.targets.length > 0 && (
                        <View className="flex-row flex-wrap gap-2 mt-2">
                          {nextStep.targets.map((target: any, idx: number) => {
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
                          })}
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
                  Overall Progress
                </Text>
                <Text className="text-xs font-semibold">
                  {index} / {total} steps
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
