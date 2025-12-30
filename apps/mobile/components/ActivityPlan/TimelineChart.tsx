import { Text } from "@/components/ui/text";
import { getDurationMs } from "@/lib/utils/durationConversion";
import {
  type ActivityPlanStructureV2,
  type IntervalStepV2,
  getStepIntensityColor,
} from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { TouchableWithoutFeedback, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

interface TimelineChartProps {
  structure: ActivityPlanStructureV2;
  selectedStepIndex?: number;
  onStepPress?: (index: number) => void;
  height?: number;
  minStepHeight?: number;
  maxStepHeight?: number;
  compact?: boolean;
}

export function TimelineChart({
  structure,
  selectedStepIndex,
  onStepPress,
  height = 120,
  minStepHeight = 10,
  maxStepHeight,
  compact = false,
}: TimelineChartProps) {
  const svgHeight = height - 16;
  const maxStepHeightValue = maxStepHeight ?? svgHeight - 30;

  // Expand intervals into flat steps for visualization
  const steps: IntervalStepV2[] = useMemo(() => {
    const flatSteps: IntervalStepV2[] = [];
    const intervals = structure.intervals || [];

    for (const interval of intervals) {
      for (let i = 0; i < interval.repetitions; i++) {
        for (const step of interval.steps) {
          flatSteps.push(step);
        }
      }
    }

    return flatSteps;
  }, [structure.intervals]);

  const totalDuration = useMemo(() => {
    return steps.reduce((total, step) => {
      return total + getDurationMs(step.duration);
    }, 0);
  }, [steps]);

  if (steps.length === 0) {
    return (
      <View
        style={{ height }}
        className="border-2 border-dashed border-muted rounded-lg items-center justify-center"
      >
        <Text className="text-muted-foreground">Tap + to add steps</Text>
      </View>
    );
  }

  const chartWidth = 300;
  const chartData = steps.map((step, index) => {
    const durationMs = getDurationMs(step.duration);
    const widthPercent =
      totalDuration > 0 ? (durationMs / totalDuration) * 100 : 0;
    const intensity = step.targets?.[0]?.intensity || 0;
    const color = getStepIntensityColor(step);

    // Calculate height based on intensity (0-100 scale)
    const barHeight =
      minStepHeight + (intensity / 100) * (maxStepHeightValue - minStepHeight);
    const barY = 20 + maxStepHeightValue - barHeight;

    return {
      index,
      widthPercent,
      width: (widthPercent / 100) * chartWidth,
      color,
      isSelected: index === selectedStepIndex,
      step,
      barHeight,
      barY,
    };
  });

  const handleStepPress = (stepIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onStepPress?.(stepIndex);
  };

  return (
    <View style={{ height }} className="w-full px-4 py-2">
      {/* SVG Chart */}
      <View className="relative">
        <Svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${chartWidth} ${svgHeight}`}
        >
          {
            chartData.reduce(
              (acc, data, idx) => {
                const x = acc.currentX;
                const width = data.width;
                const rect = (
                  <Rect
                    key={idx}
                    x={x}
                    y={data.barY}
                    width={width}
                    height={data.barHeight}
                    fill={data.color}
                    opacity={data.isSelected ? 1 : 0.85}
                    stroke={data.isSelected ? "#3B82F6" : "transparent"}
                    strokeWidth={data.isSelected ? 3 : 0}
                    rx={4}
                    ry={4}
                  />
                );

                acc.elements.push(rect);
                acc.currentX = x + width + 2; // Add small gap between bars
                return acc;
              },
              { elements: [] as React.ReactElement[], currentX: 0 },
            ).elements
          }
        </Svg>

        {/* Invisible touchable overlays for step interaction */}
        <View className="absolute inset-0 flex-row">
          {
            chartData.reduce(
              (acc, data, idx) => {
                const x = acc.currentX;
                const width = data.width;

                const overlay = (
                  <TouchableWithoutFeedback
                    key={idx}
                    onPress={() => handleStepPress(data.index)}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: x,
                        top: data.barY,
                        width: width,
                        height: data.barHeight,
                      }}
                    />
                  </TouchableWithoutFeedback>
                );

                acc.elements.push(overlay);
                acc.currentX = x + width + 2;
                return acc;
              },
              { elements: [] as React.ReactElement[], currentX: 0 },
            ).elements
          }
        </View>
      </View>

      {/* Labels */}
      {!compact && (
        <View className="flex-row justify-between mt-2">
          <Text className="text-xs text-muted-foreground">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(totalDuration / 60000)}min
          </Text>
        </View>
      )}

      {/* Selected step info */}
      {!compact &&
        selectedStepIndex !== undefined &&
        steps[selectedStepIndex] && (
          <View className="mt-2 p-2 bg-muted rounded-md">
            <Text className="text-xs font-medium">
              Step {selectedStepIndex + 1}: {steps[selectedStepIndex].name}
            </Text>
            {steps[selectedStepIndex].targets?.[0] && (
              <Text className="text-xs text-muted-foreground">
                {steps[selectedStepIndex].targets![0].type}:{" "}
                {steps[selectedStepIndex].targets![0].intensity}
              </Text>
            )}
          </View>
        )}
    </View>
  );
}
