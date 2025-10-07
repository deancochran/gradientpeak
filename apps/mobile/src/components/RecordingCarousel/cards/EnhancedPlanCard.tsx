import { ActivityGraph } from "@/components/ActivityPlan/ActivityGraph";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrentReadings, usePlan } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  formatDuration,
  formatDurationCompact,
  getDurationMs,
  IntensityTarget,
} from "@repo/core";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Target,
  Zap,
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
// Helper Functions
// ================================

/**
 * Formats a concise interval description
 * e.g., "10 minutes at 55% FTP" or "2 minutes at 180 bpm"
 */
function formatIntervalDescription(
  duration: number,
  targets?: IntensityTarget[],
): string {
  const durationStr = formatDurationCompact(duration / 1000);

  if (!targets || targets.length === 0) {
    return durationStr;
  }

  // Format the primary target
  const primaryTarget = targets[0];
  let targetStr = "";

  if (primaryTarget.target) {
    targetStr = `${Math.round(primaryTarget.target)}`;
  } else if (primaryTarget.min && primaryTarget.max) {
    targetStr = `${Math.round(primaryTarget.min)}-${Math.round(primaryTarget.max)}`;
  } else if (primaryTarget.min) {
    targetStr = `>${Math.round(primaryTarget.min)}`;
  } else if (primaryTarget.max) {
    targetStr = `<${Math.round(primaryTarget.max)}`;
  }

  const unit =
    primaryTarget.type === "watts"
      ? "W"
      : primaryTarget.type === "%FTP"
        ? "% FTP"
        : primaryTarget.type === "bpm"
          ? "bpm"
          : primaryTarget.type === "%MaxHR"
            ? "% Max HR"
            : primaryTarget.type === "%ThresholdHR"
              ? "% Threshold"
              : primaryTarget.type === "cadence"
                ? "rpm"
                : primaryTarget.type;

  return `${durationStr} at ${targetStr} ${unit}`;
}

// ================================
// Card Header Component
// ================================

interface CardHeaderViewProps {
  adherenceScore?: number;
}

const CardHeaderView = memo<CardHeaderViewProps>(({ adherenceScore }) => (
  <View className="flex-row items-center justify-between">
    <Text className="text-lg font-semibold">Comp Plan</Text>
    {adherenceScore !== undefined && (
      <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center border-2 border-primary">
        <Text className="text-lg font-bold text-primary">{adherenceScore}</Text>
      </View>
    )}
  </View>
));

CardHeaderView.displayName = "CardHeaderView";

// ================================
// Current Sensor Readings Component
// ================================

interface CurrentSensorReadingsProps {
  targets?: IntensityTarget[];
  currentMetrics: {
    power?: number;
    heartRate?: number;
    cadence?: number;
    speed?: number;
  };
}

const CurrentSensorReadings = memo<CurrentSensorReadingsProps>(
  ({ targets, currentMetrics }) => {
    if (!targets || targets.length === 0) {
      return null;
    }

    const getMetricDisplay = (target: IntensityTarget) => {
      let icon = Target;
      let label = "";
      let value: number | undefined;
      let unit = "";
      let color = "text-muted-foreground";

      switch (target.type) {
        case "%FTP":
        case "watts":
          icon = Zap;
          label = "Power";
          value = currentMetrics.power;
          unit = target.type === "watts" ? "W" : "% FTP";
          color = "text-yellow-500";
          break;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          icon = Heart;
          label = "Heart Rate";
          value = currentMetrics.heartRate;
          unit =
            target.type === "bpm"
              ? "bpm"
              : target.type === "%MaxHR"
                ? "% Max"
                : "% Threshold";
          color = "text-red-500";
          break;
        case "cadence":
          icon = Target;
          label = "Cadence";
          value = currentMetrics.cadence;
          unit = "rpm";
          color = "text-blue-500";
          break;
      }

      return { icon, label, value, unit, color };
    };

    return (
      <View className="mb-4">
        <View className="flex-row gap-3">
          {targets.map((target, index) => {
            const display = getMetricDisplay(target);
            return (
              <View
                key={`${target.type}-${index}`}
                className="flex-1 p-3 bg-muted/10 rounded-lg"
              >
                <View className="flex-row items-center gap-2 mb-2">
                  <Icon as={display.icon} size={16} className={display.color} />
                  <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {display.label}
                  </Text>
                </View>
                <Text className={`text-2xl font-bold ${display.color}`}>
                  {display.value !== undefined
                    ? Math.round(display.value)
                    : "--"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {display.unit}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  },
);

CurrentSensorReadings.displayName = "CurrentSensorReadings";

// ================================
// Current Interval Component
// ================================

interface CurrentIntervalViewProps {
  duration: number;
  targets?: IntensityTarget[];
  name?: string;
  notes?: string;
  progress: number; // 0-1
  timeRemaining: number;
  isPending: boolean;
}

const CurrentIntervalView = memo<CurrentIntervalViewProps>(
  ({ duration, targets, name, notes, progress, timeRemaining, isPending }) => {
    const description = formatIntervalDescription(duration, targets);

    return (
      <View className="mb-4">
        <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Current Interval
        </Text>

        <View className="p-4 bg-muted/10 rounded-lg border border-muted/20">
          {/* Header/Name */}
          {name && <Text className="text-base font-semibold mb-2">{name}</Text>}

          {/* Concise Description */}
          <Text className="text-sm text-foreground mb-3">{description}</Text>

          {/* Time Remaining */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Icon
                as={Clock}
                size={14}
                className="text-muted-foreground mr-2"
              />
              <Text className="text-xs text-muted-foreground">
                Time Remaining
              </Text>
            </View>
            <Text className="text-sm font-bold">
              {isPending
                ? formatDuration(duration / 1000)
                : formatDuration(timeRemaining / 1000)}
            </Text>
          </View>

          {/* Progress Bar */}
          <View className="h-2 bg-muted/30 rounded-full overflow-hidden mb-3">
            <View
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </View>

          {/* Notes Footer */}
          {notes && (
            <View className="pt-2 border-t border-muted/20">
              <Text className="text-xs text-muted-foreground italic">
                {notes}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  },
);

CurrentIntervalView.displayName = "CurrentIntervalView";

// ================================
// Coming Up Interval Component
// ================================

interface ComingUpIntervalViewProps {
  duration: number;
  targets?: IntensityTarget[];
  name?: string;
}

const ComingUpIntervalView = memo<ComingUpIntervalViewProps>(
  ({ duration, targets, name }) => {
    const description = formatIntervalDescription(duration, targets);

    return (
      <View className="mb-4">
        <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Coming up...
        </Text>

        <View className="p-3 bg-muted/10 rounded-lg border border-muted/20">
          {name && <Text className="text-sm font-medium mb-1">{name}</Text>}
          <Text className="text-sm text-muted-foreground">{description}</Text>
        </View>
      </View>
    );
  },
);

ComingUpIntervalView.displayName = "ComingUpIntervalView";

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
    // Use consolidated plan hook
    const plan = usePlan(service);
    const current = useCurrentReadings(service);

    // Derive current metrics
    const currentMetrics = {
      power: current.power,
      heartRate: current.heartRate,
      cadence: current.cadence,
      speed: current.speed,
    };

    // Handle no plan selected
    if (!plan.hasPlan) {
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
    if (plan.isFinished) {
      return (
        <View style={{ width: screenWidth }} className="flex-1 p-4">
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <FinishedPlanState
                planName={plan.name || "Workout"}
                totalSteps={plan.stepCount}
              />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Progress calculations
    const progress = plan.progress;
    const totalDuration = progress?.duration || 0;
    const remaining = progress
      ? Math.max(0, progress.duration - progress.movingTime)
      : 0;
    const progressPercent = progress ? progress.progress : 0;

    // Check if recording hasn't started yet
    const isPending = service?.state !== "recording";

    // Get structure for graph (if available)
    const structure = service?.plan?.structure;

    // Calculate adherence score (placeholder - you'll need to implement actual logic)
    const adherenceScore = 99; // TODO: Calculate based on actual adherence data

    // Get next step info
    const nextStepIndex = plan.stepIndex + 1;
    const hasNextStep = nextStepIndex < plan.stepCount;

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1 p-0">
          <CardContent className="flex-1 p-4">
            {/* 1. Card Header View */}
            <CardHeaderView adherenceScore={adherenceScore} />

            {/* 2. Current Sensor Readings View */}
            <CurrentSensorReadings
              targets={plan.currentStep?.targets}
              currentMetrics={currentMetrics}
            />

            {/* 3. Current Interval View */}
            <CurrentIntervalView
              duration={totalDuration}
              targets={plan.currentStep?.targets}
              name={plan.currentStep?.name}
              notes={plan.currentStep?.notes}
              progress={progressPercent}
              timeRemaining={remaining}
              isPending={isPending}
            />

            {/* Target Metrics Grid (for detailed comparison) */}
            {/*{plan.currentStep?.targets &&
              plan.currentStep.targets.length > 0 && (
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    Target vs Current
                  </Text>
                  <TargetMetricsGrid
                    targets={plan.currentStep.targets}
                    currentMetrics={currentMetrics}
                  />
                </View>
              )}*/}

            {/* 4. Coming Up Interval View */}
            {hasNextStep &&
              (() => {
                // Access the next step from the service's internal steps array
                const nextStep = (service as any)?._steps?.[nextStepIndex];
                if (!nextStep) return null;

                // Calculate next step duration
                const nextDuration =
                  nextStep.duration && nextStep.duration !== "untilFinished"
                    ? getDurationMs(nextStep.duration)
                    : 0;

                return (
                  <ComingUpIntervalView
                    duration={nextDuration}
                    targets={nextStep.targets}
                    name={nextStep.name}
                  />
                );
              })()}

            {/* 5. Workout Graph */}
            {structure && (
              <View className="mt-4">
                <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Workout Overview
                </Text>
                <ActivityGraph
                  structure={structure}
                  currentStep={plan.stepIndex}
                  className="h-32"
                />
              </View>
            )}

            {/* Overall Progress Footer */}
            <View className="mt-4 pt-4 border-t border-muted/20">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">
                  Overall Progress
                </Text>
                <Text className="text-xs font-semibold">
                  {plan.stepIndex + 1} / {plan.stepCount} steps
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
