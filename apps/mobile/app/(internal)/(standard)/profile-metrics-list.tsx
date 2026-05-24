import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { HeartPulse, Scale, TrendingUp } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, useColorScheme, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { CompactInsightCard, type DateRange, DetailChartModal } from "@/components/shared";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { getProfileMetricVisualPolicy } from "@/lib/insights/visualPolicy";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

type ProfileMetricRow = {
  id: string;
  metric_type: string;
  recorded_at: string | Date;
  unit: string;
  value: number;
};

type MetricPoint = {
  label: string;
  value: number;
};

type ProfileMetricGroup = {
  id: string;
  latest?: ProfileMetricRow;
  previous?: ProfileMetricRow;
  records: ProfileMetricRow[];
  points: MetricPoint[];
};

type ChartFrame = {
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
};

const DETAIL_CHART_FRAME: ChartFrame = {
  width: 340,
  height: 260,
  paddingLeft: 48,
  paddingRight: 18,
  paddingTop: 22,
  paddingBottom: 42,
};

const PROFILE_METRIC_OPTIONS = [
  "weight_kg",
  "resting_hr",
  "sleep_hours",
  "hrv_rmssd",
  "vo2_max",
  "body_fat_percentage",
  "hydration_level",
  "stress_score",
  "soreness_level",
  "wellness_score",
  "max_hr",
  "lthr",
] as const;

type PolicyMetricType = "weight_kg" | "vo2_max" | "resting_hr" | "hrv_rmssd" | "sleep_hours";

function getProfileMetricChartColors(isDark: boolean) {
  return {
    axis: isDark ? "#64748b" : "#64748b",
    grid: isDark ? "#334155" : "#94a3b8",
    label: isDark ? "#94a3b8" : "#64748b",
    line: isDark ? "#93c5fd" : "#60a5fa",
  };
}

function isPolicyMetricType(metricType: string): metricType is PolicyMetricType {
  return ["weight_kg", "vo2_max", "resting_hr", "hrv_rmssd", "sleep_hours"].includes(metricType);
}

function getMetricVisualPolicy(metricType: string) {
  if (isPolicyMetricType(metricType)) return getProfileMetricVisualPolicy(metricType);
  return {
    source: "profileMetric" as const,
    visualType: "line" as const,
    compactLayout: "metricFooter" as const,
  };
}

function getMetricLabel(metricType: string) {
  return metricType
    .replace(/_/g, " ")
    .replace(/kg/g, "kg")
    .replace(/hrv rmssd/i, "HRV RMSSD")
    .replace(/vo2 max/i, "VO2 Max")
    .replace(/lthr/i, "LTHR")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMetricIcon(metricType: string) {
  if (metricType.includes("weight")) return Scale;
  if (metricType.includes("hr") || metricType.includes("hrv") || metricType.includes("lthr")) {
    return HeartPulse;
  }
  return TrendingUp;
}

function formatMetricValue(metric?: ProfileMetricRow) {
  if (!metric) return "--";
  return `${Number(metric.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${metric.unit}`;
}

function formatAxisValue(value: number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function getCoordinates(points: MetricPoint[], width: number, height: number, padding: number) {
  const { min, range } = getValueBounds(points);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  return points.map((point, index) => ({
    x: padding + (points.length === 1 ? 0.5 : index / (points.length - 1)) * chartWidth,
    y: padding + (1 - (point.value - min) / range) * chartHeight,
  }));
}

function getValueBounds(points: MetricPoint[]) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  if (values.length === 0) return { min: 0, max: 1, range: 1 };

  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const valueRange = valueMax - valueMin;
  const padding = valueRange === 0 ? Math.max(Math.abs(valueMax) * 0.05, 1) : valueRange * 0.05;
  const min = valueMin - padding;
  const max = valueMax + padding;
  return { min, max, range: max - min || 1 };
}

function getDetailCoordinates(points: MetricPoint[], frame: ChartFrame) {
  const { min, range } = getValueBounds(points);
  const chartWidth = frame.width - frame.paddingLeft - frame.paddingRight;
  const chartHeight = frame.height - frame.paddingTop - frame.paddingBottom;

  return points.map((point, index) => ({
    x: frame.paddingLeft + (points.length === 1 ? 0.5 : index / (points.length - 1)) * chartWidth,
    y: frame.paddingTop + (1 - (point.value - min) / range) * chartHeight,
  }));
}

function filterRecordsByRange(records: ProfileMetricRow[], dateRange: DateRange) {
  if (dateRange === "all") return records;

  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return records.filter((record) => new Date(record.recorded_at) >= cutoff);
}

function buildPoints(records: ProfileMetricRow[]) {
  return [...records]
    .reverse()
    .map((record) => ({ label: formatDate(record.recorded_at), value: Number(record.value) }));
}

function MiniTrendVisual({ points }: { points: MetricPoint[] }) {
  const colors = getProfileMetricChartColors(useColorScheme() === "dark");

  if (points.length === 0) {
    return <View className="h-12 rounded-2xl bg-muted/30" />;
  }

  const width = 120;
  const height = 52;
  const coordinates = getCoordinates(points.slice(-12), width, height, 8);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={buildPath(coordinates)}
        stroke={colors.line}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coordinates.at(-1) ? (
        <Circle cx={coordinates.at(-1)?.x} cy={coordinates.at(-1)?.y} r={4} fill={colors.line} />
      ) : null}
    </Svg>
  );
}

function DetailTrendChart({
  group,
  records,
}: {
  group: ProfileMetricGroup;
  records: ProfileMetricRow[];
}) {
  const frame = DETAIL_CHART_FRAME;
  const colors = getProfileMetricChartColors(useColorScheme() === "dark");
  const points = buildPoints(records);
  const coordinates = getDetailCoordinates(points, frame);
  const bounds = getValueBounds(points);
  const latestRecord = records[0];
  const chartRight = frame.width - frame.paddingRight;
  const chartBottom = frame.height - frame.paddingBottom;
  const chartHeight = frame.height - frame.paddingTop - frame.paddingBottom;
  const yTicks = [bounds.max, bounds.min + bounds.range / 2, bounds.min];

  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-4 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="gap-1">
            <Text className="text-lg font-semibold text-foreground">
              {getMetricLabel(group.id)}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {records.length} {records.length === 1 ? "record" : "records"} in this range
            </Text>
          </View>
          <Text className="text-lg font-semibold text-foreground">
            {formatMetricValue(latestRecord)}
          </Text>
        </View>
        {points.length < 2 ? (
          <View className="h-[260px] items-center justify-center rounded-2xl bg-muted/20 px-6">
            <Text className="text-center text-sm font-medium text-foreground">
              Not enough data to draw this trend yet.
            </Text>
            <Text className="mt-2 text-center text-xs text-muted-foreground">
              Add at least two records to compute the chart. Available records are listed below.
            </Text>
          </View>
        ) : (
          <Svg width="100%" height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`}>
            {yTicks.map((tick, index) => {
              const y = frame.paddingTop + index * (chartHeight / 2);
              return (
                <React.Fragment key={`${group.id}-tick-${index}`}>
                  <Line
                    x1={frame.paddingLeft}
                    y1={y}
                    x2={chartRight}
                    y2={y}
                    stroke={colors.grid}
                    strokeWidth={1}
                    opacity={0.18}
                  />
                  <SvgText
                    x={frame.paddingLeft - 8}
                    y={y + 4}
                    fill={colors.label}
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="end"
                  >
                    {formatAxisValue(tick)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            <Line
              x1={frame.paddingLeft}
              y1={frame.paddingTop}
              x2={frame.paddingLeft}
              y2={chartBottom}
              stroke={colors.axis}
              strokeWidth={1.2}
              opacity={0.5}
            />
            <Line
              x1={frame.paddingLeft}
              y1={chartBottom}
              x2={chartRight}
              y2={chartBottom}
              stroke={colors.axis}
              strokeWidth={1.2}
              opacity={0.5}
            />
            <Path
              d={buildPath(coordinates)}
              stroke={colors.line}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {coordinates.map((point, index) => (
              <Circle
                key={`${group.id}-${index}`}
                cx={point.x}
                cy={point.y}
                r={3.5}
                fill={colors.line}
              />
            ))}
            <SvgText
              x={frame.paddingLeft}
              y={frame.height - 14}
              fill={colors.label}
              fontSize="10"
              fontWeight="600"
            >
              {points[0]?.label}
            </SvgText>
            <SvgText
              x={chartRight}
              y={frame.height - 14}
              fill={colors.label}
              fontSize="10"
              fontWeight="600"
              textAnchor="end"
            >
              {points.at(-1)?.label}
            </SvgText>
            <SvgText
              x={frame.paddingLeft}
              y={12}
              fill={colors.label}
              fontSize="10"
              fontWeight="700"
            >
              {latestRecord?.unit ?? group.latest?.unit ?? "Value"}
            </SvgText>
          </Svg>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileMetricRecords({
  records,
  onOpenRecord,
}: {
  records: ProfileMetricRow[];
  onOpenRecord: (recordId: string) => void;
}) {
  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-3 p-4">
        <Text className="text-base font-semibold text-foreground">Metric records</Text>
        {records.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No records in this range.</Text>
        ) : null}
        {records.map((record) => (
          <Pressable
            key={record.id}
            onPress={() => onOpenRecord(record.id)}
            className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-muted/10 px-4 py-3"
            testID={`profile-metric-record-${record.id}`}
          >
            <View className="flex-1 gap-1">
              <Text className="text-sm font-semibold text-foreground">
                {formatMetricValue(record)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {formatDate(record.recorded_at)}
              </Text>
            </View>
            <Text className="text-xs font-medium text-primary">Open</Text>
          </Pressable>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ProfileMetricsListScreen() {
  const navigateTo = useAppNavigate();
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    api.profileMetrics.list.useInfiniteQuery(
      { limit: 50 },
      { getNextPageParam: (lastPage: any) => lastPage.nextCursor },
    );
  const metrics = (data?.pages.flatMap((page) => page.items) ?? []) as ProfileMetricRow[];
  const metricGroups = React.useMemo(() => {
    const recordsByType = new Map<string, ProfileMetricRow[]>();
    for (const metric of metrics) {
      recordsByType.set(metric.metric_type, [
        ...(recordsByType.get(metric.metric_type) ?? []),
        metric,
      ]);
    }

    const groups = PROFILE_METRIC_OPTIONS.map((metricType) => {
      const records = recordsByType.get(metricType) ?? [];
      const sorted = [...records].sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
      );
      const chronological = [...sorted].reverse();
      return {
        id: metricType,
        latest: sorted[0],
        previous: sorted[1],
        records: sorted,
        points: chronological.map((record) => ({
          label: formatDate(record.recorded_at),
          value: Number(record.value),
        })),
      } satisfies ProfileMetricGroup;
    });

    return groups.sort((a, b) => Number(Boolean(b.latest)) - Number(Boolean(a.latest)));
  }, [metrics]);
  const [selectedMetricType, setSelectedMetricType] = React.useState<string | null>(null);
  const selectedGroup = metricGroups.find((group) => group.id === selectedMetricType) ?? null;
  const openRecord = React.useCallback(
    (recordId: string) => {
      setSelectedMetricType(null);
      requestAnimationFrame(() => {
        navigateTo(ROUTES.PROFILE_METRICS.DETAIL(recordId) as any);
      });
    },
    [navigateTo],
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-base font-semibold text-foreground">
          Unable to load profile metrics
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">{error.message}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-8"
      onScrollEndDrag={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
    >
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">Profile metric trends</Text>
        <Text className="text-sm text-muted-foreground">
          Tap a metric type to open its chart and the records behind that trend.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-4">
        {metricGroups.map((group) => {
          const MetricIcon = getMetricIcon(group.id);
          const policy = getMetricVisualPolicy(group.id);
          const delta =
            group.latest && group.previous ? group.latest.value - group.previous.value : null;
          return (
            <CompactInsightCard
              key={group.id}
              title={getMetricLabel(group.id)}
              value={formatMetricValue(group.latest)}
              icon={MetricIcon}
              hasData={Boolean(group.latest)}
              layout={policy.compactLayout}
              summary={
                delta === null
                  ? group.records.length === 0
                    ? "No records yet"
                    : `${group.records.length} records`
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} since last`
              }
              visualPolicy={{ source: policy.source, visualType: policy.visualType }}
              onPress={() => setSelectedMetricType(group.id)}
              testID={`profile-metric-type-${group.id}`}
            >
              <MiniTrendVisual points={group.points} />
            </CompactInsightCard>
          );
        })}
      </View>

      <DetailChartModal
        visible={!!selectedGroup}
        onClose={() => setSelectedMetricType(null)}
        title={selectedGroup ? getMetricLabel(selectedGroup.id) : "Profile metric"}
        defaultDateRange="all"
      >
        {(dateRange) => {
          if (!selectedGroup) return null;
          const rangeRecords = filterRecordsByRange(selectedGroup.records, dateRange);
          return (
            <View className="gap-4">
              <DetailTrendChart group={selectedGroup} records={rangeRecords} />
              <ProfileMetricRecords records={rangeRecords} onOpenRecord={openRecord} />
            </View>
          );
        }}
      </DetailChartModal>
    </ScrollView>
  );
}
