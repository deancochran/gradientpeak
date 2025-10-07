import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrentReadings, usePlan } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  ActivityPlanStructure,
  extractActivityProfile,
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
 * e.g., "10m at 55% FTP" or "2m at 180 bpm"
 */
function formatIntervalDescription(
  duration: number,
  targets?: IntensityTarget[],
): string {
  const parts: string[] = [];

  if (duration > 0) {
    parts.push(formatDurationCompact(duration / 1000));
  }

  if (targets && targets.length > 0) {
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

    if (targetStr) {
      parts.push(`@ ${targetStr} ${unit}`);
    }
  }

  return parts.join(" ") || "No details";
}

// ================================
// Card Header Component
// ================================

interface CardHeaderViewProps {
  adherenceScore?: number;
  hasPlan: boolean;
  isFinished: boolean;
  planName?: string;
}

const CardHeaderView = memo<CardHeaderViewProps>(
  ({ adherenceScore, hasPlan, isFinished, planName }) => {
    if (!hasPlan) {
      return (
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-bold">No Plan Selected</Text>
        </View>
      );
    }

    const displayScore =
      adherenceScore && adherenceScore > 0 ? adherenceScore : "--";

    return (
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold">{planName || "Comp Plan"}</Text>
        <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center border-2 border-primary">
          <Text className="text-sm font-bold text-primary">{displayScore}</Text>
        </View>
      </View>
    );
  },
);

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
  hasPlan: boolean;
  isFinished: boolean;
}

const CurrentSensorReadings = memo<CurrentSensorReadingsProps>(
  ({ targets, currentMetrics, hasPlan, isFinished }) => {
    if (!hasPlan || isFinished || !targets || targets.length === 0) {
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
          label = "PWR";
          value = currentMetrics.power;
          unit = target.type === "watts" ? "W" : "%";
          color = "text-yellow-500";
          break;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          icon = Heart;
          label = "HR";
          value = currentMetrics.heartRate;
          unit =
            target.type === "bpm"
              ? "bpm"
              : target.type === "%MaxHR"
                ? "%"
                : "%";
          color = "text-red-500";
          break;
        case "cadence":
          icon = Target;
          label = "CAD";
          value = currentMetrics.cadence;
          unit = "rpm";
          color = "text-blue-500";
          break;
      }

      return { icon, label, value, unit, color };
    };

    return (
      <View className="flex-col gap-2">
        <View className="flex-row gap-2">
          {targets.map((target, index) => {
            const display = getMetricDisplay(target);
            return (
              <View
                key={`${target.type}-${index}`}
                className="flex-1 p-2 bg-muted/20 rounded-lg"
              >
                <View className="flex-row items-center gap-1">
                  <Icon as={display.icon} size={12} className={display.color} />
                  <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {display.label}
                  </Text>
                </View>
                <Text className={`text-xl font-bold ${display.color}`}>
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
  hasPlan: boolean;
  isFinished: boolean;
  stepIndex: number;
  stepCount: number;
  hasNextStep: boolean;
  nextDuration?: number;
  nextTargets?: IntensityTarget[];
  nextName?: string;
}

const CurrentIntervalView = memo<CurrentIntervalViewProps>(
  ({
    duration,
    targets,
    name,
    notes,
    progress,
    timeRemaining,
    isPending,
    hasPlan,
    isFinished,
    stepIndex,
    stepCount,
    hasNextStep,
    nextDuration,
    nextTargets,
    nextName,
  }) => {
    if (!hasPlan) {
      return (
        <View className="flex-col gap-2">
          <View className="items-center py-8">
            <View className="w-12 h-12 bg-muted/20 rounded-full items-center justify-center ">
              <Icon as={Calendar} size={24} className="text-muted-foreground" />
            </View>
            <Text className="text-base font-medium text-center ">
              No Active Plan
            </Text>
            <Text className="text-center text-xs text-muted-foreground px-4">
              Select a training plan to see workout details
            </Text>
          </View>
        </View>
      );
    }

    if (isFinished) {
      return (
        <View className="flex-col gap-2">
          <View className="items-center py-8">
            <View className="w-12 h-12 bg-green-500/20 rounded-full items-center justify-center ">
              <Icon as={CheckCircle2} size={24} className="text-green-500" />
            </View>
            <Text className="text-base font-medium text-center ">
              Workout Complete!
            </Text>
            <Text className="text-center text-xs text-muted-foreground px-4">
              You&apos;ve completed all {stepCount} intervals
            </Text>
          </View>
        </View>
      );
    }

    const description = formatIntervalDescription(duration, targets);

    return (
      <View className="flex-col gap-2">
        <Text className="text-xs font-semibold text-muted-foreground  uppercase tracking-wide">
          Current Interval
        </Text>

        <View className="p-2 bg-muted/20 rounded-lg border border-muted/20 flex-col gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold">{name}:</Text>
            <Text className="text-base font-bold">{description}</Text>
          </View>
          <View className="flex-row items-center justify-between gap-2">
            {/* Progress Bar */}
            <View className="h-1.5 bg-muted/20 rounded-full flex-1">
              <View
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </View>

            {/* Time Remaining */}
            <View className="flex-row items-center justify-end ">
              <Icon
                as={Clock}
                size={16}
                className="text-muted-foreground mr-1"
              />
              <Text className="text-base font-bold">
                {isPending
                  ? formatDuration(duration / 1000)
                  : formatDuration(timeRemaining / 1000)}
              </Text>
            </View>
          </View>
          {notes && (
            <Text
              className="text-xs text-muted-foreground italic"
              numberOfLines={2}
            >
              {notes}
            </Text>
          )}

          {/* Step Counter */}
          <View className="flex-row items-center justify-between"></View>
          {hasNextStep && nextName && nextDuration && nextTargets && (
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-primary">
                Coming Up Next...
              </Text>
              <Text className="text-xs font-semibold text-primary">
                {formatIntervalDescription(nextDuration, nextTargets)}
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
// Workout Graph Component
// ================================

interface WorkoutGraphViewProps {
  structure: ActivityPlanStructure;
  currentStepIndex: number;
}

const WorkoutGraphView = memo<WorkoutGraphViewProps>(
  ({ structure, currentStepIndex }) => {
    const profileData = extractActivityProfile(structure);
    const totalDuration = profileData.reduce(
      (sum, step) => sum + step.duration,
      0,
    );

    if (profileData.length === 0) {
      return null;
    }

    return (
      <View className="flex-col gap-2">
        <Text className="text-xs font-semibold text-muted-foreground  uppercase tracking-wide">
          Activity Graph
        </Text>
        <View className="bg-muted/20 rounded-lg border border-muted/20 p-2">
          <View style={{ height: 48 }} className="flex-row items-end w-full">
            {profileData.map((step, index) => {
              const width = Math.max(2, (step.duration / totalDuration) * 100);
              const height = Math.max(
                20,
                Math.min(100, (step.intensity / 120) * 100),
              );
              const isActive = index === currentStepIndex;
              const opacity = isActive ? 1 : 0.3;

              return (
                <View
                  key={index}
                  style={{
                    width: `${width}%`,
                    height: `${height}%`,
                    backgroundColor: step.color,
                    borderWidth: isActive ? 2 : 1,
                    borderColor: isActive ? step.color : "rgba(0,0,0,0.1)",
                    opacity: opacity,
                  }}
                  className="rounded-sm justify-start items-center"
                />
              );
            })}
          </View>
        </View>
      </View>
    );
  },
);

WorkoutGraphView.displayName = "WorkoutGraphView";

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

    // Handle no plan selected - show default values
    const hasPlan = plan.hasPlan;
    const isFinished = hasPlan && plan.isFinished;
    const stepIndex = hasPlan ? plan.stepIndex : 0;
    const stepCount = hasPlan ? plan.stepCount : 0;
    const currentStep = hasPlan ? plan.currentStep : undefined;
    const planName = hasPlan ? plan.name : undefined;

    // Progress calculations
    const progress = hasPlan ? plan.progress : null;
    const totalDuration = progress?.duration || 0;
    const remaining = progress
      ? Math.max(0, progress.duration - progress.movingTime)
      : 0;
    const progressPercent = progress ? progress.progress : 0;

    // Check if recording hasn't started yet
    const isPending = service?.state !== "recording";

    // Get structure for graph (if available)
    const structure = service?.plan?.structure as ActivityPlanStructure;

    // Calculate adherence score (placeholder - implement actual logic)
    const adherenceScore = hasPlan && !isFinished ? 99 : undefined;

    // Get next step info
    const nextStepIndex = stepIndex + 1;
    const hasNextStep = hasPlan && nextStepIndex < stepCount;

    // Get next step details
    let nextStepDuration = 0;
    let nextStepTargets: IntensityTarget[] | undefined;
    let nextStepName: string | undefined;

    if (hasNextStep && service) {
      const nextStep = (service as any)?._steps?.[nextStepIndex];
      if (nextStep) {
        nextStepDuration =
          nextStep.duration && nextStep.duration !== "untilFinished"
            ? getDurationMs(nextStep.duration)
            : 0;
        nextStepTargets = nextStep.targets;
        nextStepName = nextStep.name;
      }
    }

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1 p-0">
          <CardContent className="h-full p-4 flex-col items-end justify-between">
            {/* 1. Card Header View */}
            <CardHeaderView
              adherenceScore={adherenceScore}
              hasPlan={hasPlan}
              isFinished={isFinished}
              planName={planName}
            />

            {/* 2. Current Sensor Readings View */}
            <CurrentSensorReadings
              targets={currentStep?.targets}
              currentMetrics={currentMetrics}
              hasPlan={hasPlan}
              isFinished={isFinished}
            />
            {/* Overall Progress Footer */}
            {hasPlan && (
              <WorkoutGraphView
                structure={structure}
                currentStepIndex={stepIndex}
              />
            )}

            {/* 3. Current Interval View */}
            <CurrentIntervalView
              duration={totalDuration}
              targets={currentStep?.targets}
              name={currentStep?.name}
              notes={currentStep?.notes}
              progress={progressPercent}
              timeRemaining={remaining}
              isPending={isPending}
              hasPlan={hasPlan}
              isFinished={isFinished}
              stepIndex={stepIndex}
              stepCount={stepCount}
              nextDuration={nextStepDuration}
              nextTargets={nextStepTargets}
              nextName={nextStepName}
              hasNextStep={hasNextStep}
            />
          </CardContent>
        </Card>
      </View>
    );
  },
);

EnhancedPlanCard.displayName = "EnhancedPlanCard";
