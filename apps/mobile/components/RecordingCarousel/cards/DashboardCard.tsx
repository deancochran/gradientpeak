import {
  CARD_STYLES,
  DASHBOARD_STYLES,
} from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  usePlan,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";

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
import React, { memo, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";

// ================================
// Types
// ================================

interface DashboardCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

interface ProfileMetrics {
  ftp?: number;
  threshold_hr?: number;
}

type MetricType =
  | "power"
  | "heartRate"
  | "cadence"
  | "speed"
  | "distance"
  | "calories"
  | "time";

interface MetricCardProps {
  type: MetricType;
  currentValue?: number;
  target?: {
    value: number;
    unit: string;
  };
  isTargeted?: boolean;
  status?: "within" | "above" | "below";
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
    return {};
  }

  try {
    const manager = service.liveMetricsManager as any;
    const profile = manager?.profile;

    if (!profile) {
      return {};
    }

    return {
      ftp: profile.ftp ?? undefined,
      threshold_hr: profile.threshold_hr ?? undefined,
    };
  } catch (error) {
    console.error("[DashboardCard] Error extracting profile metrics:", error);
    return {};
  }
}

/**
 * Adapter function to get target status
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
// Activity Graph Component
// ================================

interface ActivityGraphViewProps {
  planTimeRemaining: number;
  structure: ActivityPlanStructureV2;
  currentStepIndex: number;
  availableHeight: number;
  planName?: string;
}

const ActivityGraphView = memo<ActivityGraphViewProps>(
  ({
    planTimeRemaining,
    structure,
    currentStepIndex,
    availableHeight,
    planName,
  }) => {
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
        return (step.duration.meters / 1000) * 300;
      } else if (step.duration.type === "repetitions") {
        return step.duration.count * 10;
      } else {
        return 300;
      }
    });

    const totalDuration = stepDurations.reduce((sum, dur) => sum + dur, 0);

    if (totalDuration === 0) return null;

    return (
      <View
        className="flex-col gap-2 w-full"
        style={{ height: availableHeight }}
      >
        <View className="flex-row w-full items-start justify-between">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {planName || "Activity Profile"}
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {formatDurationCompactMs(planTimeRemaining)}
          </Text>
        </View>
        <View className="flex-1 bg-muted/20 rounded-lg border border-muted/20 p-2">
          <View className="flex-1 flex-row items-end w-full">
            {steps.map((step, index) => {
              const duration = stepDurations[index];
              const width = Math.max(2, (duration / totalDuration) * 100);

              const primaryTarget = step.targets?.[0];
              const intensity = primaryTarget?.intensity ?? 0;

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
// Interval Progress Component
// ================================

interface IntervalProgressProps {
  stepTimeRemaining: number;
  stepDuration: number;
  currentStep: IntervalStepV2 | null;
  nextStep: IntervalStepV2 | null;
  profile: ProfileMetrics;
}

/**
 * Helper function to format a step description with duration and targets
 */
const formatStepDescription = (
  step: IntervalStepV2 | null,
  profile: ProfileMetrics,
): string => {
  if (!step) return "";

  const parts: string[] = [];

  // Add duration
  if (step.duration.type === "time") {
    const minutes = Math.floor(step.duration.seconds / 60);
    const seconds = step.duration.seconds % 60;
    if (minutes > 0 && seconds > 0) {
      parts.push(`${minutes}m ${seconds}s`);
    } else if (minutes > 0) {
      parts.push(`${minutes}m`);
    } else {
      parts.push(`${seconds}s`);
    }
  } else if (step.duration.type === "distance") {
    const km = step.duration.meters / 1000;
    parts.push(`${km.toFixed(1)}km`);
  } else if (step.duration.type === "repetitions") {
    parts.push(`${step.duration.count} reps`);
  } else if (step.duration.type === "untilFinished") {
    parts.push("Until finished");
  }

  // Add targets
  if (step.targets && step.targets.length > 0) {
    const targetParts: string[] = [];

    for (const target of step.targets) {
      const converted = convertTargetToAbsolute(target, profile);

      // Use absolute values if profile information is available
      if (target.type === "%FTP") {
        if (converted && converted.intensity !== undefined && profile.ftp) {
          targetParts.push(`${Math.round(converted.intensity)}W`);
        } else {
          targetParts.push(`${target.intensity}% FTP`);
        }
      } else if (target.type === "watts") {
        targetParts.push(`${Math.round(target.intensity)}W`);
      } else if (target.type === "%MaxHR") {
        if (converted && converted.intensity !== undefined) {
          targetParts.push(`${Math.round(converted.intensity)} bpm`);
        } else {
          targetParts.push(`${target.intensity}% MaxHR`);
        }
      } else if (target.type === "%ThresholdHR") {
        if (
          converted &&
          converted.intensity !== undefined &&
          profile.threshold_hr
        ) {
          targetParts.push(`${Math.round(converted.intensity)} bpm`);
        } else {
          targetParts.push(`${target.intensity}% ThresholdHR`);
        }
      } else if (target.type === "bpm") {
        targetParts.push(`${Math.round(target.intensity)} bpm`);
      } else if (target.type === "cadence") {
        targetParts.push(`${Math.round(target.intensity)} rpm`);
      } else if (target.type === "grade") {
        targetParts.push(`${target.intensity}% grade`);
      }
    }

    if (targetParts.length > 0) {
      parts.push("at " + targetParts.join(", "));
    }
  }

  return parts.join(" ");
};

const IntervalProgress = memo<IntervalProgressProps>(
  ({ stepTimeRemaining, stepDuration, currentStep, nextStep, profile }) => {
    const percentage =
      stepDuration > 0
        ? Math.max(
            0,
            Math.min(
              100,
              ((stepDuration - stepTimeRemaining) / stepDuration) * 100,
            ),
          )
        : 0;

    // Format the current interval description
    const intervalDescription = useMemo(() => {
      return formatStepDescription(currentStep, profile);
    }, [currentStep, profile]);

    // Format the next step preview
    const nextStepDescription = useMemo(() => {
      if (!nextStep) return null;
      return formatStepDescription(nextStep, profile);
    }, [nextStep, profile]);

    return (
      <View className={DASHBOARD_STYLES.intervalProgress}>
        <Text className={DASHBOARD_STYLES.countdownTimer}>
          {intervalDescription}
        </Text>
        <View className={DASHBOARD_STYLES.progressBarContainer}>
          <View
            className={`${DASHBOARD_STYLES.progressBarFill} bg-primary`}
            style={{ width: `${percentage}%` }}
          />
        </View>
        {nextStepDescription && (
          <Text className={DASHBOARD_STYLES.nextStepPreview}>
            Next: {nextStepDescription}
          </Text>
        )}
      </View>
    );
  },
);

IntervalProgress.displayName = "IntervalProgress";

// ================================
// Unified Metric Card Component
// ================================

const MetricCard = memo<MetricCardProps>(
  ({ type, currentValue, target, isTargeted = false, status = "within" }) => {
    const getMetricLabel = (): string => {
      switch (type) {
        case "power":
          return "Power";
        case "heartRate":
          return "Heart Rate";
        case "cadence":
          return "Cadence";
        case "speed":
          return "Speed";
        case "distance":
          return "Distance";
        case "calories":
          return "Calories";
        case "time":
          return "Time";
        default:
          return "";
      }
    };

    const getMetricUnit = (): string => {
      switch (type) {
        case "power":
          return "W";
        case "heartRate":
          return "bpm";
        case "cadence":
          return "rpm";
        case "speed":
          return "km/h";
        case "distance":
          return "km";
        case "calories":
          return "cal";
        case "time":
          return "";
        default:
          return "";
      }
    };

    const getDisplayValue = (): string => {
      if (currentValue === undefined) return "--";

      switch (type) {
        case "speed":
          return (currentValue * 3.6).toFixed(1);
        case "distance":
          return (currentValue / 1000).toFixed(2);
        case "power":
        case "heartRate":
        case "cadence":
        case "calories":
          return Math.round(currentValue).toString();
        case "time":
          return formatDuration(currentValue);
        default:
          return currentValue.toString();
      }
    };

    // Determine border style based on targeting status
    let borderClass = DASHBOARD_STYLES.metricCardDefault;
    if (isTargeted) {
      if (status === "below") {
        borderClass = DASHBOARD_STYLES.metricCardBelow;
      } else if (status === "above") {
        borderClass = DASHBOARD_STYLES.metricCardAbove;
      } else {
        borderClass = DASHBOARD_STYLES.metricCardTargeted;
      }
    }

    return (
      <View className={`${DASHBOARD_STYLES.metricCardUnified} ${borderClass}`}>
        <Text className={DASHBOARD_STYLES.metricTitle}>{getMetricLabel()}</Text>
        <Text className={DASHBOARD_STYLES.metricValue}>
          {getDisplayValue()}
        </Text>
        <Text className={DASHBOARD_STYLES.metricUnit}>{getMetricUnit()}</Text>
        {isTargeted && target && (
          <Text className={DASHBOARD_STYLES.metricTarget}>
            Target: {target.value} {target.unit}
          </Text>
        )}
      </View>
    );
  },
);

MetricCard.displayName = "MetricCard";

// ================================
// Main Dashboard Card
// ================================

export const DashboardCard: React.FC<DashboardCardProps> = ({
  service,
  screenWidth,
}) => {
  const plan = usePlan(service);
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);
  const profile = useMemo(() => getProfileMetrics(service), [service]);
  const { height: windowHeight } = useWindowDimensions();

  const structure = service?.plan?.structure as ActivityPlanStructureV2;

  // Calculate available height for adaptive header (25% of card height)
  // Approximate card height as window height minus some chrome
  const estimatedCardHeight = windowHeight - 200; // Account for header/footer
  const adaptiveHeaderHeight =
    estimatedCardHeight * DASHBOARD_STYLES.adaptiveHeaderHeight;

  // Determine which metrics are currently targeted
  const targetedMetrics = useMemo(() => {
    const targets = plan.currentStep?.targets;
    if (!targets || targets.length === 0) return new Set<MetricType>();

    const targeted = new Set<MetricType>();
    for (const target of targets) {
      switch (target.type) {
        case "%FTP":
        case "watts":
          targeted.add("power");
          break;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          targeted.add("heartRate");
          break;
        case "cadence":
          targeted.add("cadence");
          break;
      }
    }
    return targeted;
  }, [plan.currentStep?.targets]);

  // Get target values for targeted metrics
  const getTargetForMetric = (
    metricType: MetricType,
  ): { value: number; unit: string } | undefined => {
    const targets = plan.currentStep?.targets;
    if (!targets) return undefined;

    for (const target of targets) {
      const converted = convertTargetToAbsolute(target, profile);
      if (!converted || converted.intensity === undefined) continue;

      switch (metricType) {
        case "power":
          if (target.type === "%FTP" || target.type === "watts") {
            return {
              value: Math.round(converted.intensity),
              unit: converted.unit,
            };
          }
          break;
        case "heartRate":
          if (
            target.type === "%MaxHR" ||
            target.type === "%ThresholdHR" ||
            target.type === "bpm"
          ) {
            return {
              value: Math.round(converted.intensity),
              unit: converted.unit,
            };
          }
          break;
        case "cadence":
          if (target.type === "cadence") {
            return {
              value: Math.round(converted.intensity),
              unit: converted.unit,
            };
          }
          break;
      }
    }
    return undefined;
  };

  // Get status for targeted metrics
  const getStatusForMetric = (
    metricType: MetricType,
    currentValue?: number,
  ): "within" | "above" | "below" => {
    if (currentValue === undefined) return "within";

    const targets = plan.currentStep?.targets;
    if (!targets) return "within";

    for (const target of targets) {
      const converted = convertTargetToAbsolute(target, profile);
      let shouldCheck = false;

      switch (metricType) {
        case "power":
          shouldCheck = target.type === "%FTP" || target.type === "watts";
          break;
        case "heartRate":
          shouldCheck =
            target.type === "%MaxHR" ||
            target.type === "%ThresholdHR" ||
            target.type === "bpm";
          break;
        case "cadence":
          shouldCheck = target.type === "cadence";
          break;
      }

      if (shouldCheck) {
        return getTargetStatus(currentValue, target, converted);
      }
    }
    return "within";
  };

  // Calculate step duration for progress bar
  const stepDuration = useMemo(() => {
    const currentStep = plan.currentStep;
    if (!currentStep) return 0;

    if (currentStep.duration.type === "time") {
      return currentStep.duration.seconds * 1000; // Convert to ms
    } else if (currentStep.duration.type === "distance") {
      // Estimate duration based on distance (assume 5 min/km for now)
      return (currentStep.duration.meters / 1000) * 300 * 1000;
    }
    return 0;
  }, [plan.currentStep]);

  // Determine metrics order - put targeted metrics first if they exist
  const metricsOrder: MetricType[] = useMemo(() => {
    const order: MetricType[] = [];

    // Add targeted metrics first
    if (targetedMetrics.has("power")) order.push("power");
    if (targetedMetrics.has("heartRate")) order.push("heartRate");
    if (targetedMetrics.has("cadence")) order.push("cadence");

    // Add non-targeted metrics
    if (!targetedMetrics.has("power")) order.push("power");
    if (!targetedMetrics.has("heartRate")) order.push("heartRate");
    if (!targetedMetrics.has("cadence")) order.push("cadence");

    // Always add these at the end
    order.push("speed", "distance", "calories");

    return order;
  }, [targetedMetrics]);

  // Calculate step time remaining from progress
  const stepTimeRemaining = useMemo(() => {
    if (!plan.hasPlan || !plan.progress) return 0;
    const { duration, movingTime } = plan.progress;
    return Math.max(0, duration - movingTime);
  }, [plan.hasPlan, plan.progress]);

  // Get the next step for preview
  const nextStep = useMemo(() => {
    if (!plan.hasPlan || !structure?.intervals) return null;

    // Expand all intervals into flat steps
    const allSteps: IntervalStepV2[] = [];
    for (const interval of structure.intervals) {
      for (let i = 0; i < interval.repetitions; i++) {
        for (const step of interval.steps) {
          allSteps.push(step);
        }
      }
    }

    // Get next step (current index + 1)
    const nextStepIndex = plan.stepIndex + 1;
    if (nextStepIndex < allSteps.length) {
      return allSteps[nextStepIndex];
    }

    return null;
  }, [plan.hasPlan, plan.stepIndex, structure]);

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1 py-0">
        <CardContent className={`${CARD_STYLES.content} flex-1`}>
          {/* ADAPTIVE HEADER SECTION - Conditional based on workout type */}
          {plan.hasPlan ? (
            // Structured Workout Header
            <View className={DASHBOARD_STYLES.adaptiveHeader}>
              <ActivityGraphView
                planTimeRemaining={plan.planTimeRemaining || 0}
                structure={structure}
                currentStepIndex={plan.stepIndex}
                availableHeight={adaptiveHeaderHeight}
                planName={plan.name}
              />
              <IntervalProgress
                stepTimeRemaining={stepTimeRemaining}
                stepDuration={stepDuration}
                currentStep={plan.currentStep}
                nextStep={nextStep}
                profile={profile}
              />
            </View>
          ) : (
            // Free-form Workout Header (Large Session Timer)
            <View
              className={`${DASHBOARD_STYLES.adaptiveHeader} ${DASHBOARD_STYLES.sessionTimerContainer}`}
            >
              <Text className={DASHBOARD_STYLES.sessionTimerLarge}>
                {formatDuration(stats.duration || 0)}
              </Text>
              <Text className="text-sm text-muted-foreground mt-2">
                Session Time
              </Text>
            </View>
          )}

          {/* FLEXIBLE METRICS GRID - Always visible */}
          <View className={DASHBOARD_STYLES.metricsGrid}>
            {plan.hasPlan && (
              <View className={DASHBOARD_STYLES.metricContainer}>
                <MetricCard
                  type="time"
                  currentValue={stats.duration}
                  isTargeted={false}
                />
              </View>
            )}
            {metricsOrder.map((metricType) => {
              const isTargeted = targetedMetrics.has(metricType);
              const target = isTargeted
                ? getTargetForMetric(metricType)
                : undefined;

              let currentValue: number | undefined;
              switch (metricType) {
                case "power":
                  currentValue = current.power;
                  break;
                case "heartRate":
                  currentValue = current.heartRate;
                  break;
                case "cadence":
                  currentValue = current.cadence;
                  break;
                case "speed":
                  currentValue = current.speed;
                  break;
                case "distance":
                  currentValue = stats.distance;
                  break;
                case "calories":
                  currentValue = stats.calories;
                  break;
              }

              const status = isTargeted
                ? getStatusForMetric(metricType, currentValue)
                : "within";

              return (
                <View
                  key={metricType}
                  className={DASHBOARD_STYLES.metricContainer}
                >
                  <MetricCard
                    type={metricType}
                    currentValue={currentValue}
                    target={target}
                    isTargeted={isTargeted}
                    status={status}
                  />
                </View>
              );
            })}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
