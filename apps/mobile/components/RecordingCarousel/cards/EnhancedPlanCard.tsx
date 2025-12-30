import { CARD_STYLES } from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrentReadings, usePlan } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  type ActivityPlanStructureV2,
  convertTargetToAbsolute,
  formatDuration,
  formatDurationCompactMs,
  getStepIntensityColor,
  type IntensityTargetV2,
  type IntervalStepV2,
  isInTargetRange,
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
  threshold_hr?: number;
}

// ================================
// Helper Functions
// ================================

/**
 * Extract profile metrics from the service with enhanced safety checks
 */
function getProfileMetrics(
  service: ActivityRecorderService | null,
): ProfileMetrics {
  if (!service?.liveMetricsManager) {
    console.warn("[EnhancedPlanCard] No live metrics manager available");
    return {};
  }

  try {
    // Access the private profile through the manager's internal state
    const manager = service.liveMetricsManager as any;
    const profile = manager?.profile;

    if (!profile) {
      console.warn("[EnhancedPlanCard] No profile data available");
      return {};
    }

    return {
      ftp: profile.ftp ?? undefined,
      threshold_hr: profile.threshold_hr ?? undefined,
    };
  } catch (error) {
    console.error(
      "[EnhancedPlanCard] Error extracting profile metrics:",
      error,
    );
    return {};
  }
}

/**
 * Convert a percentage-based target to actual units if profile data exists
 */

/**
 * Format interval description with converted units
 */
function formatIntervalDescription(
  duration: number,
  targets?: IntensityTargetV2[],
  profile?: { ftp?: number; threshold_hr?: number },
): string {
  try {
    const parts: string[] = [];

    if (duration > 0) {
      parts.push(formatDurationCompactMs(duration));
    }

    if (targets && targets.length > 0 && profile) {
      const primaryTarget = targets[0];
      if (primaryTarget) {
        const converted = convertTargetToAbsolute(primaryTarget, profile);

        if (converted) {
          let targetStr = "";
          if (
            converted.intensity !== undefined &&
            converted.intensity !== null
          ) {
            targetStr = `${converted.intensity}`;
          }

          if (targetStr) {
            parts.push(`@ ${targetStr} ${converted.unit || ""}`);
          }
        }
      }
    }

    return parts.join(" ") || "No details";
  } catch (error) {
    console.error(
      "[EnhancedPlanCard] Error formatting interval description:",
      error,
    );
    return "No details";
  }
}

/**
 * Adapter function to convert core function result to local format
 */
function getTargetStatus(
  current: number,
  target: IntensityTargetV2 | null | undefined,
  converted: { intensity?: number; unit: string; label: string } | null,
): "within" | "below" | "above" {
  if (!target || !target.intensity || !converted) return "within";

  const inRange = isInTargetRange(current, target);
  if (inRange) return "within";

  return current < target.intensity ? "below" : "above";
}

// ================================
// Current Sensor Readings Component
// ================================

interface CurrentSensorReadingsProps {
  targets?: IntensityTargetV2[];
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

    const getMetricDisplay = (target: IntensityTargetV2) => {
      const converted = convertTargetToAbsolute(target, profile);
      let icon = Target;
      let value: number | undefined;
      let color = "text-muted-foreground";
      let status: "within" | "below" | "above" = "within";
      let displayTarget: string;
      let displayUnit: string;

      switch (target.type) {
        case "%FTP":
        case "watts":
          icon = Zap;
          value = currentMetrics.power;
          color = "text-yellow-500";

          // If FTP is available, show absolute watts
          if (converted && converted.intensity !== undefined) {
            displayTarget = `${converted.intensity}`;
            displayUnit = converted.unit;
            if (value !== undefined && target) {
              status = getTargetStatus(value, target, converted);
            }
          } else {
            // No FTP available - show percentage
            displayTarget = `${target.intensity}`;
            displayUnit = target.type === "%FTP" ? "% FTP" : "W";
          }
          break;

        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          icon = Heart;
          value = currentMetrics.heartRate;
          color = "text-red-500";

          // If threshold HR is available, show absolute BPM
          if (converted && converted.intensity !== undefined) {
            displayTarget = `${converted.intensity}`;
            displayUnit = converted.unit;
            if (value !== undefined && target) {
              status = getTargetStatus(value, target, converted);
            }
          } else {
            // No threshold HR available - show percentage
            displayTarget = `${target.intensity}`;
            displayUnit =
              target.type === "%MaxHR"
                ? "% Max HR"
                : target.type === "%ThresholdHR"
                  ? "% Threshold"
                  : "bpm";
          }
          break;

        case "cadence":
          icon = Target;
          value = currentMetrics.cadence;
          color = "text-blue-500";
          displayTarget = `${target.intensity}`;
          displayUnit = "rpm";
          if (value !== undefined && target && converted) {
            status = getTargetStatus(value, target, converted);
          }
          break;

        default:
          displayTarget = `${target.intensity}`;
          displayUnit = "";
      }

      return {
        icon,
        value,
        color,
        status,
        converted,
        displayTarget,
        displayUnit,
      };
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
                      {display.converted?.label ?? "Target"}
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
                    {display.displayTarget} {display.displayUnit}
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
  targets?: IntensityTargetV2[];
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
  nextTargets?: IntensityTargetV2[];
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
    if (!hasPlan || !name) {
      return (
        <View className="flex-col gap-2 items-center py-8 w-full">
          <View className="w-12 h-12 bg-muted/20 rounded-full items-center justify-center">
            <Icon as={Calendar} size={24} className="text-muted-foreground" />
          </View>
          <Text className="text-base font-medium text-center">Free Ride</Text>
          <Text className="text-center text-xs text-muted-foreground px-4">
            No structured workout loaded. Just ride!
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
            Activity Complete!
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
// Activity Graph Component
// ================================

interface ActivityGraphViewProps {
  planTimeRemaining: number;
  structure: ActivityPlanStructureV2;
  currentStepIndex: number;
}

const ActivityGraphView = memo<ActivityGraphViewProps>(
  ({ planTimeRemaining, structure, currentStepIndex }) => {
    if (!structure?.intervals || structure.intervals.length === 0) return null;

    // Expand intervals into flat steps for visualization
    const steps: IntervalStepV2[] = [];
    for (const interval of structure.intervals) {
      for (let i = 0; i < interval.repetitions; i++) {
        for (const step of interval.steps) {
          steps.push(step);
        }
      }
    }

    // Calculate duration for each step in seconds
    const stepDurations = steps.map((step) => {
      if (step.duration.type === "time") {
        return step.duration.seconds;
      } else if (step.duration.type === "distance") {
        // Estimate 5 min/km pace for distance-based steps
        return (step.duration.meters / 1000) * 300;
      } else if (step.duration.type === "repetitions") {
        // Estimate 10 seconds per repetition
        return step.duration.count * 10;
      } else {
        // untilFinished - default to 5 minutes
        return 300;
      }
    });

    const totalDuration = stepDurations.reduce((sum, dur) => sum + dur, 0);

    if (totalDuration === 0) return null;

    return (
      <View className="flex-col gap-2 w-full">
        <View className="flex-row w-full items-start justify-between">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Activity Profile
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Time Remaining: {formatDurationCompactMs(planTimeRemaining)}
          </Text>
        </View>
        <View className="bg-muted/20 rounded-lg border border-muted/20 p-2">
          <View style={{ height: 48 }} className="flex-row items-end w-full">
            {steps.map((step, index) => {
              const duration = stepDurations[index];
              const width = Math.max(2, (duration / totalDuration) * 100);

              // Get intensity from primary target
              const primaryTarget = step.targets?.[0];
              const intensity = primaryTarget?.intensity ?? 0;

              // Calculate height based on intensity (assuming FTP-based)
              const height = Math.max(
                20,
                Math.min(100, (intensity / 120) * 100),
              );

              const isActive = index === currentStepIndex;
              const opacity = isActive ? 1 : 0.3;
              const color = getStepIntensityColor(step);

              return (
                <View
                  key={index}
                  style={{
                    width: `${width}%`,
                    height: `${height}%`,
                    backgroundColor: color,
                    borderWidth: isActive ? 2 : 1,
                    borderColor: isActive ? color : "rgba(0,0,0,0.1)",
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

ActivityGraphView.displayName = "ActivityGraphView";

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
    const structure = service?.plan?.structure as ActivityPlanStructureV2;

    const adherenceScore = hasPlan && !isFinished ? 95 : undefined;

    const nextStepIndex = stepIndex + 1;
    const hasNextStep = hasPlan && nextStepIndex < stepCount;

    let nextStepDuration = 0;
    let nextStepTargets: IntensityTargetV2[] | undefined;
    let nextStepName: string | undefined;

    if (hasNextStep && structure?.intervals) {
      // Expand intervals to find the next step
      const flatSteps: IntervalStepV2[] = [];
      for (const interval of structure.intervals) {
        for (let i = 0; i < interval.repetitions; i++) {
          for (const step of interval.steps) {
            flatSteps.push(step);
          }
        }
      }

      const nextStep = flatSteps[nextStepIndex];
      if (nextStep) {
        // Convert V2 duration to milliseconds
        if (nextStep.duration.type === "time") {
          nextStepDuration = nextStep.duration.seconds * 1000;
        } else if (nextStep.duration.type === "distance") {
          // Estimate 5 min/km pace
          nextStepDuration = (nextStep.duration.meters / 1000) * 300 * 1000;
        } else if (nextStep.duration.type === "repetitions") {
          // Estimate 10 seconds per repetition
          nextStepDuration = nextStep.duration.count * 10 * 1000;
        } else {
          // untilFinished
          nextStepDuration = 0;
        }
        nextStepTargets = nextStep.targets;
        nextStepName = nextStep.name;
      }
    }

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1 py-0">
          <CardContent className={CARD_STYLES.content}>
            <View className="gap-6">
              {hasPlan && (
                <ActivityGraphView
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
