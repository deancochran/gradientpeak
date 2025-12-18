import { Text } from "@/components/ui/text";
import {
  type Duration,
  type IntensityTarget,
  type StepOrRepetition,
  getDurationMs,
  getIntensityColor,
} from "@repo/core";
import { Dimensions, ScrollView, TouchableOpacity, View } from "react-native";

interface ActivityStepChartProps {
  steps: StepOrRepetition[];
  selectedStepIndex: number | null;
  onStepPress: (index: number) => void;
  onStepLongPress: (index: number) => void;
}

interface FlattenedChartStep {
  index: number;
  name?: string;
  duration: Duration | undefined;
  targets: IntensityTargetV2[] | undefined;
  durationMs: number;
  isRepetition: boolean;
  repetitionIndex?: number;
  stepInRepetition?: number;
}

const MIN_STEP_WIDTH = 60;
const CHART_HEIGHT = 200;
const STEP_PADDING = 4;

/**
 * Flatten steps for chart visualization
 */
function flattenStepsForChart(steps: StepOrRepetition[]): FlattenedChartStep[] {
  const flattened: FlattenedChartStep[] = [];
  let globalIndex = 0;

  for (const step of steps) {
    if (step.type === "step") {
      flattened.push({
        index: globalIndex++,
        name: step.name,
        duration: step.duration,
        targets: step.targets,
        durationMs: step.duration ? getDurationMs(step.duration) : 0,
        isRepetition: false,
      });
    } else if (step.type === "repetition") {
      // Add each repetition cycle
      for (let repIndex = 0; repIndex < step.repeat; repIndex++) {
        for (let stepIndex = 0; stepIndex < step.steps.length; stepIndex++) {
          const repStep = step.steps[stepIndex];
          flattened.push({
            index: globalIndex++,
            name: repStep.name,
            duration: repStep.duration,
            targets: repStep.targets,
            durationMs: repStep.duration ? getDurationMs(repStep.duration) : 0,
            isRepetition: true,
            repetitionIndex: repIndex,
            stepInRepetition: stepIndex,
          });
        }
      }
    }
  }

  return flattened;
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
function formatDuration(duration: Duration | undefined): string {
  if (!duration || duration === "untilFinished") return "Open";

  switch (duration.type) {
    case "time":
      if (duration.unit === "minutes") {
        return `${duration.value}m`;
      }
      return `${duration.value}s`;
    case "distance":
      if (duration.unit === "km") {
        return `${duration.value}km`;
      }
      return `${duration.value}m`;
    case "repetitions":
      return `${duration.value}x`;
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

          const color = step.targets?.[0]
            ? getIntensityColor(intensityPercent, step.targets[0].type)
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
                  {step.isRepetition && step.repetitionIndex === 0 && (
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
                    {step.name || `Step ${step.index + 1}`}
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
