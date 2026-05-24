import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { CheckCircle2, Timer, Zap } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, useColorScheme, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { CompactInsightCard, type DateRange, DetailChartModal } from "@/components/shared";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { getActivityInsightVisualPolicy } from "@/lib/insights/visualPolicy";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type ActivityEffortRow = {
  id: string;
  activity_category: string;
  duration_seconds: number;
  effort_type: string;
  recorded_at: string | Date;
  unit: string;
  value: number;
};

type EffortPoint = {
  effortId: string;
  label: string;
  duration: number;
  value: number;
};

type ActivityEffortCurve = {
  id: string;
  title: string;
  unit: string;
  records: ActivityEffortRow[];
  points: EffortPoint[];
};

type ChartPoint = { x: number; y: number };

type EffortChartBounds = {
  minDuration: number;
  maxDuration: number;
  minValue: number;
  maxValue: number;
};

const EFFORT_CURVE_OPTIONS = ["power", "speed"] as const;
const EFFORT_CURVE_DURATION_TICKS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 14400];

function getEffortChartColors(isDark: boolean) {
  return {
    axis: isDark ? "#64748b" : "#94a3b8",
    current: isDark ? "#fb923c" : "#f97316",
    grid: isDark ? "#334155" : "#e2e8f0",
    label: isDark ? "#94a3b8" : "#64748b",
    previous: isDark ? "#94a3b8" : "#94a3b8",
  };
}

function getCurveTitle(effortType: string) {
  if (effortType === "power") return "Power curve";
  if (effortType === "speed") return "Pace / speed curve";
  return `${effortType.replace(/_/g, " ")} curve`;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatValue(effort: ActivityEffortRow) {
  return `${Number(effort.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${effort.unit}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Number(seconds / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function scaleDuration(duration: number, minDuration: number, maxDuration: number) {
  const safeDuration = Math.max(duration, 1);
  const safeMin = Math.max(minDuration, 1);
  const safeMax = Math.max(maxDuration, safeMin + 1);
  const minLog = Math.log1p(safeMin);
  const maxLog = Math.log1p(safeMax);

  return (Math.log1p(safeDuration) - minLog) / (maxLog - minLog || 1);
}

function getDurationTicks(minDuration: number, maxDuration: number) {
  const ticks = EFFORT_CURVE_DURATION_TICKS.filter(
    (tick) => tick >= minDuration && tick <= maxDuration,
  );

  ticks.unshift(minDuration);
  ticks.push(maxDuration);

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function getCoordinates(points: EffortPoint[], width: number, height: number, padding: number) {
  const values = points.map((point) => point.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 1;
  const valueRange = maxValue - minValue || Math.max(maxValue * 0.1, 1);
  const minDuration = Math.max(Math.min(...points.map((point) => point.duration)), 1);
  const maxDuration = Math.max(...points.map((point) => point.duration), minDuration + 1);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  return points.map((point) => ({
    x: padding + scaleDuration(point.duration, minDuration, maxDuration) * chartWidth,
    y: padding + (1 - (point.value - minValue) / valueRange) * chartHeight,
  }));
}

function getEffortChartBounds(points: EffortPoint[]): EffortChartBounds {
  const durations = points.map((point) => point.duration).filter(Number.isFinite);
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const rawMinDuration = durations.length > 0 ? Math.min(...durations) : 1;
  const minDuration = Math.max(rawMinDuration, 1);
  const maxDuration = durations.length > 0 ? Math.max(...durations, minDuration + 1) : 2;
  const rawMinValue = values.length > 0 ? Math.min(...values) : 0;
  const rawMaxValue = values.length > 0 ? Math.max(...values) : 1;
  const valueRange = rawMaxValue - rawMinValue || Math.max(rawMaxValue * 0.1, 1);
  const valuePadding = valueRange * 0.08;

  return {
    minDuration,
    maxDuration,
    minValue: Math.max(0, rawMinValue - valuePadding),
    maxValue: rawMaxValue + valuePadding,
  };
}

function getEffortChartCoordinates(
  points: EffortPoint[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  bounds: EffortChartBounds,
): ChartPoint[] {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const valueRange = bounds.maxValue - bounds.minValue || 1;

  return points.map((point) => ({
    x:
      padding.left +
      scaleDuration(point.duration, bounds.minDuration, bounds.maxDuration) * chartWidth,
    y: padding.top + (1 - (point.value - bounds.minValue) / valueRange) * chartHeight,
  }));
}

function formatAxisValue(value: number, unit: string) {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: value >= 10 ? 0 : 1 })}${unit ? ` ${unit}` : ""}`;
}

function filterRecordsByRange(records: ActivityEffortRow[], dateRange: DateRange) {
  if (dateRange === "all") return records;

  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return records.filter((record) => new Date(record.recorded_at) >= cutoff);
}

function buildBestCurve(records: ActivityEffortRow[]) {
  const bestByDuration = new Map<number, ActivityEffortRow>();

  for (const record of records) {
    const current = bestByDuration.get(record.duration_seconds);
    if (!current || record.value > current.value) {
      bestByDuration.set(record.duration_seconds, record);
    }
  }

  return [...bestByDuration.entries()]
    .sort(([durationA], [durationB]) => durationA - durationB)
    .map(([duration, record]) => ({
      duration,
      effortId: record.id,
      label: formatDuration(duration),
      value: Number(record.value),
    }));
}

function buildEarliestComparableCurve(records: ActivityEffortRow[]) {
  if (records.length === 0) return [];

  const chronological = [...records].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const earliestDay = new Date(chronological[0]?.recorded_at);
  earliestDay.setHours(23, 59, 59, 999);

  return buildBestCurve(
    chronological.filter(
      (record) => new Date(record.recorded_at).getTime() <= earliestDay.getTime(),
    ),
  );
}

function getCurveBest(records: ActivityEffortRow[]) {
  return records.reduce<ActivityEffortRow | null>((best, record) => {
    if (!best || record.value > best.value) return record;
    return best;
  }, null);
}

function getCurveEffortIds(records: ActivityEffortRow[]) {
  return new Set([
    ...buildEarliestComparableCurve(records).map((point) => point.effortId),
    ...buildBestCurve(records).map((point) => point.effortId),
  ]);
}

function MiniEffortVisual({ points }: { points: EffortPoint[] }) {
  const colors = getEffortChartColors(useColorScheme() === "dark");
  if (points.length === 0) return <View className="h-12 rounded-2xl bg-muted/30" />;
  const width = 120;
  const height = 52;
  const coordinates = getCoordinates(points.slice(-12), width, height, 8);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={buildPath(coordinates)}
        stroke={colors.current}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coordinates.at(-1) ? (
        <Circle cx={coordinates.at(-1)?.x} cy={coordinates.at(-1)?.y} r={4} fill={colors.current} />
      ) : null}
    </Svg>
  );
}

function EffortDetailChart({
  curve,
  records,
}: {
  curve: ActivityEffortCurve;
  records: ActivityEffortRow[];
}) {
  const width = 340;
  const height = 260;
  const colors = getEffortChartColors(useColorScheme() === "dark");
  const presentPoints = buildBestCurve(records);
  const earliestPoints = buildEarliestComparableCurve(records);
  const allPoints = [...presentPoints, ...earliestPoints];
  const padding = { top: 20, right: 18, bottom: 44, left: 54 };
  const bounds = getEffortChartBounds(allPoints);
  const presentCoordinates = getEffortChartCoordinates(
    presentPoints,
    width,
    height,
    padding,
    bounds,
  );
  const earliestCoordinates = getEffortChartCoordinates(
    earliestPoints,
    width,
    height,
    padding,
    bounds,
  );
  const chartLeft = padding.left;
  const chartRight = width - padding.right;
  const chartTop = padding.top;
  const chartBottom = height - padding.bottom;
  const valueTicks = [
    bounds.maxValue,
    bounds.minValue + (bounds.maxValue - bounds.minValue) / 2,
    bounds.minValue,
  ];
  const durationTicks = getDurationTicks(bounds.minDuration, bounds.maxDuration);
  const best = getCurveBest(records);

  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-4 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="gap-1">
            <Text className="text-lg font-semibold capitalize text-foreground">{curve.title}</Text>
            <Text className="text-sm text-muted-foreground">
              Your best curve compared with your first recorded curve from {records.length} records.
            </Text>
          </View>
          <Text className="text-lg font-semibold text-foreground">
            {best ? `Best ${formatValue(best)}` : "No data"}
          </Text>
        </View>
        {presentPoints.length < 2 ? (
          <View className="h-[260px] items-center justify-center rounded-2xl bg-muted/20">
            <Text className="text-center text-sm font-medium text-foreground">
              Not enough data to draw this curve yet.
            </Text>
            <Text className="mt-2 px-6 text-center text-xs text-muted-foreground">
              Save efforts at two or more durations to compute a curve. Available efforts are listed
              below.
            </Text>
          </View>
        ) : (
          <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
            {valueTicks.map((tick) => {
              const valueRange = bounds.maxValue - bounds.minValue || 1;
              const y =
                chartTop + (1 - (tick - bounds.minValue) / valueRange) * (chartBottom - chartTop);
              return (
                <React.Fragment key={`value-${tick}`}>
                  <Line
                    x1={chartLeft}
                    x2={chartRight}
                    y1={y}
                    y2={y}
                    stroke={colors.grid}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={chartLeft - 8}
                    y={y + 4}
                    fill={colors.label}
                    fontSize={10}
                    textAnchor="end"
                  >
                    {formatAxisValue(tick, curve.unit)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            <Line
              x1={chartLeft}
              x2={chartLeft}
              y1={chartTop}
              y2={chartBottom}
              stroke={colors.axis}
              strokeWidth={1.5}
            />
            <Line
              x1={chartLeft}
              x2={chartRight}
              y1={chartBottom}
              y2={chartBottom}
              stroke={colors.axis}
              strokeWidth={1.5}
            />
            {durationTicks.map((tick) => {
              const x =
                chartLeft +
                scaleDuration(tick, bounds.minDuration, bounds.maxDuration) *
                  (chartRight - chartLeft);
              return (
                <React.Fragment key={`duration-${tick}`}>
                  <Line
                    x1={x}
                    x2={x}
                    y1={chartBottom}
                    y2={chartBottom + 4}
                    stroke={colors.axis}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={x}
                    y={chartBottom + 18}
                    fill={colors.label}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {formatDuration(Math.round(tick))}
                  </SvgText>
                </React.Fragment>
              );
            })}
            <SvgText
              x={(chartLeft + chartRight) / 2}
              y={height - 4}
              fill={colors.label}
              fontSize={11}
              textAnchor="middle"
            >
              Duration
            </SvgText>
            <Path
              d={buildPath(earliestCoordinates)}
              stroke={colors.previous}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={buildPath(presentCoordinates)}
              stroke={colors.current}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {presentCoordinates.map((point, index) => (
              <Circle
                key={`${curve.id}-${index}`}
                cx={point.x}
                cy={point.y}
                r={3.5}
                fill={colors.current}
              />
            ))}
          </Svg>
        )}
        <View className="flex-row gap-4">
          <View className="flex-row items-center gap-2">
            <View className="h-2 w-5 rounded-full bg-slate-400" />
            <Text className="text-xs text-muted-foreground">First records</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="h-2 w-5 rounded-full bg-orange-500" />
            <Text className="text-xs text-muted-foreground">Best so far</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function EffortRecords({
  onOpenRecord,
  records,
}: {
  onOpenRecord: (recordId: string) => void;
  records: ActivityEffortRow[];
}) {
  const curveEffortIds = React.useMemo(() => getCurveEffortIds(records), [records]);

  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-3 p-4">
        <Text className="text-base font-semibold text-foreground">Effort records</Text>
        {records.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No records in this range.</Text>
        ) : null}
        {records.map((record) => (
          <Pressable
            key={record.id}
            onPress={() => onOpenRecord(record.id)}
            className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-muted/10 px-4 py-3"
            testID={`activity-effort-record-${record.id}`}
          >
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-foreground">{formatValue(record)}</Text>
                {curveEffortIds.has(record.id) ? (
                  <Icon as={CheckCircle2} size={14} className="text-primary" />
                ) : null}
              </View>
              <Text className="text-xs text-muted-foreground">
                {formatDate(record.recorded_at)} • {record.duration_seconds}s
              </Text>
            </View>
            <Text className="text-xs font-medium text-primary">Open</Text>
          </Pressable>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityEffortsList() {
  const navigateTo = useAppNavigate();
  const { data: effortsData, isLoading, error } = api.activityEfforts.getForProfile.useQuery();
  const efforts = (effortsData ?? []) as ActivityEffortRow[];
  const effortCurves = React.useMemo(() => {
    const curves = new Map<string, ActivityEffortRow[]>();
    for (const effort of efforts) {
      curves.set(effort.effort_type, [...(curves.get(effort.effort_type) ?? []), effort]);
    }

    return EFFORT_CURVE_OPTIONS.map((id) => {
      const records = curves.get(id) ?? [];
      const sorted = [...records].sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
      );
      return {
        id,
        title: getCurveTitle(id),
        unit: sorted[0]?.unit ?? (id === "power" ? "W" : "speed"),
        records: sorted,
        points: buildBestCurve(sorted),
      } satisfies ActivityEffortCurve;
    });
  }, [efforts]);
  const [selectedCurveId, setSelectedCurveId] = React.useState<string | null>(null);
  const selectedCurve = effortCurves.find((curve) => curve.id === selectedCurveId) ?? null;
  const handleOpenRecord = React.useCallback(
    (recordId: string) => {
      setSelectedCurveId(null);
      requestAnimationFrame(() => {
        navigateTo(ROUTES.ACTIVITIES.EFFORT_DETAIL(recordId) as any);
      });
    },
    [navigateTo],
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Loading efforts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-base font-semibold text-foreground">Unable to load efforts</Text>
        <Text className="mt-2 text-sm text-muted-foreground">{error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => navigateTo("/(internal)/(standard)/activity-effort-create" as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="activity-efforts-list-add-trigger"
            >
              <Text className="text-sm font-medium text-primary">Add</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-8">
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Activity effort trends</Text>
          <Text className="text-sm text-muted-foreground">
            Open power curves, pace/speed curves, and other effort trends from your saved efforts.
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-4">
          {effortCurves.map((curve) => {
            const policy = getActivityInsightVisualPolicy("activityEfforts");
            const best = getCurveBest(curve.records);
            return (
              <CompactInsightCard
                key={curve.id}
                title={curve.title}
                value={best ? `Best ${formatValue(best)}` : "--"}
                icon={curve.id === "power" ? Zap : Timer}
                hasData={Boolean(best)}
                layout={policy.compactLayout}
                summary={
                  curve.records.length === 0
                    ? "No efforts yet"
                    : `${curve.records.length} efforts across ${curve.points.length} durations`
                }
                visualPolicy={{ source: policy.source, visualType: policy.visualType }}
                onPress={() => setSelectedCurveId(curve.id)}
                testID={`activity-effort-curve-${curve.id}`}
              >
                <MiniEffortVisual points={curve.points} />
              </CompactInsightCard>
            );
          })}
        </View>

        <DetailChartModal
          visible={!!selectedCurve}
          onClose={() => setSelectedCurveId(null)}
          title={selectedCurve ? selectedCurve.title : "Activity effort"}
          defaultDateRange="all"
        >
          {(dateRange) => {
            if (!selectedCurve) return null;
            const rangeRecords = filterRecordsByRange(selectedCurve.records, dateRange);
            return (
              <View className="gap-4">
                <EffortDetailChart curve={selectedCurve} records={rangeRecords} />
                <EffortRecords onOpenRecord={handleOpenRecord} records={rangeRecords} />
              </View>
            );
          }}
        </DetailChartModal>
      </ScrollView>
    </View>
  );
}

export default function ActivityEffortsListWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityEffortsList />
    </ErrorBoundary>
  );
}
