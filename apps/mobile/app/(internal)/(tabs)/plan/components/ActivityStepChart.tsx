import { Text } from "@/components/ui/text";
import {
  type DurationV2,
  type IntensityTargetV2,
  type PlanStepV2,
  getStepIntensityColor,
} from "@repo/core";
import { Dimensions, ScrollView, TouchableOpacity, View } from "react-native";

interface ActivityStepChartProps {
  steps: PlanStepV2[];
  selectedStepIndex: number | null;
  onStepPress: (index: number) => void;
  onStepLongPress: (index: number) => void;
}

interface FlattenedChartStep {
  index: number;
  name: string;
  duration: DurationV2;
  targets: IntensityTargetV2[] | undefined;
  durationMs: number;
  isFromRepetition: boolean;
}

const MIN_STEP_WIDTH = 60;
const CHART_HEIGHT = 200;
const STEP_PADDING = 4;

/**
 * Convert DurationV2 to milliseconds for chart calculations
 */
function getDurationMs(duration: DurationV2): number {
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
 * Flatten steps for chart visualization
 * V2 schema already has flat structure, just add visualization properties
 */
function flattenStepsForChart(steps: PlanStepV2[]): FlattenedChartStep[] {
  return steps.map((step, index) => ({
    index,
    name: step.name,
    duration: step.duration,
    targets: step.targets,
    durationMs: getDurationMs(step.duration),
    isFromRepetition: step.originalRepetitionCount !== undefined,
  }));
}

/**
 * Calculate step width based on duration
 */
function calculateStepWidth(
  durationMs: number,
  totalDurationMs: number,
  screenWidth: number,
): number {
  if (totalDurationMs === 0) return MIN_STEP_WIDTH;

  const proportionalWidth =
    (durationMs / totalDurationMs) * (screenWidth * 0.8);
  return Math.max(MIN_STEP_WIDTH, proportionalWidth);
}

/**
 * Get intensity percentage for height calculation
 */
function getIntensityPercentage(
  targets: IntensityTargetV2[] | undefined,
): number {
  if (!targets || targets.length === 0) return 0;

  const primaryTarget = targets[0];

  switch (primaryTarget.type) {
    case "%FTP":
    case "%MaxHR":
    case "%ThresholdHR":
      return primaryTarget.intensity;
    case "RPE":
      return (primaryTarget.intensity / 10) * 100;
    default:
      return 50; // Default mid-intensity
  }
}

/**
 * Format duration for display
 */
function formatDuration(duration: DurationV2): string {
  switch (duration.type) {
    case "time":
      if (duration.seconds >= 60) {
        return `${Math.round(duration.seconds / 60)}m`;
      }
      return `${duration.seconds}s`;
    case "distance":
      if (duration.meters >= 1000) {
        return `${(duration.meters / 1000).toFixed(1)}km`;
      }
      return `${duration.meters}m`;
    case "repetitions":
      return `${duration.count}x`;
    case "untilFinished":
      return "Open";
    default:
      return "Unknown";
  }
}

/**
 * Format target for display
 */
function formatTarget(targets: IntensityTargetV2[] | undefined): string {
  if (!targets || targets.length === 0) return "Rest";

  const primary = targets[0];

  switch (primary.type) {
    case "%FTP":
      return `${Math.round(primary.intensity)}% FTP`;
    case "%MaxHR":
      return `${Math.round(primary.intensity)}% Max`;
    case "%ThresholdHR":
      return `${Math.round(primary.intensity)}% LT`;
    case "watts":
      return `${Math.round(primary.intensity)}W`;
    case "bpm":
      return `${Math.round(primary.intensity)} bpm`;
    case "RPE":
      return `RPE ${primary.intensity}`;
    default:
      return "";
  }
}

export function ActivityStepChart({
  steps,
  selectedStepIndex,
  onStepPress,
  onStepLongPress,
}: ActivityStepChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const flattenedSteps = flattenStepsForChart(steps);

  // Calculate total duration
  const totalDurationMs = flattenedSteps.reduce(
    (sum, step) => sum + step.durationMs,
    0,
  );

  if (flattenedSteps.length === 0) {
    return (
      <View
        className="bg-muted/30 rounded-lg items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <Text className="text-muted-foreground">No steps added yet</Text>
        <Text className="text-sm text-muted-foreground mt-1">
          Tap + to add your first step
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-card rounded-lg border border-border overflow-hidden">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          alignItems: "flex-end",
        }}
      >
        {flattenedSteps.map((step) => {
          const width = calculateStepWidth(
            step.durationMs,
            totalDurationMs,
            screenWidth,
          );
          const intensityPercent = getIntensityPercentage(step.targets);
          const height = Math.max(
            40,
            (intensityPercent / 100) * (CHART_HEIGHT - 40),
          );

          // Use the helper function from core package
          const color = step.targets?.[0]
            ? getStepIntensityColor({
                name: step.name,
                duration: step.duration,
                targets: step.targets,
              })
            : "#94a3b8";

          const isSelected = step.index === selectedStepIndex;

          return (
            <TouchableOpacity
              key={step.index}
              onPress={() => onStepPress(step.index)}
              onLongPress={() => onStepLongPress(step.index)}
              activeOpacity={0.7}
              style={{
                width: width - STEP_PADDING * 2,
                height,
                marginHorizontal: STEP_PADDING,
              }}
            >
              <View
                className={`flex-1 rounded justify-between p-2 ${
                  isSelected ? "border-2 border-primary" : ""
                }`}
                style={{
                  backgroundColor: color,
                  opacity: isSelected ? 1 : 0.9,
                }}
              >
                {/* Step info */}
                <View>
                  {step.isFromRepetition && (
                    <Text
                      className="text-white text-[10px] font-bold"
                      numberOfLines={1}
                    >
                      REP
                    </Text>
                  )}
                  <Text
                    className="text-white text-xs font-semibold"
                    numberOfLines={1}
                  >
                    {step.name}
                  </Text>
                </View>

                {/* Duration & Target */}
                <View>
                  <Text
                    className="text-white text-[10px] font-medium"
                    numberOfLines={1}
                  >
                    {formatDuration(step.duration)}
                  </Text>
                  <Text className="text-white text-[10px]" numberOfLines={1}>
                    {formatTarget(step.targets)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* X-axis label */}
      <View className="px-4 pb-2 border-t border-border">
        <Text className="text-xs text-muted-foreground text-center">
          {flattenedSteps.length} steps • {Math.round(totalDurationMs / 60000)}{" "}
          min total
        </Text>
      </View>
    </View>
  );
}
