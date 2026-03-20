import { Text } from "@repo/ui/components/text";
import {
  DashPathEffect,
  useFont,
  Line as SkiaLine,
  Text as SkiaText,
  vec,
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { CartesianChart, Line, Area, Scatter } from "victory-native";

export interface FitnessDataPoint {
  date: string;
  ctl: number;
  atl?: number;
  tsb?: number;
}

export interface InsightTimelinePoint {
  date: string;
  ideal_tss: number;
  scheduled_tss: number;
  actual_tss: number;
  adherence_score: number;
  boundary_state?: "safe" | "caution" | "exceeded";
  boundary_reasons?: string[];
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
  }>;
  goalMetrics?: {
    targetCTL: number;
    targetDate: string;
    description?: string;
  } | null;
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

const chartYKeys: ChartYKey[] = ["projection", "planned", "actual", "goal"];
const chartPadding = { left: 16, right: 16, top: 24, bottom: 28 };
const chartDomainPadding = { left: 0, right: 0, top: 10, bottom: 0 };

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("@/assets/fonts/SpaceMono-Regular.ttf") as Parameters<
      typeof useFont
    >[0];
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
    hint: "Recommended load",
  },
  planned: {
    label: "Planned",
    color: "rgba(96, 165, 250, 0.95)",
    strokeWidth: 2,
    hint: "Planned load",
  },
  actual: {
    label: "Completed",
    color: "rgba(15, 23, 42, 1)",
    strokeWidth: 2.25,
    hint: "Completed workouts",
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

function aggregateTimelineByWeek(timeline: InsightTimelinePoint[]) {
  const buckets = new Map<
    string,
    {
      projection: number;
      planned: number;
      actual: number;
      adherenceTotal: number;
      adherenceCount: number;
    }
  >();

  for (const point of timeline) {
    const weekKey = getWeekStartDateKey(point.date);
    const current = buckets.get(weekKey) ?? {
      projection: 0,
      planned: 0,
      actual: 0,
      adherenceTotal: 0,
      adherenceCount: 0,
    };

    current.projection += point.ideal_tss || 0;
    current.planned += point.scheduled_tss || 0;
    current.actual += point.actual_tss || 0;
    current.adherenceTotal += point.adherence_score || 0;
    current.adherenceCount += 1;

    buckets.set(weekKey, current);
  }

  const sortedWeeks = [...buckets.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return sortedWeeks.map(([weekKey, bucket], index) => ({
    index,
    date: weekKey,
    projection: Math.round(bucket.projection * 10) / 10,
    planned: Math.round(bucket.planned * 10) / 10,
    actual: Math.round(bucket.actual * 10) / 10,
    adherenceScore:
      bucket.adherenceCount > 0
        ? bucket.adherenceTotal / bucket.adherenceCount
        : undefined,
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

function fillSeries(values: Array<number | null>) {
  const firstKnown = values.find(
    (value): value is number => typeof value === "number",
  );
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
  const idealByDate = new Map(
    idealData.map((point) => [point.date, point.ctl]),
  );
  const projectedByDate = new Map(
    projectedData.map((point) => [point.date, point.ctl]),
  );
  const actualByDate = new Map(
    actualData.map((point) => [point.date, point.ctl]),
  );

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
    planned: projectedByDate.get(date) ?? null,
    actual: actualByDate.get(date) ?? null,
  }));
}

export function PlanVsActualChart({
  timeline,
  actualData,
  projectedData,
  idealData,
  goalMarkers,
  goalMetrics,
  height = 340,
  showLegend = true,
}: PlanVsActualChartProps) {
  const { width } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(220, width - 32));
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
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
      const thirtyDaysAgoWeek = getWeekStartDateKey(
        thirtyDaysAgo.toISOString().split("T")[0],
      );

      const goalDateObj = new Date(`${latestGoalTargetDate}T12:00:00.000Z`);
      if (!Number.isNaN(goalDateObj.getTime())) {
        goalDateObj.setDate(goalDateObj.getDate() + 30);
      }
      const goalPlusThirtyWeek = getWeekStartDateKey(
        goalDateObj.toISOString().split("T")[0],
      );

      const sIdx = base.findIndex((p) => p.date >= thirtyDaysAgoWeek);
      const eIdx = base.findIndex((p) => p.date >= goalPlusThirtyWeek);

      if (sIdx !== -1) startIndex = sIdx;
      if (eIdx !== -1) endIndex = eIdx;
      else if (base.length > 0) endIndex = base.length - 1;
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoWeek = getWeekStartDateKey(
        thirtyDaysAgo.toISOString().split("T")[0],
      );

      const sIdx = base.findIndex((p) => p.date >= thirtyDaysAgoWeek);

      const revBase = [...base].reverse();
      const revEIdx = revBase.findIndex(
        (p) => (p.planned ?? 0) > 0 || (p.actual ?? 0) > 0,
      );

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
      } else if (
        futureIdx === -1 &&
        base.length > 0 &&
        base.length - 1 > endIndex
      ) {
        endIndex = base.length - 1;
      }
    }

    startIndex = Math.max(0, startIndex - 1);
    endIndex = Math.min(base.length - 1, endIndex + 1);

    if (startIndex > endIndex) return base;
    return base
      .slice(startIndex, endIndex + 1)
      .map((p, i) => ({ ...p, index: i }));
  }, [
    actualData,
    idealData,
    projectedData,
    timeline,
    useInsightTimeline,
    latestGoalTargetDate,
  ]);

  const hasSeriesData = {
    projection: framedPoints.some(
      (point) => typeof point.projection === "number",
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
        weekKey: string;
        targetDate: string;
        count: number;
      }
    >();

    for (const marker of normalizedGoalMarkers) {
      const weekKey = getWeekStartDateKey(marker.targetDate);
      const existing = grouped.get(weekKey);
      if (existing) {
        existing.count += 1;
        continue;
      }

      grouped.set(weekKey, {
        weekKey,
        targetDate: marker.targetDate,
        count: 1,
      });
    }

    return [...grouped.values()];
  }, [normalizedGoalMarkers]);

  const chartData = useMemo<ChartDatum[]>(() => {
    const projectionValues = fillSeries(
      framedPoints.map((point) => point.projection),
    );
    const plannedValues = fillSeries(
      framedPoints.map((point) => point.planned),
    );
    const actualValues = framedPoints.map((point) => point.actual);

    return framedPoints.map((point, index) => ({
      index,
      projection: projectionValues[index] ?? 0,
      planned: plannedValues[index] ?? 0,
      actual: actualValues[index] ?? null,
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
    let lastLabeledIndex = -Infinity;

    return groupedGoalMarkers.map((marker) => {
      const markerIndex = framedPoints.findIndex(
        (point) => point.date >= marker.weekKey,
      );
      const shouldShowLabel = markerIndex - lastLabeledIndex >= 2;

      if (shouldShowLabel) {
        lastLabeledIndex = markerIndex;
      }

      return {
        ...marker,
        markerIndex,
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
              {isEmpty
                ? "No chart data available"
                : "Enable at least one series"}
            </Text>
          </View>
        ) : (
          <View className="flex-1">
            <View className="mb-1.5">
              <Text className="text-sm font-semibold text-foreground">
                Weekly Training Load (TSS)
              </Text>
            </View>
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
                    labelColor: isDark
                      ? "rgba(71, 85, 105, 0.8)"
                      : "rgba(148, 163, 184, 0.8)",
                    lineColor: isDark
                      ? "rgba(71, 85, 105, 0.4)"
                      : "rgba(148, 163, 184, 0.45)",
                    lineWidth: 1,
                    linePathEffect: <DashPathEffect intervals={[4, 4]} />,
                    formatYLabel: (value: unknown) =>
                      `${Math.round(Number(value))}`,
                  },
                ]}
                frame={{
                  lineColor: isDark
                    ? "rgba(71, 85, 105, 0.8)"
                    : "rgba(148, 163, 184, 0.8)",
                  lineWidth: { bottom: 1, left: 1, right: 0, top: 0 },
                }}
              >
                {({ points, chartBounds }) => (
                  <>
                    {hasSeriesData.projection ? (
                      <Area
                        points={points.projection}
                        y0={chartBounds.bottom}
                        color={SERIES_META.projection.color.replace(
                          "0.95)",
                          "0.15)",
                        )}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}

                    {hasSeriesData.planned ? (
                      <>
                        <Area
                          points={points.planned}
                          y0={chartBounds.bottom}
                          color={SERIES_META.planned.color.replace(
                            "0.95)",
                            "0.15)",
                          )}
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
                      if (marker.markerIndex === -1) {
                        return null;
                      }

                      const targetPoint =
                        points.projection[marker.markerIndex] ||
                        points.planned[marker.markerIndex] ||
                        points.actual[marker.markerIndex];
                      if (!targetPoint) {
                        return null;
                      }

                      const goalDateStr = compactDateLabel(marker.targetDate);
                      const goalLabel =
                        marker.count > 1
                          ? `${goalDateStr} (${marker.count})`
                          : goalDateStr;
                      const fontTextWidth =
                        axisFont && typeof axisFont.getTextWidth === "function"
                          ? axisFont.getTextWidth(goalLabel)
                          : goalLabel.length * 5;
                      const minX = chartBounds.left;
                      const maxX = chartBounds.right - fontTextWidth;
                      const labelX = Math.min(
                        Math.max(targetPoint.x - fontTextWidth / 2, minX),
                        Math.max(minX, maxX),
                      );
                      const labelY =
                        chartBounds.top + 8 + (markerOrder % 2) * 10;

                      return (
                        <React.Fragment key={`goal-marker-${marker.weekKey}`}>
                          <SkiaLine
                            p1={vec(targetPoint.x, chartBounds.bottom)}
                            p2={vec(targetPoint.x, chartBounds.top + 12)}
                            color="rgba(34, 197, 94, 0.6)"
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
              <View className="w-3.5 h-0.5 bg-green-500 mr-1" />
              <Text className="text-[10px] text-muted-foreground">
                {groupedGoalMarkers.length > 1 ? "Goal dates" : "Goal"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
