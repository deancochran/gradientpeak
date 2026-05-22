import { Text } from "@repo/ui/components/text";
import { DashPathEffect, Rect, Line as SkiaLine, useFont, vec } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, useWindowDimensions, View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";

export interface PlanReadinessComparisonPoint {
  date: string;
  actual: number | null;
  scheduled: number | null;
  recommended: number | null;
  recommendedLow?: number | null;
  recommendedHigh?: number | null;
}

export interface PlanReadinessComparisonChartProps {
  points: PlanReadinessComparisonPoint[];
  goalMarkers?: Array<{
    id: string;
    targetDate: string;
    label?: string;
    status?: string;
    color?: string;
    targetMetric?: string | null;
  }>;
  zones?: Array<{ id: string; label: string; min: number; max: number }>;
  today?: string;
  accessibilitySummary?: string;
  height?: number;
  showTitle?: boolean;
}

type SeriesKey = "actual" | "scheduled" | "recommended";
type ChartYKey = SeriesKey | "recommendedLow" | "recommendedHigh";
type ChartDatum = Record<string, unknown> & {
  index: number;
  actual: number | null;
  scheduled: number | null;
  recommended: number | null;
  recommendedLow: number | null;
  recommendedHigh: number | null;
};

const chartPadding = { left: 16, right: 16, top: 18, bottom: 28 };
const chartDomainPadding = { left: 0, right: 0, top: 8, bottom: 8 };
const chartYKeys: ChartYKey[] = [
  "actual",
  "scheduled",
  "recommended",
  "recommendedLow",
  "recommendedHigh",
];

const seriesMeta: Record<SeriesKey, { label: string; color: string; hint: string }> = {
  actual: { label: "Actual", color: "rgba(15, 23, 42, 1)", hint: "Actual readiness" },
  scheduled: {
    label: "Scheduled",
    color: "rgba(100, 116, 139, 0.95)",
    hint: "Scheduled readiness",
  },
  recommended: {
    label: "Recommended",
    color: "rgba(37, 99, 235, 0.95)",
    hint: "Recommended readiness",
  },
};

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("@/assets/fonts/SpaceMono-Regular.ttf") as Parameters<typeof useFont>[0];
  } catch {
    return undefined;
  }
};

function compactDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildAxisTickIndexes(count: number, desiredTicks = 6) {
  if (count <= 0) return [] as number[];
  if (count === 1) return [0];

  const maxIndex = count - 1;
  const tickCount = Math.min(desiredTicks, count);
  const indexes = new Set<number>([0, maxIndex]);

  for (let tick = 1; tick < tickCount - 1; tick += 1) {
    indexes.add(Math.round((maxIndex * tick) / (tickCount - 1)));
  }

  return [...indexes].sort((left, right) => left - right);
}

function getWeekStartDateKey(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return parsed.toISOString().split("T")[0] ?? date;
}

function getYForReadiness(value: number, bounds: { top: number; bottom: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return bounds.bottom - (clamped / 100) * (bounds.bottom - bounds.top);
}

export function PlanReadinessComparisonChart({
  points,
  goalMarkers,
  zones,
  today,
  accessibilitySummary,
  height = 300,
  showTitle = true,
}: PlanReadinessComparisonChartProps) {
  const { width } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(Math.max(220, width - 32));
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisFont = useFont(getAxisFontSource(), 9);

  const chartData = useMemo<ChartDatum[]>(
    () =>
      points.map((point, index) => ({
        index,
        actual: point.actual,
        scheduled: point.scheduled,
        recommended: point.recommended,
        recommendedLow: point.recommendedLow ?? null,
        recommendedHigh: point.recommendedHigh ?? null,
      })),
    [points],
  );
  const labels = useMemo(() => points.map((point) => compactDateLabel(point.date)), [points]);
  const xTickIndexes = useMemo(() => buildAxisTickIndexes(points.length), [points.length]);
  const hasSeriesData = {
    actual: points.some((point) => typeof point.actual === "number"),
    scheduled: points.some((point) => typeof point.scheduled === "number"),
    recommended: points.some((point) => typeof point.recommended === "number"),
  };
  const hasRecommendedRange = points.some(
    (point) =>
      typeof point.recommendedLow === "number" && typeof point.recommendedHigh === "number",
  );
  const groupedGoalMarkers = useMemo(
    () =>
      (goalMarkers ?? [])
        .filter((marker) => marker.id && marker.targetDate)
        .map((marker) => ({ ...marker, weekKey: getWeekStartDateKey(marker.targetDate) })),
    [goalMarkers],
  );
  const todayIndex = useMemo(
    () => (today ? points.findIndex((point) => point.date >= today) : -1),
    [points, today],
  );
  const forecastStartsAtToday = Boolean(
    today &&
      points.length > 0 &&
      (points[0]?.date ?? "") >= today &&
      !points.some((point) => point.date < today && typeof point.actual === "number"),
  );

  const onChartLayout = (event: LayoutChangeEvent) => {
    const measuredWidth = Math.floor(event.nativeEvent.layout.width);
    if (measuredWidth >= 220) setChartWidth(measuredWidth);
  };

  if (points.length === 0) {
    return (
      <View className="h-56 items-center justify-center rounded-md bg-muted/20">
        <Text className="text-sm text-muted-foreground">No readiness forecast data yet</Text>
      </View>
    );
  }

  return (
    <View
      className="py-1"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilitySummary ?? "Readiness forecast chart"}
    >
      <View style={{ height }} onLayout={onChartLayout}>
        {showTitle ? (
          <Text className="mb-1.5 text-sm font-semibold text-foreground">
            Readiness Trajectory (0-100)
          </Text>
        ) : null}
        <View style={{ width: Math.max(200, chartWidth), height: Math.max(210, height - 32) }}>
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
              formatXLabel: (value: unknown) => labels[Math.round(Number(value))] ?? "",
            }}
            yAxis={[
              {
                yKeys: chartYKeys,
                axisSide: "left",
                labelPosition: "inset",
                labelOffset: 4,
                domain: [0, 100] as [number, number],
                tickCount: 5,
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
            {({ points: plottedPoints, chartBounds }) => (
              <>
                {(zones ?? []).map((zone) => {
                  const yTop = getYForReadiness(zone.max, chartBounds);
                  const yBottom = getYForReadiness(zone.min, chartBounds);
                  const color =
                    zone.id === "goal_ready" || zone.id === "peak_ready"
                      ? isDark
                        ? "rgba(37, 99, 235, 0.07)"
                        : "rgba(37, 99, 235, 0.08)"
                      : zone.id === "underprepared"
                        ? isDark
                          ? "rgba(248, 113, 113, 0.06)"
                          : "rgba(248, 113, 113, 0.08)"
                        : isDark
                          ? "rgba(148, 163, 184, 0.04)"
                          : "rgba(148, 163, 184, 0.08)";
                  return (
                    <Rect
                      key={`zone-${zone.id}`}
                      x={chartBounds.left}
                      y={yTop}
                      width={chartBounds.right - chartBounds.left}
                      height={Math.max(1, yBottom - yTop)}
                      color={color}
                    />
                  );
                })}
                {todayIndex >= 0 && plottedPoints.recommended[todayIndex] ? (
                  <SkiaLine
                    p1={vec(plottedPoints.recommended[todayIndex]!.x, chartBounds.bottom)}
                    p2={vec(plottedPoints.recommended[todayIndex]!.x, chartBounds.top)}
                    color={isDark ? "rgba(226, 232, 240, 0.55)" : "rgba(51, 65, 85, 0.5)"}
                    strokeWidth={1.5}
                  >
                    <DashPathEffect intervals={[3, 3]} />
                  </SkiaLine>
                ) : null}
                {hasRecommendedRange ? (
                  <>
                    <Line
                      points={plottedPoints.recommendedHigh.filter((point) => point.yValue != null)}
                      color="rgba(37, 99, 235, 0.22)"
                      strokeWidth={1}
                      curveType="natural"
                    />
                    <Line
                      points={plottedPoints.recommendedLow.filter((point) => point.yValue != null)}
                      color="rgba(37, 99, 235, 0.22)"
                      strokeWidth={1}
                      curveType="natural"
                    />
                  </>
                ) : null}
                {(Object.keys(seriesMeta) as SeriesKey[]).map((series) =>
                  hasSeriesData[series] ? (
                    <Line
                      key={series}
                      points={plottedPoints[series].filter((point) => point.yValue != null)}
                      color={series === "actual" && isDark ? "#f8fafc" : seriesMeta[series].color}
                      strokeWidth={series === "actual" ? 2.4 : 2}
                      curveType="natural"
                      animate={{ type: "timing", duration: 180 }}
                    >
                      {series === "scheduled" ? <DashPathEffect intervals={[6, 4]} /> : null}
                    </Line>
                  ) : null,
                )}
                {groupedGoalMarkers.map((marker) => {
                  const markerIndex = points.findIndex((point) => point.date >= marker.weekKey);
                  const targetPoint =
                    plottedPoints.recommended[markerIndex] ?? plottedPoints.scheduled[markerIndex];
                  if (markerIndex === -1 || !targetPoint) return null;

                  return (
                    <SkiaLine
                      key={`readiness-goal-${marker.id}`}
                      p1={vec(targetPoint.x, chartBounds.bottom)}
                      p2={vec(targetPoint.x, chartBounds.top)}
                      color={marker.color ?? "rgba(37, 99, 235, 0.5)"}
                      strokeWidth={1.5}
                    >
                      <DashPathEffect intervals={[4, 4]} />
                    </SkiaLine>
                  );
                })}
              </>
            )}
          </CartesianChart>
        </View>
      </View>
      {today ? (
        <Text className="mt-1 text-[10px] text-muted-foreground">
          Today marker: {compactDateLabel(today)}
        </Text>
      ) : null}
      {forecastStartsAtToday ? (
        <Text className="mt-1 text-[10px] text-muted-foreground">
          Forecast starts at today because earlier readiness is not observed.
        </Text>
      ) : null}
      {groupedGoalMarkers.length > 0 ? (
        <View className="mt-1 flex-row flex-wrap gap-x-2 gap-y-1">
          {groupedGoalMarkers.slice(0, 3).map((marker) => (
            <Text key={`goal-label-${marker.id}`} className="text-[10px] text-muted-foreground">
              Goal: {marker.label ?? "Goal"} · {compactDateLabel(marker.targetDate)}
            </Text>
          ))}
        </View>
      ) : null}
      <View className="mt-1.5 flex-row flex-wrap gap-x-2.5 gap-y-1">
        {(Object.keys(seriesMeta) as SeriesKey[]).map((series) =>
          hasSeriesData[series] ? (
            <View key={series} className="flex-row items-center">
              <View
                className="mr-1 h-0.5 w-3.5"
                style={{
                  backgroundColor:
                    series === "actual" && isDark ? "#f8fafc" : seriesMeta[series].color,
                }}
              />
              <Text className="text-[10px] text-muted-foreground">{seriesMeta[series].hint}</Text>
            </View>
          ) : null,
        )}
      </View>
    </View>
  );
}
