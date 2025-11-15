import { Text } from "@/components/ui/text";
import {
  calculateTotalDuration,
  flattenPlanSteps,
  getDurationMs,
  getIntensityColor,
  type ActivityPlanStructure,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { TouchableWithoutFeedback, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

interface TimelineChartProps {
  structure: ActivityPlanStructure;
  selectedStepIndex?: number;
  onStepPress?: (index: number) => void;
  height?: number;
}

export function TimelineChart({
  structure,
  selectedStepIndex,
  onStepPress,
  height = 120,
}: TimelineChartProps) {
  const flatSteps = useMemo(
    () => flattenPlanSteps(structure.steps || []),
    [structure.steps],
  );

  const totalDuration = useMemo(
    () => calculateTotalDuration(flatSteps),
    [flatSteps],
  );

  if (flatSteps.length === 0) {
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
  const chartData = flatSteps.map((step, index) => {
    const durationMs = step.duration ? getDurationMs(step.duration) : 0;
    const widthPercent =
      totalDuration > 0 ? (durationMs / totalDuration) * 100 : 0;
    const intensity = step.targets?.[0]?.intensity || 0;
    const type = step.targets?.[0]?.type;
    const color = getIntensityColor(intensity, type);

    return {
      index,
      widthPercent,
      width: (widthPercent / 100) * chartWidth,
      color,
      isSelected: index === selectedStepIndex,
      step,
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
          height={height - 16}
          viewBox={`0 0 ${chartWidth} ${height - 16}`}
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
                    y={20}
                    width={width}
                    height={height - 56}
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
                        top: 20,
                        width: width,
                        height: height - 56,
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
      <View className="flex-row justify-between mt-2">
        <Text className="text-xs text-muted-foreground">
          {flatSteps.length} step{flatSteps.length !== 1 ? "s" : ""}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {Math.round(totalDuration / 60000)}min
        </Text>
      </View>

      {/* Selected step info */}
      {selectedStepIndex !== undefined && flatSteps[selectedStepIndex] && (
        <View className="mt-2 p-2 bg-muted rounded-md">
          <Text className="text-xs font-medium">
            Step {selectedStepIndex + 1}: {flatSteps[selectedStepIndex].name}
          </Text>
          {flatSteps[selectedStepIndex].targets?.[0] && (
            <Text className="text-xs text-muted-foreground">
              {flatSteps[selectedStepIndex].targets![0].type}:{" "}
              {flatSteps[selectedStepIndex].targets![0].intensity}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
