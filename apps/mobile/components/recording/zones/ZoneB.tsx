/**
 * Zone B: Guidance Layer (Plan/Intervals)
 *
 * Conditional rendering based on plan:
 * - Has Plan: Interval card showing current step and progression
 * - No Plan: Unmount (hidden)
 *
 * Layout:
 * - Normal state: flex-1 (fills proportional share of available space)
 * - Focused state: absolute positioned overlay (no z-index needed)
 *
 * Focus Mode:
 * - Tap to expand plan to fill screen (minus footer)
 * - Minimize button (X icon) in top-right corner when focused
 * - Operates independently of bottom sheet expansion
 * - Bottom sheet uses containerStyle.zIndex to stay on top
 */

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { useFocusMode } from "@/lib/contexts/FocusModeContext";
import { usePlan } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDurationShort } from "@/lib/utils/durationConversion";
import {
  formatIntensityTarget,
  getStepIntensityColor,
  type IntervalStepV2,
} from "@repo/core";
import { Minimize2 } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ZoneBProps {
  service: ActivityRecorderService | null;
  hasPlan: boolean;
  isFocused: boolean; // Whether this zone is currently focused
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
      const watts = Math.round(
        (target.intensity / 100) * ftp * intensityAdjustment,
      );
      return `${watts}W`;
    case "%MaxHR":
      const maxHR = profile?.max_heart_rate || 180;
      const targetHR = Math.round(
        (target.intensity / 100) * maxHR * intensityAdjustment,
      );
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
  const totalDurationMs = allSteps.reduce(
    (sum, step) => sum + getDurationMs(step.duration),
    0,
  );

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
          const width = Math.max(
            MIN_STEP_WIDTH,
            (durationMs / totalDurationMs) * 200,
          );

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
          const stepHeight =
            minStepHeight + (intensity / 100) * (maxStepHeight - minStepHeight);

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
                borderColor:
                  index === currentStepIndex ? "#ffffff" : "transparent",
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ZoneB({ service, hasPlan, isFocused }: ZoneBProps) {
  const { focusZoneB, clearFocus } = useFocusMode();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Get plan data from service
  const plan = usePlan(service);

  // Get user profile for unit conversion
  const profile = service?.recordingMetadata?.profile || null;

  // Intensity adjustment state (50% to 150%, default 100%)
  const [intensityAdjustment, setIntensityAdjustment] = useState(1.0);
  const [showIntensityAdjust, setShowIntensityAdjust] = useState(false);

  // Handle tap to expand
  const handleTapToExpand = React.useCallback(() => {
    focusZoneB();
  }, [focusZoneB]);

  // Don't render if no plan
  if (!plan.hasPlan || !plan.currentStep) {
    return null;
  }

  // Calculate focused height
  // Parent container has paddingTop: insets.top already applied
  // We need to fill: screenHeight - insets.top (parent container) - 120 (footer)
  const focusedHeight = screenHeight - insets.top - 120;

  // Get current and next step info
  const currentStep = plan.currentStep;
  const nextStep = service?.nextStep;
  const allSteps = service?.allSteps ?? [];
  const progress = plan.progress?.progress ?? 0;

  return (
    <View
      style={
        isFocused
          ? {
              // Focused: absolute positioning to overlay other zones
              // Account for safe area at top, leave space for footer at bottom
              position: "absolute",
              top: insets.top,
              bottom: 120, // Height of footer
              left: 0,
              right: 0,
            }
          : { flex: 1 }
      }
      className={
        isFocused
          ? "bg-card rounded-t-lg border-t border-x border-border overflow-hidden"
          : "bg-card rounded-lg border border-border overflow-hidden"
      }
    >
      {/* Tap to expand (only when not focused) */}
      {!isFocused && (
        <Pressable
          onPress={handleTapToExpand}
          className="p-4"
          accessibilityLabel="Tap to expand workout plan"
          accessibilityHint="Expands the workout plan to fill the screen"
        >
          {/* Activity Intensity Chart - Larger in collapsed view */}
          {allSteps.length > 0 && (
            <View className="mb-3">
              <ActivityIntensityChart
                allSteps={allSteps}
                currentStepIndex={plan.stepIndex}
                progress={progress}
                height={100}
                isFocused={false}
              />
            </View>
          )}

          {/* Current Step - Consolidated */}
          <View className="mb-3">
            <Text className="text-lg font-semibold">
              {currentStep.name} •{" "}
              {formatCompactIntervalWithProfile(currentStep, profile)}
            </Text>
          </View>

          {/* Progress Bar - Larger */}
          <View className="h-3 bg-muted rounded-full overflow-hidden mb-3">
            <View
              className="h-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </View>

          {/* Next Step Preview */}
          {nextStep && (
            <Text className="text-sm text-muted-foreground">
              Next: {formatCompactIntervalWithProfile(nextStep, profile)}
            </Text>
          )}
        </Pressable>
      )}

      {/* Focused state with minimize button */}
      {isFocused && (
        <>
          {/* Plan Content (non-pressable when focused) */}
          <View className="flex-1 p-6">
            {/* Activity Intensity Chart - Larger in focused view */}
            {allSteps.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs text-muted-foreground mb-2">
                  Workout Structure
                </Text>
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
                <Text className="text-xs text-muted-foreground">
                  INTENSITY ADJUSTMENT
                </Text>
                <Text className="text-lg font-bold">
                  {Math.round(intensityAdjustment * 100)}%
                </Text>
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
                  <Text className="text-xs text-muted-foreground mb-2">
                    TARGET
                  </Text>
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
                  <Text className="text-xs text-muted-foreground mb-2">
                    TIME REMAINING
                  </Text>
                  <Text className="text-3xl font-bold">
                    {formatDurationShort({
                      type: "time",
                      seconds: Math.ceil(
                        (plan.progress.duration - plan.progress.movingTime) /
                          1000,
                      ),
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Progress Bar - Larger in focused view */}
            <View className="h-6 bg-muted rounded-full overflow-hidden mb-6">
              <View
                className="h-full bg-primary"
                style={{ width: `${progress * 100}%` }}
              />
            </View>

            {/* Next Step Preview - Enlarged */}
            {nextStep && (
              <View className="bg-muted/50 p-4 rounded-lg">
                <Text className="text-sm text-muted-foreground mb-1">
                  Up Next
                </Text>
                <Text className="text-2xl font-semibold">{nextStep.name}</Text>
                <Text className="text-lg text-muted-foreground mt-1">
                  {formatCompactIntervalWithProfile(nextStep, profile, intensityAdjustment)}
                </Text>
              </View>
            )}
          </View>

          {/* Minimize Button (top-right) */}
          <View className="absolute top-4 right-4">
            <Button
              size="icon"
              variant="outline"
              onPress={clearFocus}
              className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
              accessibilityLabel="Minimize workout plan"
              accessibilityHint="Returns the workout plan to normal size"
            >
              <Icon as={Minimize2} size={20} />
            </Button>
          </View>
        </>
      )}
    </View>
  );
}
