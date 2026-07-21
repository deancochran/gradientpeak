import {
  formatEffortDuration,
  paceSecondsFromSpeedMetersPerSecond,
} from "@repo/core/athlete-inputs";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { type Href, Stack } from "expo-router";
import { CheckCircle2, Timer, Zap } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, useColorScheme, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { CompactInsightCard, type DateRange, DetailChartModal } from "@/components/shared";
import {
  type ActivityEffortCurve,
  type ActivityEffortCurvePoint,
  type ActivityEffortCurveRow,
  buildActivityEffortCurves,
  buildBestActivityEffortCurve,
  formatActivityEffortPresentationValue,
  getActivityEffortCurveBest,
  getActivityEffortObservationStatus,
  getObservedActivityEffortRecords,
} from "@/lib/activity-efforts/curves";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { getActivityInsightVisualPolicy } from "@/lib/insights/visualPolicy";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type ActivityEffortRow = ActivityEffortCurveRow;
type EffortPoint = ActivityEffortCurvePoint;

type ChartPoint = { x: number; y: number };

export type EffortChartOrientation = "duration-horizontal" | "duration-vertical";

type EffortChartBounds = {
  minDuration: number;
  maxDuration: number;
  minValue: number;
  maxValue: number;
};

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

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatValue(effort: ActivityEffortRow) {
  return formatActivityEffortPresentationValue(effort);
}

function formatDuration(seconds: number) {
  return formatEffortDuration(seconds);
}

function buildPath(points: Array<{ x: number; y: number }>) {
  const first = points[0];
  if (!first) return "";

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    if (!previous) return path;
    const midpointX = (previous.x + point.x) / 2;
    return `${path} C ${midpointX} ${previous.y}, ${midpointX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${first.x} ${first.y}`);
}

function getPaceDistanceMeters(curveId: string) {
  if (curveId === "run_speed") return 1_000;
  if (curveId === "swim_speed") return 100;
  return null;
}

function getCurveDisplayPoints(points: EffortPoint[], curveId: string): EffortPoint[] {
  const distanceUnitMeters = getPaceDistanceMeters(curveId);
  if (!distanceUnitMeters) return points;

  return points.map((point) => ({
    ...point,
    value:
      paceSecondsFromSpeedMetersPerSecond({
        distanceUnitMeters,
        speedMetersPerSecond: point.value,
      }) ?? point.value,
  }));
}

function formatPaceAxisValue(seconds: number, distanceUnitMeters: number) {
  const roundedSeconds = Math.round(seconds);
  return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")}/${distanceUnitMeters === 100 ? "100m" : "km"}`;
}

function scaleDuration(duration: number, minDuration: number, maxDuration: number) {
  const safeDuration = Math.max(duration, 1);
  const safeMin = Math.max(minDuration, 1);
  const safeMax = Math.max(maxDuration, safeMin + 1);
  const minLog = Math.log(safeMin);
  const maxLog = Math.log(safeMax);

  return (Math.log(safeDuration) - minLog) / (maxLog - minLog || 1);
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
  const values = points
    .map((point) => point.value)
    .filter(Number.isFinite)
    .map((value) => Math.max(value, 0));
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

function clampScale(value: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}

export function getEffortChartCoordinates(
  points: EffortPoint[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  bounds: EffortChartBounds,
  orientation: EffortChartOrientation = "duration-horizontal",
  invertValue = false,
): ChartPoint[] {
  const chartWidth = Math.max(width - padding.left - padding.right, 0);
  const chartHeight = Math.max(height - padding.top - padding.bottom, 0);
  const valueRange = bounds.maxValue - bounds.minValue || 1;

  return points.map((point) => {
    const durationScale = clampScale(
      scaleDuration(point.duration, bounds.minDuration, bounds.maxDuration),
    );
    const valueScale = clampScale((point.value - bounds.minValue) / valueRange);

    return orientation === "duration-vertical"
      ? {
          x: padding.left + valueScale * chartWidth,
          y: padding.top + (1 - durationScale) * chartHeight,
        }
      : {
          x: padding.left + durationScale * chartWidth,
          y: padding.top + (invertValue ? valueScale : 1 - valueScale) * chartHeight,
        };
  });
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

function buildEarliestComparableCurve(records: ActivityEffortRow[]) {
  const observedRecords = getObservedActivityEffortRecords(records);
  if (observedRecords.length === 0) return [];

  const chronological = [...observedRecords].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const earliestDay = new Date(chronological[0]?.recorded_at);
  earliestDay.setHours(23, 59, 59, 999);

  return buildBestActivityEffortCurve(
    chronological.filter(
      (record) => new Date(record.recorded_at).getTime() <= earliestDay.getTime(),
    ),
  );
}

function getCurveEffortIds(records: ActivityEffortRow[]) {
  return new Set([
    ...buildEarliestComparableCurve(records).map((point) => point.effortId),
    ...buildBestActivityEffortCurve(records).map((point) => point.effortId),
  ]);
}

function getEffortRecordStatusLabel(record: ActivityEffortRow) {
  const status = getActivityEffortObservationStatus(record);
  if (status === "modeled") return "Modeled threshold";
  if (status === "review") return "Review effort";
  if (status === "invalid") return "Invalid effort";
  const sourceLabel =
    record.source === "manual"
      ? "Manual"
      : record.source === "provider"
        ? "Provider"
        : "Activity observed";
  return record.duration_seconds === 1200
    ? `${sourceLabel} • Load calibration eligible`
    : sourceLabel;
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
  const paceDistanceMeters = getPaceDistanceMeters(curve.id);
  const isHeartRateCurve = curve.unit === "bpm";
  const presentPoints = getCurveDisplayPoints(buildBestActivityEffortCurve(records), curve.id);
  const earliestPoints = getCurveDisplayPoints(buildEarliestComparableCurve(records), curve.id);
  const allPoints = [...presentPoints, ...earliestPoints];
  const padding = { top: 20, right: 18, bottom: 44, left: 54 };
  const bounds = getEffortChartBounds(allPoints);
  const presentCoordinates = getEffortChartCoordinates(
    presentPoints,
    width,
    height,
    padding,
    bounds,
    "duration-horizontal",
    paceDistanceMeters != null,
  );
  const earliestCoordinates = getEffortChartCoordinates(
    earliestPoints,
    width,
    height,
    padding,
    bounds,
    "duration-horizontal",
    paceDistanceMeters != null,
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
  const best = getActivityEffortCurveBest(records);
  const describePoints = (points: EffortPoint[]) =>
    points
      .map(
        (point) =>
          `${point.label}: ${paceDistanceMeters ? formatPaceAxisValue(point.value, paceDistanceMeters) : formatAxisValue(point.value, curve.unit)}`,
      )
      .join("; ");
  const chartAccessibilityLabel = `${curve.title}. X axis: duration. Y axis: ${paceDistanceMeters ? `pace per ${paceDistanceMeters === 100 ? "100 meters" : "kilometer"}` : isHeartRateCurve ? "heart rate in beats per minute" : `power in ${curve.unit}`}. First records: ${describePoints(earliestPoints)}. Best so far: ${describePoints(presentPoints)}.`;

  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
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
        <View accessible accessibilityLabel={chartAccessibilityLabel} accessibilityRole="image">
          <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
            {valueTicks.map((tick) => {
              const valueRange = bounds.maxValue - bounds.minValue || 1;
              const valueScale = (tick - bounds.minValue) / valueRange;
              const y =
                chartTop +
                (paceDistanceMeters ? valueScale : 1 - valueScale) * (chartBottom - chartTop);
              return (
                <React.Fragment key={`vertical-${tick}`}>
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
                    {paceDistanceMeters
                      ? formatPaceAxisValue(tick, paceDistanceMeters)
                      : formatAxisValue(tick, curve.unit)}
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
                <React.Fragment key={`horizontal-${tick}`}>
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
            <SvgText
              x={10}
              y={(chartTop + chartBottom) / 2}
              fill={colors.label}
              fontSize={11}
              textAnchor="middle"
              transform={`rotate(-90 10 ${(chartTop + chartBottom) / 2})`}
            >
              {paceDistanceMeters
                ? `Pace (/${paceDistanceMeters === 100 ? "100m" : "km"})`
                : isHeartRateCurve
                  ? "Heart rate (bpm)"
                  : `Power (${curve.unit})`}
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
            {presentPoints.map((effortPoint, index) => {
              const point = presentCoordinates[index];
              if (!point) return null;

              return (
                <Circle
                  key={effortPoint.effortId}
                  cx={point.x}
                  cy={point.y}
                  r={3.5}
                  fill={colors.current}
                />
              );
            })}
          </Svg>
        </View>
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
    </View>
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
    <View className="gap-3 border-t border-border pt-5">
      <Text className="text-base font-semibold text-foreground">Effort records</Text>
      {records.length === 0 ? (
        <Text className="text-sm text-muted-foreground">No records in this range.</Text>
      ) : null}
      {records.map((record) => {
        const statusLabel = getEffortRecordStatusLabel(record);
        return (
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
                {statusLabel ? (
                  <Text className="text-xs font-medium text-muted-foreground">{statusLabel}</Text>
                ) : null}
              </View>
              <Text className="text-xs text-muted-foreground">
                {formatDate(record.recorded_at)} • {record.duration_seconds}s
              </Text>
            </View>
            <Text className="text-xs font-medium text-primary">Open</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActivityEffortsList() {
  const navigateTo = useAppNavigate();
  const { data: effortsData, isLoading, error } = api.activityEfforts.getForProfile.useQuery();
  const efforts = (effortsData ?? []) as ActivityEffortRow[];
  const effortCurves = React.useMemo(() => buildActivityEffortCurves(efforts), [efforts]);
  const [selectedCurveId, setSelectedCurveId] = React.useState<string | null>(null);
  const selectedCurve = effortCurves.find((curve) => curve.id === selectedCurveId) ?? null;
  const handleOpenRecord = React.useCallback(
    (recordId: string) => {
      setSelectedCurveId(null);
      requestAnimationFrame(() => {
        navigateTo(ROUTES.ACTIVITIES.EFFORT_DETAIL(recordId) as Href);
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
      <Stack.Screen options={{}} />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-8">
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Activity effort trends</Text>
          <Text className="text-sm text-muted-foreground">
            Compare observed bike power, run speed, and swim speed across durations.
          </Text>
        </View>

        {efforts.length === 0 ? (
          <View
            className="items-center rounded-2xl bg-muted/20 px-6 py-10"
            testID="activity-efforts-empty-state"
          >
            <Text className="text-center text-base font-semibold text-foreground">
              No efforts yet
            </Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Add an effort to start tracking your power, pace, speed, and other trends.
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-4">
            {effortCurves.map((curve) => {
              const policy = getActivityInsightVisualPolicy("activityEfforts");
              const best = getActivityEffortCurveBest(curve.records);
              const observedRecords = getObservedActivityEffortRecords(curve.records);
              const latestObserved = observedRecords[0];
              return (
                <CompactInsightCard
                  key={curve.id}
                  title={curve.title}
                  value={best ? `Best ${formatValue(best)}` : "--"}
                  icon={curve.id === "bike_power" ? Zap : Timer}
                  hasData={Boolean(best)}
                  layout={policy.compactLayout}
                  summary={
                    observedRecords.length === 0
                      ? "No observed efforts yet"
                      : `${observedRecords.length} observed • ${curve.points.length} durations${latestObserved ? ` • ${formatDate(latestObserved.recorded_at)}` : ""}`
                  }
                  visualPolicy={{
                    source: policy.source,
                    visualType: policy.visualType,
                  }}
                  onPress={() => setSelectedCurveId(curve.id)}
                  testID={`activity-effort-curve-${curve.id}`}
                >
                  <MiniEffortVisual points={curve.points} />
                </CompactInsightCard>
              );
            })}
          </View>
        )}

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
