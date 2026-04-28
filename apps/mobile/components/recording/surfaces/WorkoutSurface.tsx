/**
 * Workout Surface
 *
 * Shows the active structured workout step, target controls, and upcoming step
 * context for plan-led recording sessions.
 */

import { formatIntensityTarget, getStepIntensityColor, type IntervalStepV2 } from "@repo/core";
import { Slider } from "@repo/ui/components/slider";
import { Text } from "@repo/ui/components/text";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { usePlan } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDurationShort } from "@/lib/utils/durationConversion";
import { SurfaceUnavailableCard } from "./SurfaceUnavailableCard";

export interface WorkoutSurfaceProps {
  service: ActivityRecorderService | null;
  hasPlan: boolean;
}

/**
 * Resolve intensity target to actual value based on user profile
 * E.g., "90% FTP" → "220W" if user FTP is 245
 * @param target - The intensity target to resolve
 * @param profile - User profile with FTP, max HR, etc.
 * @param intensityAdjustment - Optional intensity adjustment factor (0.5 to 1.5, where 1.0 is 100%)
 */
function resolveIntensityTarget(
  target: any,
  profile: any,
  intensityAdjustment: number = 1.0,
): string {
  // Resolve percentage-based targets to absolute values with units
  // Apply intensity adjustment to numeric values
  switch (target.type) {
    case "%FTP":
      const ftp = profile?.ftp || 200;
      const watts = Math.round((target.intensity / 100) * ftp * intensityAdjustment);
      return `${watts}W`;
    case "%MaxHR":
      const maxHR = profile?.max_heart_rate || 180;
      const targetHR = Math.round((target.intensity / 100) * maxHR * intensityAdjustment);
      return `${targetHR} bpm`;
    case "%ThresholdHR":
      const thresholdHR = profile?.threshold_heart_rate || 160;
      const targetThresholdHR = Math.round(
        (target.intensity / 100) * thresholdHR * intensityAdjustment,
      );
      return `${targetThresholdHR} bpm`;
    case "watts":
      return `${Math.round(target.intensity * intensityAdjustment)}W`;
    case "bpm":
      return `${Math.round(target.intensity * intensityAdjustment)} bpm`;
    case "cadence":
      return `${Math.round(target.intensity * intensityAdjustment)} rpm`;
    case "speed":
      return `${(target.intensity * intensityAdjustment).toFixed(1)} m/s`;
    case "RPE":
      // RPE doesn't scale with intensity adjustment
      return `RPE ${target.intensity}/10`;
    default:
      // Fallback to default formatting
      return formatIntensityTarget(target);
  }
}

/**
 * Format interval in compact form: "5m @ 400W" or "5m @ 400W, 90 rpm"
 * Now with unit conversion support for percentage-based targets and intensity adjustment
 */
function formatCompactIntervalWithProfile(
  step: IntervalStepV2,
  profile: any,
  intensityAdjustment: number = 1.0,
): string {
  const duration = formatDurationShort(step.duration); // "5m", "10km", "20x"

  if (!step.targets || step.targets.length === 0) {
    return duration;
  }

  const targets = step.targets
    .map((target) => resolveIntensityTarget(target, profile, intensityAdjustment))
    .join(", "); // "220W" or "220W, 90 rpm"

  return `${duration} @ ${targets}`;
}

/**
 * Calculate step duration in milliseconds for chart width
 */
function getDurationMs(duration: IntervalStepV2["duration"]): number {
  switch (duration.type) {
    case "time":
      return duration.seconds * 1000;
    case "distance":
      // Estimate: 1km = ~5 min at moderate pace
      return (duration.meters / 1000) * 5 * 60 * 1000;
    case "repetitions":
      // Estimate: 1 rep = ~30 seconds
      return duration.count * 30 * 1000;
    case "untilFinished":
      return 60 * 1000; // Default 1 minute for visualization
    default:
      return 0;
  }
}

/**
 * Activity Intensity Chart Component
 * Shows all workout steps with color coding based on completion state
 */
interface IntensityChartProps {
  allSteps: IntervalStepV2[];
  currentStepIndex: number;
  progress: number; // 0-1
  height: number;
  isFocused: boolean;
}

function ActivityIntensityChart({
  allSteps,
  currentStepIndex,
  progress,
  height,
  isFocused,
}: IntensityChartProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const MIN_STEP_WIDTH = 40;
  const STEP_PADDING = 2;

  // Calculate total duration
  const totalDurationMs = allSteps.reduce((sum, step) => sum + getDurationMs(step.duration), 0);

  // Auto-scroll to current step
  useEffect(() => {
    if (isFocused && scrollViewRef.current && currentStepIndex > 0) {
      // Calculate position of current step
      const stepsBeforeCurrent = allSteps.slice(0, currentStepIndex);
      const durationBeforeCurrent = stepsBeforeCurrent.reduce(
        (sum, step) => sum + getDurationMs(step.duration),
        0,
      );

      // Rough estimate of X position
      const scrollX = (durationBeforeCurrent / totalDurationMs) * 300; // Approximate chart width

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: scrollX - 100, animated: true });
      }, 100);
    }
  }, [currentStepIndex, isFocused, allSteps, totalDurationMs]);

  if (allSteps.length === 0) {
    return null;
  }

  return (
    <View style={{ height }} className="rounded-lg overflow-hidden">
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingVertical: 4,
          alignItems: "flex-end",
        }}
      >
        {allSteps.map((step, index) => {
          const durationMs = getDurationMs(step.duration);
          const width = Math.max(MIN_STEP_WIDTH, (durationMs / totalDurationMs) * 200);

          // All intervals use their intensity color
          const backgroundColor = getStepIntensityColor(step);

          // Opacity based on active state
          let opacity: number;
          if (index === currentStepIndex) {
            // Active interval - full color/saturation
            opacity = 1.0;
          } else {
            // Inactive intervals (past or future) - reduced opacity (muted)
            opacity = 0.5;
          }

          // Calculate height based on intensity (0-100 scale, like TimelineChart)
          const intensity = step.targets?.[0]?.intensity || 50; // Default to 50% if no target
          const minStepHeight = height * 0.2; // 20% of container height minimum
          const maxStepHeight = height * 0.9; // 90% of container height maximum
          const stepHeight = minStepHeight + (intensity / 100) * (maxStepHeight - minStepHeight);

          return (
            <View
              key={index}
              style={{
                width: width - STEP_PADDING * 2,
                height: stepHeight,
                marginHorizontal: STEP_PADDING,
                backgroundColor,
                opacity,
                borderRadius: 4,
                borderWidth: index === currentStepIndex ? 2 : 0,
                borderColor: index === currentStepIndex ? "#ffffff" : "transparent",
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

export function WorkoutSurface({ service, hasPlan }: WorkoutSurfaceProps) {
  // Get plan data from service
  const plan = usePlan(service);

  // Get user profile for unit conversion
  const profile = service?.recordingMetadata?.profile || null;

  // Intensity adjustment state (50% to 150%, default 100%)
  const [intensityAdjustment, setIntensityAdjustment] = useState(1.0);
  // Don't render if no plan
  if (!service || !hasPlan || !plan.hasPlan || !plan.currentStep) {
    return (
      <SurfaceUnavailableCard
        title="No workout plan attached"
        description="Attach a plan to turn this into a structured workout."
      />
    );
  }

  // Get current and next step info
  const currentStep = plan.currentStep;
  const nextStep = service?.nextStep;
  const allSteps = service?.allSteps ?? [];
  const progress = plan.progress?.progress ?? 0;

  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <View className="flex-1 p-6">
        {/* Activity Intensity Chart - Larger in focused view */}
        {allSteps.length > 0 && (
          <View className="mb-6">
            <Text className="text-xs text-muted-foreground mb-2">Workout Structure</Text>
            <ActivityIntensityChart
              allSteps={allSteps}
              currentStepIndex={plan.stepIndex}
              progress={progress}
              height={140}
              isFocused={true}
            />
          </View>
        )}

        {/* Current Step Header */}
        <View className="mb-4">
          <Text className="text-sm text-muted-foreground mb-2">
            Step {plan.stepIndex + 1} of {plan.stepCount}
          </Text>
          <Text className="text-4xl font-bold">{currentStep.name}</Text>
        </View>

        {/* Intensity Adjustment Control */}
        <View className="mb-4 bg-muted/30 p-4 rounded-lg">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs text-muted-foreground">INTENSITY ADJUSTMENT</Text>
            <Text className="text-lg font-bold">{Math.round(intensityAdjustment * 100)}%</Text>
          </View>
          <Slider
            value={intensityAdjustment}
            onValueChange={setIntensityAdjustment}
            minimumValue={0.5}
            maximumValue={1.5}
            step={0.05}
          />
          <View className="flex-row justify-between mt-1">
            <Text className="text-xs text-muted-foreground">50%</Text>
            <Text className="text-xs text-muted-foreground">100%</Text>
            <Text className="text-xs text-muted-foreground">150%</Text>
          </View>
        </View>

        {/* Target Values and Timer - Two Column Layout */}
        <View className="flex-row gap-4 mb-6">
          {/* Target Values */}
          {currentStep.targets && currentStep.targets.length > 0 && (
            <View className="flex-1 bg-muted/50 p-4 rounded-lg">
              <Text className="text-xs text-muted-foreground mb-2">TARGET</Text>
              {currentStep.targets.map((target, idx) => (
                <Text key={idx} className="text-2xl font-bold mb-1">
                  {resolveIntensityTarget(target, profile, intensityAdjustment)}
                </Text>
              ))}
            </View>
          )}

          {/* Timer - Time Remaining in Step */}
          {plan.progress && !plan.progress.requiresManualAdvance && (
            <View className="flex-1 bg-primary/10 p-4 rounded-lg border-2 border-primary">
              <Text className="text-xs text-muted-foreground mb-2">TIME REMAINING</Text>
              <Text className="text-3xl font-bold">
                {formatDurationShort({
                  type: "time",
                  seconds: Math.ceil((plan.progress.duration - plan.progress.movingTime) / 1000),
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Progress Bar - Larger in focused view */}
        <View className="h-6 bg-muted rounded-full overflow-hidden mb-6">
          <View className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </View>

        {/* Next Step Preview - Enlarged */}
        {nextStep && (
          <View className="bg-muted/50 p-4 rounded-lg">
            <Text className="text-sm text-muted-foreground mb-1">Up Next</Text>
            <Text className="text-2xl font-semibold">{nextStep.name}</Text>
            <Text className="text-lg text-muted-foreground mt-1">
              {formatCompactIntervalWithProfile(nextStep, profile, intensityAdjustment)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
