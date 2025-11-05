import { CARD_STYLES } from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrentReadings, usePlan } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  ActivityPlanStructure,
  convertTargetToAbsolute,
  extractActivityProfile,
  formatDuration,
  formatDurationCompactMs,
  getDurationMs,
  IntensityTarget,
  isValueInTargetRange,
} from "@repo/core";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Target,
  Zap,
} from "lucide-react-native";
import React, { memo, useMemo } from "react";
import { View } from "react-native";

// ================================
// Types
// ================================

interface EnhancedPlanCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

interface ProfileMetrics {
  ftp?: number;
  thresholdHr?: number;
}

// ================================
// Helper Functions
// ================================

/**
 * Extract profile metrics from the service
 */
function getProfileMetrics(
  service: ActivityRecorderService | null,
): ProfileMetrics {
  if (!service?.liveMetricsManager) {
    return {};
  }

  // Access the private profile through the manager's internal state
  const manager = service.liveMetricsManager as any;
  const profile = manager.profile;

  return {
    ftp: profile?.ftp,
    thresholdHr: profile?.thresholdHr,
  };
}

/**
 * Convert a percentage-based target to actual units if profile data exists
 */

/**
 * Format interval description with converted units
 */
function formatIntervalDescription(
  duration: number,
  targets?: IntensityTarget[],
  profile?: { ftp?: number; thresholdHr?: number },
): string {
  const parts: string[] = [];

  if (duration > 0) {
    parts.push(formatDurationCompactMs(duration));
  }

  if (targets && targets.length > 0 && profile) {
    const primaryTarget = targets[0];
    const converted = convertTargetToAbsolute(primaryTarget, profile);

    let targetStr = "";
    if (converted.intensity) {
      targetStr = `${converted.intensity}`;
    }

    if (targetStr) {
      parts.push(`@ ${targetStr} ${converted.unit}`);
    }
  }

  return parts.join(" ") || "No details";
}

/**
 * Adapter function to convert core function result to local format
 */
function getTargetStatus(
  current: number,
  target: IntensityTarget,
  converted: { intensity?: number; unit: string; label: string },
): "within" | "below" | "above" {
  if (!target.intensity) return "within";

  const inRange = isValueInTargetRange(current, target);
  if (inRange) return "within";

  return current < target.intensity ? "below" : "above";
}

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
  profile: ProfileMetrics;
  hasPlan: boolean;
  isFinished: boolean;
}

const CurrentSensorReadings = memo<CurrentSensorReadingsProps>(
  ({ targets, currentMetrics, profile, hasPlan, isFinished }) => {
    if (!hasPlan || isFinished || !targets || targets.length === 0) {
      return null;
    }

    const getMetricDisplay = (target: IntensityTarget) => {
      const converted = convertTargetToAbsolute(target, profile);
      let icon = Target;
      let value: number | undefined;
      let color = "text-muted-foreground";
      let status: "within" | "below" | "above" = "within";

      switch (target.type) {
        case "%FTP":
        case "watts":
          icon = Zap;
          value = currentMetrics.power;
          color = "text-yellow-500";
          if (value !== undefined && target) {
            status = getTargetStatus(value, target, converted);
          }
          break;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          icon = Heart;
          value = currentMetrics.heartRate;
          color = "text-red-500";
          if (value !== undefined && target) {
            status = getTargetStatus(value, target, converted);
          }
          break;
        case "cadence":
          icon = Target;
          value = currentMetrics.cadence;
          color = "text-blue-500";
          if (value !== undefined && target) {
            status = getTargetStatus(value, target, converted);
          }
          break;
      }

      return { icon, value, color, status, converted };
    };

    return (
      <View className="flex-col gap-2 w-full">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Current Metrics
        </Text>
        <View className="flex-row gap-2">
          {targets.map((target, index) => {
            const display = getMetricDisplay(target);
            const hasValue = display.value !== undefined;
            const isOffTarget = hasValue && display.status !== "within";

            // Determine border color based on status
            const borderClass = isOffTarget
              ? display.status === "below"
                ? "border-orange-500"
                : "border-red-500"
              : "border-transparent";

            return (
              <View
                key={`${target.type}-${index}`}
                className={`flex-1 p-2 bg-muted/20 rounded-lg border-2 ${borderClass}`}
              >
                <View className="flex-row items-center justify-between gap-1">
                  <View className="flex-row items-center gap-1">
                    <Icon
                      as={display.icon}
                      size={12}
                      className={display.color}
                    />
                    <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {display.converted.label}
                    </Text>
                  </View>
                  {isOffTarget && (
                    <Icon
                      as={AlertTriangle}
                      size={12}
                      className={
                        display.status === "below"
                          ? "text-orange-500"
                          : "text-red-500"
                      }
                    />
                  )}
                </View>

                {/* Current Value */}
                <Text className={`text-2xl font-bold ${display.color} mt-1`}>
                  {hasValue ? Math.round(display.value!) : "--"}
                </Text>

                {/* Target Range */}
                <View className="flex-row items-baseline gap-1">
                  <Text className="text-xs text-muted-foreground">
                    Target:{" "}
                  </Text>
                  <Text className="text-xs font-semibold text-muted-foreground">
                    {display.converted.intensity
                      ? `${display.converted.intensity}`
                      : "No target"}
                    {display.converted.unit}
                  </Text>
                </View>
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
  profile: ProfileMetrics;
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
    profile,
  }) => {
    if (!hasPlan) {
      return (
        <View className="flex-col gap-2 items-center py-8 w-full">
          <View className="w-12 h-12 bg-muted/20 rounded-full items-center justify-center">
            <Icon as={Calendar} size={24} className="text-muted-foreground" />
          </View>
          <Text className="text-base font-medium text-center">
            No Active Plan
          </Text>
          <Text className="text-center text-xs text-muted-foreground px-4">
            Select a training plan to see workout details
          </Text>
        </View>
      );
    }

    if (isFinished) {
      return (
        <View className="flex-col gap-2 items-center py-8 w-full">
          <View className="w-12 h-12 bg-green-500/20 rounded-full items-center justify-center">
            <Icon as={CheckCircle2} size={24} className="text-green-500" />
          </View>
          <Text className="text-base font-medium text-center">
            Workout Complete!
          </Text>
          <Text className="text-center text-xs text-muted-foreground px-4">
            You&apos;ve completed all {stepCount} intervals
          </Text>
        </View>
      );
    }

    const description = formatIntervalDescription(duration, targets, profile);

    return (
      <View className="flex-col gap-2 w-full">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Current Interval ({stepIndex + 1}/{stepCount})
        </Text>

        <View className="p-3 bg-muted/20 rounded-lg border border-muted/20 flex-col gap-3">
          <View className="flex-row items-center justify-between w-full">
            <Text className="text-base font-bold">{name}</Text>
            <Text className="text-sm font-semibold text-muted-foreground">
              {description}
            </Text>
          </View>

          <View className="flex-row items-center justify-between gap-2 w-full">
            {/* Progress Bar */}
            <View className="h-2 bg-muted/40 rounded-full flex-1">
              <View
                className=" bg-primary rounded-full"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </View>

            {/* Time Remaining */}
            <View className="flex-row items-center justify-end">
              <Icon
                as={Clock}
                size={14}
                className="text-muted-foreground mr-1"
              />
              <Text className="text-sm font-bold">
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

          {hasNextStep && nextName && nextDuration && nextTargets && (
            <View className="pt-2 border-t border-muted/20">
              <View className="flex-row items-center justify-between w-full">
                <Text className="text-xs font-semibold text-primary">
                  Up Next: {nextName}
                </Text>
                <Text className="text-xs font-semibold text-primary">
                  {formatIntervalDescription(
                    nextDuration,
                    nextTargets,
                    profile,
                  )}
                </Text>
              </View>
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
  planTimeRemaining: number;
  structure: ActivityPlanStructure;
  currentStepIndex: number;
}

const WorkoutGraphView = memo<WorkoutGraphViewProps>(
  ({ planTimeRemaining, structure, currentStepIndex }) => {
    const profileData = extractActivityProfile(structure);
    const totalDuration = profileData.reduce(
      (sum, step) => sum + step.duration,
      0,
    );

    if (profileData.length === 0) return null;

    return (
      <View className="flex-col gap-2 w-full">
        <View className="flex-row w-full items-start justify-between">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Workout Profile
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Time Remaining: {formatDurationCompactMs(planTimeRemaining)}
          </Text>
        </View>
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
                    opacity,
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
    const plan = usePlan(service);
    const current = useCurrentReadings(service);

    // Extract profile metrics from service
    const profile = useMemo(() => getProfileMetrics(service), [service]);

    const currentMetrics = {
      power: current.power,
      heartRate: current.heartRate,
      cadence: current.cadence,
      speed: current.speed,
    };

    const hasPlan = plan.hasPlan;
    const isFinished = hasPlan && plan.isFinished;
    const stepIndex = hasPlan ? plan.stepIndex : 0;
    const stepCount = hasPlan ? plan.stepCount : 0;
    const currentStep = hasPlan ? plan.currentStep : undefined;
    const planName = hasPlan ? plan.name : undefined;
    const planTimeRemaining = hasPlan ? plan.planTimeRemaining : 0;

    const progress = hasPlan ? plan.progress : null;
    const totalDuration = progress?.duration || 0;
    const remaining = progress
      ? Math.max(0, progress.duration - progress.movingTime)
      : 0;
    const progressPercent = progress ? progress.progress : 0;

    const isPending = service?.state !== "recording";
    const structure = service?.plan?.structure as ActivityPlanStructure;

    const adherenceScore = hasPlan && !isFinished ? 95 : undefined;

    const nextStepIndex = stepIndex + 1;
    const hasNextStep = hasPlan && nextStepIndex < stepCount;

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
        <Card className={CARD_STYLES.wrapper}>
          <CardContent className={CARD_STYLES.content}>
            {/* Header */}
            <View className={CARD_STYLES.header}>
              <View className="flex-row items-center">
                <Icon
                  as={Target}
                  size={CARD_STYLES.iconSize}
                  className="text-blue-500 mr-2"
                />
                <Text className="text-lg font-semibold line-clamp-1">
                  {planName || "Workout Plan"}
                </Text>
              </View>
            </View>

            <View className="gap-6">
              {hasPlan && (
                <WorkoutGraphView
                  planTimeRemaining={planTimeRemaining}
                  structure={structure}
                  currentStepIndex={stepIndex}
                />
              )}

              <CurrentSensorReadings
                targets={currentStep?.targets}
                currentMetrics={currentMetrics}
                profile={profile}
                hasPlan={hasPlan}
                isFinished={isFinished}
              />

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
                profile={profile}
              />
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);

EnhancedPlanCard.displayName = "EnhancedPlanCard";
