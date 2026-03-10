import { Text } from "@/components/ui/text";
import { DashPathEffect, useFont } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import React, { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
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
  actual: number;
  goal: number;
};

const chartYKeys: ChartYKey[] = ["projection", "planned", "actual", "goal"];
const chartPadding = { left: 42, right: 14, top: 14, bottom: 28 };
const chartDomainPadding = { left: 0, right: 0, top: 18, bottom: 10 };

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
    color: "rgba(37, 99, 235, 0.95)",
    strokeWidth: 2,
    hint: "Planned workouts",
  },
  actual: {
    label: "Completed",
    color: "rgba(5, 150, 105, 1)",
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
  goalMetrics,
  height = 340,
  showLegend = true,
}: PlanVsActualChartProps) {
  const { width } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(220, width - 32));
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const axisFont = useFont(getAxisFontSource(), 9);
  const useInsightTimeline = !!timeline && timeline.length > 0;

  const normalizedPoints = useMemo<NormalizedPoint[]>(() => {
    if (useInsightTimeline && timeline) {
      return aggregateTimelineByWeek(timeline);
    }

    return buildFallbackPoints({
      actualData,
      projectedData,
      idealData: idealData ?? [],
    });
  }, [actualData, idealData, projectedData, timeline, useInsightTimeline]);

  const [visibleSeries, setVisibleSeries] = useState<
    Record<SeriesKey, boolean>
  >({
    projection: true,
    planned: true,
    actual: true,
  });
  const hasSeriesData = {
    projection: normalizedPoints.some(
      (point) => typeof point.projection === "number",
    ),
    planned: normalizedPoints.some(
      (point) => typeof point.planned === "number",
    ),
    actual: normalizedPoints.some((point) => typeof point.actual === "number"),
  };

  const isEmpty = normalizedPoints.length === 0;
  const hasAnyVisibleSeries = (Object.keys(visibleSeries) as SeriesKey[]).some(
    (series) => visibleSeries[series] && hasSeriesData[series],
  );

  const labels = useMemo(
    () => buildSparseLabels(normalizedPoints),
    [normalizedPoints],
  );
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    [],
  );
  const xTickIndexes = useMemo(
    () => buildAxisTickIndexes(normalizedPoints.length, 6),
    [normalizedPoints.length],
  );

  const goalLineValue =
    !useInsightTimeline && typeof goalMetrics?.targetCTL === "number"
      ? goalMetrics.targetCTL
      : null;

  const chartData = useMemo<ChartDatum[]>(() => {
    const projectionValues = fillSeries(
      normalizedPoints.map((point) => point.projection),
    );
    const plannedValues = fillSeries(
      normalizedPoints.map((point) => point.planned),
    );
    const actualValues = fillSeries(
      normalizedPoints.map((point) => point.actual),
    );

    return normalizedPoints.map((point, index) => ({
      index,
      projection: projectionValues[index] ?? 0,
      planned: plannedValues[index] ?? 0,
      actual: actualValues[index] ?? 0,
      goal: goalLineValue ?? 0,
    }));
  }, [goalLineValue, normalizedPoints]);

  const yAxisMax = useMemo(() => {
    const observedValues = normalizedPoints.flatMap((point) => {
      const values = [point.projection, point.planned, point.actual].filter(
        (value): value is number => typeof value === "number" && value >= 0,
      );
      return values;
    });

    if (typeof goalLineValue === "number" && goalLineValue >= 0) {
      observedValues.push(goalLineValue);
    }

    return computeYAxisMax(observedValues);
  }, [goalLineValue, normalizedPoints]);

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
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Toggle visibility
        </Text>
        <Text className="text-[10px] text-muted-foreground">
          Today: {todayLabel}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5 mb-2">
        {(Object.keys(SERIES_META) as SeriesKey[]).map((series) => {
          const isEnabled = visibleSeries[series];
          const isAvailable = hasSeriesData[series];
          return (
            <Pressable
              key={series}
              disabled={!isAvailable}
              onPress={() =>
                setVisibleSeries((current) => ({
                  ...current,
                  [series]: !current[series],
                }))
              }
              className={`rounded-full border px-2.5 py-0.5 ${isEnabled && isAvailable ? "border-primary/60 bg-primary/10" : "border-border/70 bg-background/70"}`}
            >
              <Text
                className={`text-[11px] ${isEnabled && isAvailable ? "text-primary font-semibold" : "text-muted-foreground"}`}
              >
                {(isEnabled && isAvailable ? "[x] " : "[ ] ") +
                  SERIES_META[series].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
                    labelPosition: "outset",
                    labelOffset: 4,
                    domain: [0, yAxisMax] as [number, number],
                    tickCount: 6,
                    font: axisFont,
                    labelColor: isDark ? "#e2e8f0" : "#334155",
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
                    {visibleSeries.projection && hasSeriesData.projection ? (
                      <>
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
                        <Line
                          points={points.projection}
                          color={SERIES_META.projection.color}
                          strokeWidth={SERIES_META.projection.strokeWidth}
                          curveType="natural"
                          animate={{ type: "timing", duration: 180 }}
                        />
                      </>
                    ) : null}
                    {visibleSeries.planned && hasSeriesData.planned ? (
                      <>
                        <Line
                          points={points.planned}
                          color={SERIES_META.planned.color}
                          strokeWidth={SERIES_META.planned.strokeWidth}
                          curveType="natural"
                          animate={{ type: "timing", duration: 180 }}
                        />
                        <Scatter
                          points={points.planned}
                          radius={3}
                          color={SERIES_META.planned.color}
                          animate={{ type: "timing", duration: 180 }}
                        />
                      </>
                    ) : null}
                    {visibleSeries.actual && hasSeriesData.actual ? (
                      <>
                        <Line
                          points={points.actual}
                          color={SERIES_META.actual.color}
                          strokeWidth={SERIES_META.actual.strokeWidth}
                          curveType="natural"
                          animate={{ type: "timing", duration: 180 }}
                        />
                        <Scatter
                          points={points.actual}
                          radius={3.5}
                          color={SERIES_META.actual.color}
                          animate={{ type: "timing", duration: 180 }}
                        />
                      </>
                    ) : null}
                    {goalLineValue !== null ? (
                      <Line
                        points={points.goal}
                        color="rgba(34, 197, 94, 0.72)"
                        strokeWidth={1.4}
                        curveType="linear"
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
          {(Object.keys(SERIES_META) as SeriesKey[]).map((series) => {
            if (!hasSeriesData[series]) {
              return null;
            }
            return (
              <View key={`${series}-legend`} className="flex-row items-center">
                <View
                  className="w-3.5 h-0.5 mr-1"
                  style={{ backgroundColor: SERIES_META[series].color }}
                />
                <Text className="text-[10px] text-muted-foreground">
                  {SERIES_META[series].hint}
                </Text>
              </View>
            );
          })}
          {goalLineValue !== null ? (
            <View className="flex-row items-center">
              <View className="w-3.5 h-0.5 bg-green-500 mr-1" />
              <Text className="text-[10px] text-muted-foreground">Goal</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
