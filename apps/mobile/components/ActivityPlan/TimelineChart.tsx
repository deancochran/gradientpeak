import {
  type ActivityPlanStructureV2,
  getStepIntensityColor,
  type IntervalStepV2,
  type IntervalV2,
} from "@repo/core/schemas/activity_plan_v2";
import { Text } from "@repo/ui/components/text";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Pressable, ScrollView, TouchableWithoutFeedback, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { getDurationMs } from "@/lib/utils/durationConversion";

interface IntervalIssueSummary {
  interval: number;
  step: number;
  total: number;
}

interface TimelineChartProps {
  structure: ActivityPlanStructureV2;
  selectedStepIndex?: number;
  selectedIntervalId?: string | null;
  onStepPress?: (index: number) => void;
  onIntervalPress?: (intervalId: string) => void;
  height?: number;
  minStepHeight?: number;
  maxStepHeight?: number;
  compact?: boolean;
  showIntervalIndicators?: boolean;
  showLegend?: boolean;
  intervalIssues?: Record<string, IntervalIssueSummary>;
}

export function TimelineChart({
  structure,
  selectedStepIndex,
  selectedIntervalId,
  onStepPress,
  onIntervalPress,
  height = 132,
  minStepHeight = 10,
  maxStepHeight,
  compact = false,
  intervalIssues,
}: TimelineChartProps) {
  const margin = { top: 2, right: 2, bottom: 16, left: 22 };
  const gapWithinInterval = 2;
  const gapBetweenIntervals = 8;
  const minAxisY = 0;

  const intervalMeta = useMemo(
    () =>
      (structure.intervals || []).map((interval, index) => {
        const durationPerRepMs = interval.steps.reduce(
          (sum, step) => sum + getDurationMs(step.duration),
          0,
        );

        return {
          interval,
          index,
          durationPerRepMs,
          totalDurationMs: durationPerRepMs * interval.repetitions,
        };
      }),
    [structure.intervals],
  );

  const flattenedSteps = useMemo(() => {
    const flatSteps: Array<{
      step: IntervalStepV2;
      intervalId: string;
      intervalIndex: number;
    }> = [];

    intervalMeta.forEach(({ interval, index: intervalIndex }) => {
      for (let i = 0; i < interval.repetitions; i += 1) {
        interval.steps.forEach((step) => {
          flatSteps.push({
            step,
            intervalId: interval.id,
            intervalIndex,
          });
        });
      }
    });

    return flatSteps;
  }, [intervalMeta]);

  const steps = useMemo(() => flattenedSteps.map((entry) => entry.step), [flattenedSteps]);

  const maxAxisY = useMemo(() => {
    const maxIntensity = flattenedSteps.reduce((max, entry) => {
      const intensity = entry.step.targets?.[0]?.intensity ?? 0;
      return intensity > max ? intensity : max;
    }, 0);

    return maxIntensity > 0 ? maxIntensity : 1;
  }, [flattenedSteps]);

  const totalDuration = useMemo(
    () =>
      flattenedSteps.reduce((total, entry) => {
        return total + getDurationMs(entry.step.duration);
      }, 0),
    [flattenedSteps],
  );

  const totalGapWidth = useMemo(() => {
    if (flattenedSteps.length <= 1) {
      return 0;
    }

    let width = 0;
    flattenedSteps.forEach((entry, index) => {
      if (index === flattenedSteps.length - 1) {
        return;
      }

      const nextEntry = flattenedSteps[index + 1];
      width +=
        nextEntry.intervalIndex !== entry.intervalIndex ? gapBetweenIntervals : gapWithinInterval;
    });

    return width;
  }, [flattenedSteps]);

  const chartWidth = useMemo(() => {
    const minWidth = 340;
    const byStepCount = flattenedSteps.length * 30 + totalGapWidth + margin.left + margin.right;
    const byIntervals = intervalMeta.length * 92 + margin.left + margin.right;
    return Math.max(minWidth, byStepCount, byIntervals);
  }, [flattenedSteps.length, intervalMeta.length, totalGapWidth]);

  const plotWidth = Math.max(120, chartWidth - margin.left - margin.right);
  const plotHeight = Math.max(36, height - margin.top - margin.bottom);
  const maxBarHeight = maxStepHeight ?? plotHeight;

  const usablePlotWidth = Math.max(plotWidth - totalGapWidth, plotWidth * 0.62);

  const derivedSelectedIntervalId = useMemo(() => {
    if (selectedIntervalId) {
      return selectedIntervalId;
    }

    if (selectedStepIndex !== undefined && flattenedSteps[selectedStepIndex]?.intervalId) {
      return flattenedSteps[selectedStepIndex].intervalId;
    }

    return null;
  }, [flattenedSteps, selectedIntervalId, selectedStepIndex]);

  const chartData = useMemo(() => {
    return flattenedSteps.map((entry, index) => {
      const durationMs = getDurationMs(entry.step.duration);
      const widthPercent = totalDuration > 0 ? (durationMs / totalDuration) * 100 : 0;
      const intensity = entry.step.targets?.[0]?.intensity ?? 0;

      const barHeight = minStepHeight + (intensity / maxAxisY) * (maxBarHeight - minStepHeight);
      const barY = margin.top + plotHeight - barHeight;

      return {
        index,
        width: (widthPercent / 100) * usablePlotWidth,
        color: getStepIntensityColor(entry.step),
        isSelected: index === selectedStepIndex,
        barHeight,
        barY,
        intervalIndex: entry.intervalIndex,
        intervalId: entry.intervalId,
        isInSelectedInterval:
          !!derivedSelectedIntervalId && entry.intervalId === derivedSelectedIntervalId,
      };
    });
  }, [
    derivedSelectedIntervalId,
    flattenedSteps,
    margin.top,
    maxBarHeight,
    minStepHeight,
    maxAxisY,
    plotHeight,
    selectedStepIndex,
    totalDuration,
    usablePlotWidth,
  ]);

  const positionedBars = useMemo(() => {
    return chartData.reduce(
      (acc, bar, index) => {
        const x = acc.currentX;
        const nextBar = chartData[index + 1];
        const gap = nextBar
          ? nextBar.intervalIndex !== bar.intervalIndex
            ? gapBetweenIntervals
            : gapWithinInterval
          : 0;

        acc.items.push({
          ...bar,
          x,
        });
        acc.currentX = x + bar.width + gap;
        return acc;
      },
      {
        items: [] as Array<
          (typeof chartData)[number] & {
            x: number;
          }
        >,
        currentX: 0,
      },
    ).items;
  }, [chartData]);

  const intervalSegments = useMemo(() => {
    const segments = new Map<
      string,
      {
        interval: IntervalV2;
        intervalIndex: number;
        xStart: number;
        xEnd: number;
        durationPerRepMs: number;
        totalDurationMs: number;
      }
    >();

    positionedBars.forEach((bar) => {
      const interval = structure.intervals[bar.intervalIndex];
      if (!interval) {
        return;
      }

      const existing = segments.get(interval.id);
      if (!existing) {
        const durationPerRepMs = intervalMeta[bar.intervalIndex]?.durationPerRepMs ?? 0;
        segments.set(interval.id, {
          interval,
          intervalIndex: bar.intervalIndex,
          xStart: bar.x,
          xEnd: bar.x + bar.width,
          durationPerRepMs,
          totalDurationMs: durationPerRepMs * interval.repetitions,
        });
        return;
      }

      existing.xStart = Math.min(existing.xStart, bar.x);
      existing.xEnd = Math.max(existing.xEnd, bar.x + bar.width);
    });

    return Array.from(segments.values()).sort((a, b) => a.intervalIndex - b.intervalIndex);
  }, [intervalMeta, positionedBars, structure.intervals]);

  const maxAxisXMinutes = Math.max(0, Math.round(totalDuration / 60000));

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

  const handleStepPress = (stepIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onStepPress?.(stepIndex);
  };

  const handleIntervalPress = (intervalId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIntervalPress?.(intervalId);
  };

  return (
    <View className="w-full">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: chartWidth, height }} className="relative">
          <Svg width={chartWidth} height={height}>
            <SvgText
              x={margin.left - 3}
              y={margin.top + 7}
              fontSize={9}
              fill="#64748B"
              textAnchor="end"
            >
              {maxAxisY}
            </SvgText>

            <SvgText
              x={margin.left - 3}
              y={margin.top + plotHeight + 3}
              fontSize={9}
              fill="#64748B"
              textAnchor="end"
            >
              {minAxisY}
            </SvgText>

            {positionedBars.map((bar) => (
              <Rect
                key={bar.index}
                x={margin.left + bar.x}
                y={bar.barY}
                width={bar.width}
                height={bar.barHeight}
                fill={bar.color}
                opacity={bar.isSelected ? 1 : bar.isInSelectedInterval ? 0.95 : 0.82}
                stroke={bar.isSelected || bar.isInSelectedInterval ? "#2563EB" : "transparent"}
                strokeWidth={bar.isSelected ? 2.6 : bar.isInSelectedInterval ? 1.2 : 0}
                rx={3}
                ry={3}
              />
            ))}

            {intervalSegments.map((segment) => (
              <SvgText
                key={`interval-label-${segment.interval.id}`}
                x={margin.left + (segment.xStart + segment.xEnd) / 2}
                y={margin.top + plotHeight + 11}
                fontSize={9}
                fill="#64748B"
                textAnchor="middle"
              >
                I{segment.intervalIndex + 1}
              </SvgText>
            ))}

            <SvgText x={margin.left} y={height - 2} fontSize={9} fill="#64748B" textAnchor="start">
              0
            </SvgText>

            <SvgText
              x={chartWidth - margin.right}
              y={height - 2}
              fontSize={9}
              fill="#64748B"
              textAnchor="end"
            >
              {maxAxisXMinutes}
            </SvgText>
          </Svg>

          {onIntervalPress && intervalSegments.length > 0 ? (
            <View className="absolute inset-0">
              {intervalSegments.map((segment) => {
                const isSelected = derivedSelectedIntervalId === segment.interval.id;
                const rawWidth = segment.xEnd - segment.xStart;
                const segmentWidth = Math.max(rawWidth, 48);
                const segmentLeft = margin.left + segment.xStart - (segmentWidth - rawWidth) / 2;
                const intervalDurationMinutes = Math.max(
                  1,
                  Math.round(segment.totalDurationMs / 60000),
                );

                return (
                  <Pressable
                    key={segment.interval.id}
                    onPress={() => handleIntervalPress(segment.interval.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Interval ${segment.intervalIndex + 1}${isSelected ? ", selected" : ""}, ${intervalDurationMinutes} minutes, ${segment.interval.repetitions} repeats`}
                    accessibilityHint="Opens interval editor sheet"
                    style={{
                      position: "absolute",
                      left: segmentLeft,
                      top: margin.top,
                      width: segmentWidth,
                      height: plotHeight,
                      borderRadius: 6,
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: isSelected ? "#2563EB" : "transparent",
                      backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                    }}
                  />
                );
              })}
            </View>
          ) : onStepPress ? (
            <View className="absolute inset-0 flex-row">
              {positionedBars.map((bar) => (
                <TouchableWithoutFeedback
                  key={bar.index}
                  onPress={() => handleStepPress(bar.index)}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: margin.left + bar.x - (Math.max(bar.width, 44) - bar.width) / 2,
                      top: margin.top,
                      width: Math.max(bar.width, 44),
                      height: plotHeight,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Step ${bar.index + 1}`}
                    accessibilityHint="Opens step editor"
                  />
                </TouchableWithoutFeedback>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {!compact ? (
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(totalDuration / 60000)} min
          </Text>
        </View>
      ) : null}

      {!compact && selectedStepIndex !== undefined && steps[selectedStepIndex] ? (
        <View className="mt-1 rounded-md bg-muted p-2">
          <Text className="text-xs font-medium">
            Step {selectedStepIndex + 1}: {steps[selectedStepIndex].name}
          </Text>
          {steps[selectedStepIndex].targets?.[0] ? (
            <Text className="text-xs text-muted-foreground">
              {steps[selectedStepIndex].targets![0].type}:{" "}
              {steps[selectedStepIndex].targets![0].intensity}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
