import {
  aggregateTrainingLoadTimelineByWeek,
  type LegacyTrainingLoadTimelinePoint,
  type TrainingLoadTimelinePoint,
} from "@repo/core/plan/trainingLoadTimeline";
import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  Line as SkiaLine,
  Rect as SkiaRect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, useWindowDimensions, View } from "react-native";
import { Area, CartesianChart, Line, Scatter } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";

export interface FitnessDataPoint {
  date: string;
  ctl: number;
  atl?: number;
  tsb?: number;
}

export type LoadChartTimelinePoint = TrainingLoadTimelinePoint | LegacyTrainingLoadTimelinePoint;

export interface InsightTimelinePoint extends LegacyTrainingLoadTimelinePoint {
  recommended_load_tss?: number;
  scheduled_load_tss?: number;
  completed_load_tss?: number;
}

export interface PlanVsActualChartProps {
  timeline?: InsightTimelinePoint[];
  actualData: FitnessDataPoint[];
  projectedData: FitnessDataPoint[];
  idealData?: Array<{ date: string; ctl: number }>;
  goalMarkers?: Array<{
    id: string;
    targetDate: string;
    label?: string;
    status?: string;
    color?: string;
    targetMetric?: string | null;
  }>;
  goalMetrics?: {
    targetCTL: number;
    targetDate: string;
    description?: string;
  } | null;
  highlightedRange?: {
    start: string;
    end: string;
  } | null;
  height?: number;
  showLegend?: boolean;
}

export interface FitnessFatigueFormChartProps {
  actualData: FitnessDataPoint[];
  projectedData?: FitnessDataPoint[];
  height?: number;
  showLegend?: boolean;
}

type SeriesKey = "projection" | "planned" | "actual";

interface NormalizedPoint {
  index: number;
  date: string;
  projection: number | null;
  planned: number | null;
  actual: number | null;
  adherenceScore?: number;
}

type ChartYKey = SeriesKey | "goal";

type ChartDatum = Record<string, unknown> & {
  index: number;
  projection: number;
  planned: number;
  actual: number | null;
  goal: number;
};

type FitnessChartYKey = "fitness" | "fatigue" | "form" | "projectedFitness";

type FitnessChartDatum = Record<string, unknown> & {
  index: number;
  fitness: number | null;
  fatigue: number | null;
  form: number | null;
  projectedFitness: number | null;
};

type FitnessChartPoint = {
  index: number;
  date: string;
  fitness: number | null;
  fatigue: number | null;
  form: number | null;
  projectedFitness: number | null;
};

const chartYKeys: ChartYKey[] = ["projection", "planned", "actual", "goal"];
const fitnessChartYKeys: FitnessChartYKey[] = ["fitness", "fatigue", "form", "projectedFitness"];
const chartPadding = { left: 16, right: 16, top: 24, bottom: 28 };
const chartDomainPadding = { left: 0, right: 0, top: 10, bottom: 0 };
const GOAL_MARKER_COLOR = "rgba(34, 197, 94, 0.68)";

const FITNESS_SERIES_META: Record<
  FitnessChartYKey,
  { label: string; color: string; strokeWidth: number; hint: string }
> = {
  fitness: {
    label: "Fitness",
    color: "rgba(34, 197, 94, 0.95)",
    strokeWidth: 2.25,
    hint: "Fitness",
  },
  fatigue: {
    label: "Fatigue",
    color: "rgba(239, 68, 68, 0.95)",
    strokeWidth: 2,
    hint: "Fatigue",
  },
  form: {
    label: "Form",
    color: "rgba(96, 165, 250, 0.95)",
    strokeWidth: 2,
    hint: "Form",
  },
  projectedFitness: {
    label: "Projected fitness",
    color: "rgba(34, 197, 94, 0.5)",
    strokeWidth: 2,
    hint: "Projected fitness",
  },
};

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("@/assets/fonts/SpaceMono-Regular.ttf") as Parameters<typeof useFont>[0];
  } catch {
    return undefined;
  }
};

const SERIES_META: Record<
  SeriesKey,
  { label: string; color: string; strokeWidth: number; hint: string }
> = {
  projection: {
    label: "Recommended",
    color: "rgba(107, 114, 128, 0.95)",
    strokeWidth: 2,
    hint: "Recommended",
  },
  planned: {
    label: "Scheduled",
    color: "rgba(96, 165, 250, 0.95)",
    strokeWidth: 2,
    hint: "Scheduled",
  },
  actual: {
    label: "Actual",
    color: "rgba(15, 23, 42, 1)",
    strokeWidth: 2.25,
    hint: "Actual",
  },
};

function compactDateLabel(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildSparseLabels(points: NormalizedPoint[]) {
  if (points.length === 0) {
    return [];
  }

  return points.map((point) => compactDateLabel(point.date));
}

function getWeekStartDateKey(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return parsed.toISOString().split("T")[0] ?? date;
}

function aggregateTimelineByWeek(timeline: LoadChartTimelinePoint[]) {
  return aggregateTrainingLoadTimelineByWeek(timeline).map((week, index) => ({
    index,
    date: week.week_start,
    projection: week.recommended_load_tss,
    planned: week.scheduled_load_tss,
    actual: week.completed_load_tss,
  }));
}

function buildAxisTickIndexes(count: number, desiredTicks = 6) {
  if (count <= 0) {
    return [] as number[];
  }

  if (count === 1) {
    return [0];
  }

  const maxIndex = count - 1;
  const tickCount = Math.min(desiredTicks, count);
  const indexes = new Set<number>([0, maxIndex]);

  for (let tick = 1; tick < tickCount - 1; tick += 1) {
    const ratio = tick / (tickCount - 1);
    indexes.add(Math.round(maxIndex * ratio));
  }

  return [...indexes].sort((a, b) => a - b);
}

function computeYAxisMax(values: number[]) {
  const maxObserved = values.length > 0 ? Math.max(...values) : 0;
  if (!Number.isFinite(maxObserved) || maxObserved <= 0) {
    return 200;
  }

  const padded = maxObserved * 1.1;
  return Math.max(100, Math.ceil(padded / 50) * 50);
}

function computeYAxisDomain(values: number[]) {
  const observedValues = values.filter((value) => Number.isFinite(value));
  if (observedValues.length === 0) {
    return [-50, 100] as [number, number];
  }

  const minObserved = Math.min(...observedValues);
  const maxObserved = Math.max(...observedValues);
  const padding = Math.max(10, (maxObserved - minObserved) * 0.12);
  const min = Math.floor((minObserved - padding) / 10) * 10;
  const max = Math.ceil((maxObserved + padding) / 10) * 10;

  return [Math.min(0, min), Math.max(50, max)] as [number, number];
}

function fillSeries(values: Array<number | null>) {
  const firstKnown = values.find((value): value is number => typeof value === "number");
  const seed = firstKnown ?? 0;
  let previous = seed;

  return values.map((value) => {
    if (typeof value === "number") {
      previous = value;
      return value;
    }
    return previous;
  });
}

function buildFallbackPoints({
  actualData,
  projectedData,
  idealData,
}: {
  actualData: FitnessDataPoint[];
  projectedData: FitnessDataPoint[];
  idealData: Array<{ date: string; ctl: number }>;
}): NormalizedPoint[] {
  const idealByDate = new Map(idealData.map((point) => [point.date, point.ctl]));
  const projectedByDate = new Map(projectedData.map((point) => [point.date, point.ctl]));
  const actualByDate = new Map(actualData.map((point) => [point.date, point.ctl]));

  const primaryDates =
    idealData.length > 0
      ? idealData.map((point) => point.date)
      : projectedData.length > 0
        ? projectedData.map((point) => point.date)
        : actualData.map((point) => point.date);

  return primaryDates.map((date, index) => ({
    index,
    date,
    projection: idealByDate.get(date) ?? null,
    planned: projectedByDate.get(date) ?? 0,
    actual: actualByDate.get(date) ?? 0,
  }));
}

function dateToTimestamp(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function interpolateMarkerX(
  targetDate: string,
  points: Array<{ x: number }>,
  framedPoints: NormalizedPoint[],
) {
  const targetTime = dateToTimestamp(targetDate);
  if (targetTime === null || points.length === 0 || framedPoints.length === 0) {
    return null;
  }

  const pointTimes = framedPoints.map((point) => dateToTimestamp(point.date));
  const firstTime = pointTimes[0];
  const lastTime = pointTimes[pointTimes.length - 1];
  if (
    typeof firstTime !== "number" ||
    typeof lastTime !== "number" ||
    targetTime < firstTime ||
    targetTime > lastTime
  ) {
    return null;
  }

  for (let index = 0; index < framedPoints.length; index += 1) {
    const pointTime = pointTimes[index];
    if (pointTime === null) continue;
    if (targetTime === pointTime) {
      return points[index]?.x ?? null;
    }

    const nextTime = pointTimes[index + 1];
    const currentPoint = points[index];
    const nextPoint = points[index + 1];
    if (
      typeof nextTime !== "number" ||
      !currentPoint ||
      !nextPoint ||
      targetTime < pointTime ||
      targetTime > nextTime
    ) {
      continue;
    }

    const ratio = (targetTime - pointTime) / (nextTime - pointTime);
    return currentPoint.x + (nextPoint.x - currentPoint.x) * ratio;
  }

  return null;
}

export function PlanVsActualChart({
  timeline,
  actualData,
  projectedData,
  idealData,
  goalMarkers,
  goalMetrics,
  highlightedRange,
  height = 340,
  showLegend = true,
}: PlanVsActualChartProps) {
  const { width } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(220, width - 32));
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisFont = useFont(getAxisFontSource(), 9);
  const useInsightTimeline = !!timeline && timeline.length > 0;
  const normalizedGoalMarkers = useMemo(
    () =>
      (goalMarkers ?? [])
        .filter(
          (marker): marker is NonNullable<typeof goalMarkers>[number] =>
            Boolean(marker?.id) && Boolean(marker?.targetDate),
        )
        .sort((left, right) => left.targetDate.localeCompare(right.targetDate)),
    [goalMarkers],
  );
  const latestGoalTargetDate =
    normalizedGoalMarkers[normalizedGoalMarkers.length - 1]?.targetDate ??
    goalMetrics?.targetDate ??
    null;

  const framedPoints = useMemo<NormalizedPoint[]>(() => {
    let base =
      useInsightTimeline && timeline
        ? aggregateTimelineByWeek(timeline)
        : buildFallbackPoints({
            actualData,
            projectedData,
            idealData: idealData ?? [],
          });

    const todayStr = new Date().toISOString().split("T")[0];
    const todayWeek = getWeekStartDateKey(todayStr);

    let startIndex = 0;
    let endIndex = base.length - 1;

    if (latestGoalTargetDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoWeek = getWeekStartDateKey(thirtyDaysAgo.toISOString().split("T")[0]);

      const goalDateObj = new Date(`${latestGoalTargetDate}T12:00:00.000Z`);
      if (!Number.isNaN(goalDateObj.getTime())) {
        goalDateObj.setDate(goalDateObj.getDate() + 30);
      }
      const goalPlusThirtyWeek = getWeekStartDateKey(goalDateObj.toISOString().split("T")[0]);

      const sIdx = base.findIndex((p) => p.date >= thirtyDaysAgoWeek);
      const eIdx = base.findIndex((p) => p.date >= goalPlusThirtyWeek);

      if (sIdx !== -1) startIndex = sIdx;
      if (eIdx !== -1) endIndex = eIdx;
      else if (base.length > 0) endIndex = base.length - 1;
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoWeek = getWeekStartDateKey(thirtyDaysAgo.toISOString().split("T")[0]);

      const sIdx = base.findIndex((p) => p.date >= thirtyDaysAgoWeek);

      const revBase = [...base].reverse();
      const revEIdx = revBase.findIndex((p) => (p.planned ?? 0) > 0 || (p.actual ?? 0) > 0);

      if (sIdx !== -1) startIndex = sIdx;
      if (revEIdx !== -1) endIndex = base.length - 1 - revEIdx;

      const thirtyDaysFuture = new Date();
      thirtyDaysFuture.setDate(thirtyDaysFuture.getDate() + 30);
      const thirtyDaysFutureWeek = getWeekStartDateKey(
        thirtyDaysFuture.toISOString().split("T")[0],
      );
      const futureIdx = base.findIndex((p) => p.date >= thirtyDaysFutureWeek);
      if (futureIdx !== -1 && futureIdx > endIndex) {
        endIndex = futureIdx;
      } else if (futureIdx === -1 && base.length > 0 && base.length - 1 > endIndex) {
        endIndex = base.length - 1;
      }
    }

    startIndex = Math.max(0, startIndex - 1);
    endIndex = Math.min(base.length - 1, endIndex + 1);

    if (startIndex > endIndex) return base;
    return base.slice(startIndex, endIndex + 1).map((p, i) => ({ ...p, index: i }));
  }, [actualData, idealData, projectedData, timeline, useInsightTimeline, latestGoalTargetDate]);

  const hasSeriesData = {
    projection: framedPoints.some(
      (point) => typeof point.projection === "number" && point.projection > 0,
    ),
    planned: framedPoints.some((point) => typeof point.planned === "number"),
    actual: framedPoints.some((point) => typeof point.actual === "number"),
  };

  const isEmpty = framedPoints.length === 0;
  const hasAnyVisibleSeries = true;

  const labels = useMemo(() => buildSparseLabels(framedPoints), [framedPoints]);
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    [],
  );
  const xTickIndexes = useMemo(
    () => buildAxisTickIndexes(framedPoints.length, 6),
    [framedPoints.length],
  );

  const goalLineValue =
    !useInsightTimeline && typeof goalMetrics?.targetCTL === "number"
      ? goalMetrics.targetCTL
      : null;
  const groupedGoalMarkers = useMemo(() => {
    const grouped = new Map<
      string,
      {
        targetDate: string;
        count: number;
        color: string;
      }
    >();

    for (const marker of normalizedGoalMarkers) {
      const existing = grouped.get(marker.targetDate);
      if (existing) {
        existing.count += 1;
        continue;
      }

      grouped.set(marker.targetDate, {
        targetDate: marker.targetDate,
        count: 1,
        color: GOAL_MARKER_COLOR,
      });
    }

    return [...grouped.values()];
  }, [normalizedGoalMarkers]);

  const chartData = useMemo<ChartDatum[]>(() => {
    const projectionValues = fillSeries(framedPoints.map((point) => point.projection));
    const plannedValues = fillSeries(framedPoints.map((point) => point.planned));
    const actualValues = framedPoints.map((point) => point.actual ?? 0);

    return framedPoints.map((point, index) => ({
      index,
      projection: projectionValues[index] ?? 0,
      planned: plannedValues[index] ?? 0,
      actual: actualValues[index] ?? 0,
      goal: goalLineValue ?? 0,
    }));
  }, [goalLineValue, framedPoints]);

  const yAxisMax = useMemo(() => {
    const observedValues = framedPoints.flatMap((point) => {
      const values = [point.projection, point.planned, point.actual].filter(
        (value): value is number => typeof value === "number" && value >= 0,
      );
      return values;
    });

    if (typeof goalLineValue === "number" && goalLineValue >= 0) {
      observedValues.push(goalLineValue);
    }

    return computeYAxisMax(observedValues);
  }, [goalLineValue, framedPoints]);

  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220) {
      setChartWidth(measuredWidth);
    }
  };

  const chartContainerHeight = Math.max(220, height - 92);
  const chartHeight = Math.max(210, chartContainerHeight - 24);
  const goalMarkerLabelMeta = useMemo(() => {
    let lastLabeledX = -Infinity;

    return groupedGoalMarkers.map((marker) => {
      const targetTime = dateToTimestamp(marker.targetDate);
      const shouldShowLabel =
        targetTime !== null && targetTime - lastLabeledX >= 1000 * 60 * 60 * 24 * 14;

      if (shouldShowLabel) {
        lastLabeledX = targetTime;
      }

      return {
        ...marker,
        shouldShowLabel,
      };
    });
  }, [framedPoints, groupedGoalMarkers]);

  return (
    <View className="py-1">
      <View style={{ height: chartContainerHeight }} onLayout={onChartLayout}>
        {isEmpty || !hasAnyVisibleSeries ? (
          <View className="flex-1 items-center justify-center bg-muted/20 rounded-md">
            <Text className="text-muted-foreground text-sm">
              {isEmpty ? "No chart data available" : "Enable at least one series"}
            </Text>
          </View>
        ) : (
          <View className="flex-1">
            <View
              style={{
                width: Math.max(200, chartWidth),
                height: chartHeight,
              }}
            >
              <CartesianChart<ChartDatum, "index", ChartYKey>
                data={chartData}
                xKey="index"
                yKeys={chartYKeys}
                padding={chartPadding}
                domainPadding={chartDomainPadding}
                xAxis={{
                  axisSide: "bottom",
                  tickValues: xTickIndexes,
                  font: axisFont,
                  labelColor: isDark ? "#e2e8f0" : "#334155",
                  lineColor: "transparent",
                  lineWidth: 0,
                  formatXLabel: (value: unknown) => {
                    const index = Math.round(Number(value));
                    return labels[index] ?? "";
                  },
                }}
                yAxis={[
                  {
                    yKeys: chartYKeys,
                    axisSide: "left",
                    labelPosition: "inset",
                    labelOffset: 4,
                    domain: [0, yAxisMax] as [number, number],
                    tickCount: 6,
                    font: axisFont,
                    labelColor: isDark ? "rgba(71, 85, 105, 0.8)" : "rgba(148, 163, 184, 0.8)",
                    lineColor: isDark ? "rgba(71, 85, 105, 0.4)" : "rgba(148, 163, 184, 0.45)",
                    lineWidth: 1,
                    linePathEffect: <DashPathEffect intervals={[4, 4]} />,
                    formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
                  },
                ]}
                frame={{
                  lineColor: isDark ? "rgba(71, 85, 105, 0.8)" : "rgba(148, 163, 184, 0.8)",
                  lineWidth: { bottom: 1, left: 1, right: 0, top: 0 },
                }}
              >
                {({ points, chartBounds }) => (
                  <>
                    {highlightedRange
                      ? (() => {
                          const highlightedIndexes = framedPoints
                            .map((point, index) => ({ point, index }))
                            .filter(
                              ({ point }) =>
                                point.date >= highlightedRange.start &&
                                point.date <= highlightedRange.end,
                            )
                            .map(({ index }) => index);
                          const firstIndex = highlightedIndexes[0] ?? -1;
                          const lastIndex = highlightedIndexes[highlightedIndexes.length - 1] ?? -1;
                          const firstPoint = points.projection[firstIndex];
                          const lastPoint = points.projection[lastIndex];

                          if (firstIndex < 0 || lastIndex < 0 || !firstPoint || !lastPoint) {
                            return null;
                          }

                          const previousPoint =
                            firstIndex > 0 ? points.projection[firstIndex - 1] : null;
                          const nextPoint =
                            lastIndex < points.projection.length - 1
                              ? points.projection[lastIndex + 1]
                              : null;
                          const leftStep = previousPoint
                            ? firstPoint.x - previousPoint.x
                            : nextPoint
                              ? nextPoint.x - firstPoint.x
                              : chartBounds.right - chartBounds.left;
                          const rightStep = nextPoint
                            ? nextPoint.x - lastPoint.x
                            : previousPoint
                              ? lastPoint.x - previousPoint.x
                              : chartBounds.right - chartBounds.left;
                          const left = Math.max(
                            chartBounds.left,
                            firstPoint.x - Math.abs(leftStep) / 2,
                          );
                          const right = Math.min(
                            chartBounds.right,
                            lastPoint.x + Math.abs(rightStep) / 2,
                          );

                          return (
                            <SkiaRect
                              x={left}
                              y={chartBounds.top}
                              width={Math.max(2, right - left)}
                              height={chartBounds.bottom - chartBounds.top}
                              color={
                                isDark ? "rgba(59, 130, 246, 0.14)" : "rgba(59, 130, 246, 0.12)"
                              }
                            />
                          );
                        })()
                      : null}

                    {hasSeriesData.projection ? (
                      <Area
                        points={points.projection}
                        y0={chartBounds.bottom}
                        color={SERIES_META.projection.color.replace("0.95)", "0.15)")}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}

                    {hasSeriesData.planned ? (
                      <>
                        <Area
                          points={points.planned}
                          y0={chartBounds.bottom}
                          color={SERIES_META.planned.color.replace("0.95)", "0.15)")}
                          curveType="natural"
                          animate={{ type: "timing", duration: 180 }}
                        />
                        <Line
                          points={points.planned}
                          color={SERIES_META.planned.color}
                          strokeWidth={SERIES_META.planned.strokeWidth}
                          curveType="natural"
                          animate={{ type: "timing", duration: 180 }}
                        />
                      </>
                    ) : null}

                    {hasSeriesData.actual ? (
                      <Line
                        points={points.actual.filter((p) => p.yValue != null)}
                        color={isDark ? "#f8fafc" : "#0f172a"}
                        strokeWidth={SERIES_META.actual.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}

                    {goalMarkerLabelMeta.map((marker, markerOrder) => {
                      const markerX = interpolateMarkerX(
                        marker.targetDate,
                        points.projection,
                        framedPoints,
                      );
                      if (markerX === null) {
                        return null;
                      }

                      const goalDateStr = compactDateLabel(marker.targetDate);
                      const goalLabel =
                        marker.count > 1 ? `${goalDateStr} (${marker.count})` : goalDateStr;
                      const fontTextWidth =
                        axisFont && typeof axisFont.getTextWidth === "function"
                          ? axisFont.getTextWidth(goalLabel)
                          : goalLabel.length * 5;
                      const minX = chartBounds.left;
                      const maxX = chartBounds.right - fontTextWidth;
                      const labelX = Math.min(
                        Math.max(markerX - fontTextWidth / 2, minX),
                        Math.max(minX, maxX),
                      );
                      const labelY = chartBounds.top + 8 + (markerOrder % 2) * 10;

                      return (
                        <React.Fragment key={`goal-marker-${marker.targetDate}`}>
                          <SkiaLine
                            p1={vec(markerX, chartBounds.bottom)}
                            p2={vec(markerX, chartBounds.top + 12)}
                            color={marker.color}
                            strokeWidth={2}
                          >
                            <DashPathEffect intervals={[4, 4]} />
                          </SkiaLine>
                          {axisFont && marker.shouldShowLabel ? (
                            <SkiaText
                              x={labelX}
                              y={labelY}
                              text={goalLabel}
                              font={axisFont}
                              color={isDark ? "#e2e8f0" : "#334155"}
                            />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
              </CartesianChart>
            </View>
          </View>
        )}
      </View>

      {showLegend ? (
        <View className="mt-1.5 flex-row flex-wrap gap-x-2.5 gap-y-1">
          {(Object.keys(SERIES_META) as SeriesKey[]).map((series) => {
            if (!hasSeriesData[series]) {
              return null;
            }
            return (
              <View key={`${series}-legend`} className="flex-row items-center">
                <View
                  className="w-3.5 h-0.5 mr-1"
                  style={{
                    backgroundColor:
                      series === "actual"
                        ? isDark
                          ? "#f8fafc"
                          : "#0f172a"
                        : SERIES_META[series].color,
                  }}
                />
                <Text className="text-[10px] text-muted-foreground">
                  {SERIES_META[series].hint}
                </Text>
              </View>
            );
          })}
          {goalLineValue !== null || groupedGoalMarkers.length > 0 ? (
            <View className="flex-row items-center">
              <View className="w-3.5 h-0.5 mr-1" style={{ backgroundColor: GOAL_MARKER_COLOR }} />
              <Text className="text-[10px] text-muted-foreground">Goal</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function FitnessFatigueFormChart({
  actualData,
  projectedData = [],
  height = 260,
  showLegend = true,
}: FitnessFatigueFormChartProps) {
  const { width } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(220, width - 32));
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisFont = useFont(getAxisFontSource(), 9);

  const framedPoints = useMemo<FitnessChartPoint[]>(() => {
    const actualPoints = actualData.map((point) => ({
      date: point.date,
      fitness: point.ctl,
      fatigue: point.atl ?? null,
      form: point.tsb ?? null,
      projectedFitness: null as number | null,
    }));
    const projectedPoints = projectedData.map((point) => ({
      date: point.date,
      fitness: null as number | null,
      fatigue: null as number | null,
      form: null as number | null,
      projectedFitness: point.ctl,
    }));
    const pointsByDate = new Map<string, Omit<FitnessChartPoint, "index">>();

    for (const point of [...actualPoints, ...projectedPoints]) {
      const existing = pointsByDate.get(point.date);
      pointsByDate.set(point.date, {
        date: point.date,
        fitness: point.fitness ?? existing?.fitness ?? null,
        fatigue: point.fatigue ?? existing?.fatigue ?? null,
        form: point.form ?? existing?.form ?? null,
        projectedFitness: point.projectedFitness ?? existing?.projectedFitness ?? null,
      });
    }

    return [...pointsByDate.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point, index) => ({ ...point, index }));
  }, [actualData, projectedData]);

  const hasSeriesData = {
    fitness: framedPoints.some((point) => typeof point.fitness === "number"),
    fatigue: framedPoints.some((point) => typeof point.fatigue === "number"),
    form: framedPoints.some((point) => typeof point.form === "number"),
    projectedFitness: framedPoints.some((point) => typeof point.projectedFitness === "number"),
  };
  const isEmpty = framedPoints.length === 0;
  const labels = useMemo(
    () => framedPoints.map((point) => compactDateLabel(point.date)),
    [framedPoints],
  );
  const xTickIndexes = useMemo(
    () => buildAxisTickIndexes(framedPoints.length, 6),
    [framedPoints.length],
  );
  const chartData = useMemo<FitnessChartDatum[]>(() => {
    return framedPoints.map((point) => ({
      index: point.index,
      fitness: point.fitness,
      fatigue: point.fatigue,
      form: point.form,
      projectedFitness: point.projectedFitness,
    }));
  }, [framedPoints]);
  const yAxisDomain = useMemo(
    () =>
      computeYAxisDomain(
        framedPoints.flatMap((point) =>
          [point.fitness, point.fatigue, point.form, point.projectedFitness].filter(
            (value): value is number => typeof value === "number",
          ),
        ),
      ),
    [framedPoints],
  );

  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220) {
      setChartWidth(measuredWidth);
    }
  };

  const chartContainerHeight = Math.max(220, height - 92);
  const chartHeight = Math.max(210, chartContainerHeight - 24);

  return (
    <View className="py-1">
      <View style={{ height: chartContainerHeight }} onLayout={onChartLayout}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center rounded-md bg-muted/20">
            <Text className="text-sm text-muted-foreground">No chart data available</Text>
          </View>
        ) : (
          <View className="flex-1">
            <View style={{ width: Math.max(200, chartWidth), height: chartHeight }}>
              <CartesianChart<FitnessChartDatum, "index", FitnessChartYKey>
                data={chartData}
                xKey="index"
                yKeys={fitnessChartYKeys}
                padding={chartPadding}
                domainPadding={chartDomainPadding}
                xAxis={{
                  axisSide: "bottom",
                  tickValues: xTickIndexes,
                  font: axisFont,
                  labelColor: isDark ? "#e2e8f0" : "#334155",
                  lineColor: "transparent",
                  lineWidth: 0,
                  formatXLabel: (value: unknown) => {
                    const index = Math.round(Number(value));
                    return labels[index] ?? "";
                  },
                }}
                yAxis={[
                  {
                    yKeys: fitnessChartYKeys,
                    axisSide: "left",
                    labelPosition: "inset",
                    labelOffset: 4,
                    domain: yAxisDomain,
                    tickCount: 6,
                    font: axisFont,
                    labelColor: isDark ? "rgba(71, 85, 105, 0.8)" : "rgba(148, 163, 184, 0.8)",
                    lineColor: isDark ? "rgba(71, 85, 105, 0.4)" : "rgba(148, 163, 184, 0.45)",
                    lineWidth: 1,
                    linePathEffect: <DashPathEffect intervals={[4, 4]} />,
                    formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
                  },
                ]}
                frame={{
                  lineColor: isDark ? "rgba(71, 85, 105, 0.8)" : "rgba(148, 163, 184, 0.8)",
                  lineWidth: { bottom: 1, left: 1, right: 0, top: 0 },
                }}
              >
                {({ points }) => (
                  <>
                    {hasSeriesData.fitness ? (
                      <Line
                        points={points.fitness.filter((point) => point.yValue != null)}
                        color={FITNESS_SERIES_META.fitness.color}
                        strokeWidth={FITNESS_SERIES_META.fitness.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
                    {hasSeriesData.fatigue ? (
                      <Line
                        points={points.fatigue.filter((point) => point.yValue != null)}
                        color={FITNESS_SERIES_META.fatigue.color}
                        strokeWidth={FITNESS_SERIES_META.fatigue.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
                    {hasSeriesData.form ? (
                      <Line
                        points={points.form.filter((point) => point.yValue != null)}
                        color={FITNESS_SERIES_META.form.color}
                        strokeWidth={FITNESS_SERIES_META.form.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
                    {hasSeriesData.projectedFitness ? (
                      <Line
                        points={points.projectedFitness.filter((point) => point.yValue != null)}
                        color={FITNESS_SERIES_META.projectedFitness.color}
                        strokeWidth={FITNESS_SERIES_META.projectedFitness.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
                  </>
                )}
              </CartesianChart>
            </View>
          </View>
        )}
      </View>

      {showLegend ? (
        <View className="mt-1.5 flex-row flex-wrap gap-x-2.5 gap-y-1">
          {(Object.keys(FITNESS_SERIES_META) as FitnessChartYKey[]).map((series) => {
            if (!hasSeriesData[series]) {
              return null;
            }

            return (
              <View key={`${series}-legend`} className="flex-row items-center">
                <View
                  className="mr-1 h-0.5 w-3.5"
                  style={{ backgroundColor: FITNESS_SERIES_META[series].color }}
                />
                <Text className="text-[10px] text-muted-foreground">
                  {FITNESS_SERIES_META[series].hint}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
