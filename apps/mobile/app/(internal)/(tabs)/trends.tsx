import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { AppHeader, CompactInsightCard } from "@/components/shared";
import { api } from "@/lib/api";
import {
  type CompactInsightLayout,
  getActivityInsightVisualPolicy,
  getProfileMetricVisualPolicy,
  type InsightSource,
  type InsightVisualType,
} from "@/lib/insights/visualPolicy";

type TrendDirection = "up" | "down" | "flat" | "empty";
type Tone = "blue" | "green" | "orange" | "pink" | "purple" | "red" | "slate";

type InsightPoint = {
  label: string;
  value: number;
  date?: Date;
};

type InsightSeries = {
  label: string;
  tone: Tone;
  points: InsightPoint[];
};

type Insight = {
  id: string;
  title: string;
  category: string;
  source: InsightSource;
  value: string;
  summary: string;
  detail: string;
  direction: TrendDirection;
  tone: Tone;
  icon: React.ComponentType<any>;
  visualType: InsightVisualType;
  compactLayout: CompactInsightLayout;
  points: InsightPoint[];
  series?: InsightSeries[];
  rows: { label: string; value: string }[];
};

const PROFILE_METRICS = [
  {
    type: "weight_kg",
    title: "Weight",
    unit: "kg",
    icon: Scale,
    tone: "blue" as const,
    lowerIsBetter: false,
  },
  {
    type: "vo2_max",
    title: "VO2 Max",
    unit: "",
    icon: Gauge,
    tone: "purple" as const,
    lowerIsBetter: false,
  },
  {
    type: "resting_hr",
    title: "Resting HR",
    unit: "bpm",
    icon: HeartPulse,
    tone: "red" as const,
    lowerIsBetter: true,
  },
  {
    type: "hrv_rmssd",
    title: "HRV",
    unit: "ms",
    icon: Sparkles,
    tone: "green" as const,
    lowerIsBetter: false,
  },
  {
    type: "sleep_hours",
    title: "Sleep",
    unit: "h",
    icon: Moon,
    tone: "slate" as const,
    lowerIsBetter: false,
  },
] as const;

const ZONE_KEYS = ["recovery", "endurance", "tempo", "threshold", "vo2max", "anaerobic"];

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0] ?? "";
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatDuration(seconds: number) {
  const hours = seconds / 3600;
  return `${formatNumber(hours, hours >= 10 ? 0 : 1)}h`;
}

function formatDistance(meters: number) {
  const kilometers = meters / 1000;
  return `${formatNumber(kilometers, kilometers >= 10 ? 0 : 1)} km`;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDirection(current: number | null, previous: number | null): TrendDirection {
  if (current === null || previous === null) return "empty";
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return "flat";
  return delta > 0 ? "up" : "down";
}

function getToneAccentClass(tone: Tone) {
  switch (tone) {
    case "blue":
      return "text-blue-500";
    case "green":
      return "text-green-500";
    case "orange":
      return "text-orange-500";
    case "pink":
      return "text-pink-500";
    case "purple":
      return "text-purple-500";
    case "red":
      return "text-red-500";
    case "slate":
      return "text-slate-500";
  }
}

function getToneBarClass(tone: Tone) {
  switch (tone) {
    case "blue":
      return "bg-blue-500/70";
    case "green":
      return "bg-green-500/70";
    case "orange":
      return "bg-orange-500/70";
    case "pink":
      return "bg-pink-500/70";
    case "purple":
      return "bg-purple-500/70";
    case "red":
      return "bg-red-500/70";
    case "slate":
      return "bg-slate-500/70";
  }
}

function trendSummary(direction: TrendDirection, lowerIsBetter: boolean) {
  if (direction === "empty") return "No data";
  if (direction === "flat") return "Holding steady";
  const favorable = lowerIsBetter ? direction === "down" : direction === "up";
  return favorable ? "Moving in a good direction" : "Watch this trend";
}

function buildProfileInsights(metrics: any[]): Insight[] {
  return PROFILE_METRICS.map((definition) => {
    const policy = getProfileMetricVisualPolicy(definition.type);
    const items = metrics
      .filter((metric) => metric.metric_type === definition.type)
      .map((metric) => ({
        id: metric.id as string,
        value: Number(metric.value),
        recordedAt: metric.recorded_at as Date | string,
      }))
      .filter((metric) => Number.isFinite(metric.value))
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const latest = items.at(-1) ?? null;
    const previous = items.at(-2) ?? null;
    const direction = getDirection(latest?.value ?? null, previous?.value ?? null);
    const delta = latest && previous ? latest.value - previous.value : null;

    return {
      id: `profile-${definition.type}`,
      title: definition.title,
      category: "Profile metric",
      source: policy.source,
      value: latest
        ? `${formatNumber(latest.value, definition.unit === "kg" ? 1 : 0)}${definition.unit ? ` ${definition.unit}` : ""}`
        : "--",
      summary:
        delta === null
          ? trendSummary(direction, definition.lowerIsBetter)
          : `${delta > 0 ? "+" : ""}${formatNumber(delta, definition.unit === "kg" ? 1 : 0)}${definition.unit ? ` ${definition.unit}` : ""} since last entry`,
      detail: trendSummary(direction, definition.lowerIsBetter),
      direction,
      tone: definition.tone,
      icon: definition.icon,
      visualType: policy.visualType,
      compactLayout: policy.compactLayout,
      points: items.slice(-60).map((item) => ({
        label: formatDate(item.recordedAt),
        value: item.value,
        date: new Date(item.recordedAt),
      })),
      rows: [
        { label: "Latest", value: latest ? formatDate(latest.recordedAt) : "No entries" },
        { label: "Entries", value: String(items.length) },
        {
          label: "Last change",
          value: delta === null ? "--" : `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}`,
        },
      ],
    } satisfies Insight;
  });
}

function buildActivityInsights({
  volume,
  load,
  consistency,
  performance,
  zones,
  peakPower,
}: {
  volume: any;
  load: any;
  consistency: any;
  performance: any;
  zones: any;
  peakPower: any;
}): Insight[] {
  const volumePoints = volume?.dataPoints ?? [];
  const currentVolume = volumePoints.at(-1)?.totalTime ?? null;
  const previousVolume = volumePoints.at(-2)?.totalTime ?? null;
  const loadPoints = load?.dataPoints ?? [];
  const latestLoad = loadPoints.at(-1) ?? null;
  const previousLoad = loadPoints.at(-2) ?? null;
  const performancePoints = (performance?.dataPoints ?? []).filter(
    (point: any) => typeof point.avgPower === "number" || typeof point.avgSpeed === "number",
  );
  const latestPerformance = performancePoints.at(-1) ?? null;
  const previousPerformance = performancePoints.at(-2) ?? null;
  const weeklyZones = zones?.weeklyData?.at(-1) ?? null;
  const hardZonePercent = weeklyZones
    ? (weeklyZones.zones.threshold ?? 0) +
      (weeklyZones.zones.vo2max ?? 0) +
      (weeklyZones.zones.anaerobic ?? 0)
    : 0;
  const topPower = peakPower?.performances?.[0] ?? null;

  return [
    {
      id: "training-load",
      title: "Training Load",
      category: "Training",
      ...getActivityInsightVisualPolicy("trainingLoad"),
      value: load?.currentStatus ? formatNumber(load.currentStatus.ctl, 1) : "--",
      summary: load?.currentStatus
        ? `${load.currentStatus.form} form`
        : "Record activities to build load",
      detail: "CTL, ATL, and TSB summarize accumulated training stress and recovery balance.",
      direction: getDirection(latestLoad?.ctl ?? null, previousLoad?.ctl ?? null),
      tone: "orange",
      icon: Flame,
      points: loadPoints.slice(-60).map((point: any) => ({
        label: formatDate(point.date),
        value: point.ctl,
        date: new Date(point.date),
      })),
      series: [
        {
          label: "CTL",
          tone: "orange",
          points: loadPoints.slice(-60).map((point: any) => ({
            label: formatDate(point.date),
            value: point.ctl,
            date: new Date(point.date),
          })),
        },
        {
          label: "ATL",
          tone: "blue",
          points: loadPoints.slice(-60).map((point: any) => ({
            label: formatDate(point.date),
            value: point.atl,
            date: new Date(point.date),
          })),
        },
        {
          label: "TSB",
          tone: "green",
          points: loadPoints.slice(-60).map((point: any) => ({
            label: formatDate(point.date),
            value: point.tsb,
            date: new Date(point.date),
          })),
        },
      ],
      rows: [
        {
          label: "CTL",
          value: load?.currentStatus ? formatNumber(load.currentStatus.ctl, 1) : "--",
        },
        {
          label: "ATL",
          value: load?.currentStatus ? formatNumber(load.currentStatus.atl, 1) : "--",
        },
        {
          label: "TSB",
          value: load?.currentStatus ? formatNumber(load.currentStatus.tsb, 1) : "--",
        },
      ],
    },
    {
      id: "consistency",
      title: "Consistency",
      category: "Activity rhythm",
      ...getActivityInsightVisualPolicy("consistency"),
      value: consistency ? `${consistency.currentStreak}d` : "--",
      summary: consistency
        ? `${formatNumber(consistency.weeklyAvg, 1)} activities per week`
        : "No activity rhythm yet",
      detail: "Consistency looks at recent activity days, streaks, and average weekly frequency.",
      direction: consistency?.currentStreak > 0 ? "up" : "empty",
      tone: "green",
      icon: Activity,
      points: (consistency?.activityDays ?? []).slice(-60).map((date: string) => ({
        label: formatDate(date),
        value: 1,
        date: new Date(date),
      })),
      rows: [
        {
          label: "Current streak",
          value: consistency ? `${consistency.currentStreak} days` : "--",
        },
        {
          label: "Longest streak",
          value: consistency ? `${consistency.longestStreak} days` : "--",
        },
        { label: "Activities", value: consistency ? String(consistency.totalActivities) : "--" },
      ],
    },
    {
      id: "volume",
      title: "Volume",
      category: "Work done",
      ...getActivityInsightVisualPolicy("volume"),
      value: volume?.totals ? formatDuration(volume.totals.totalTime) : "--",
      summary: volume?.totals
        ? `${formatDistance(volume.totals.totalDistance)} across ${volume.totals.totalActivities} activities`
        : "No volume in this range",
      detail: "Volume summarizes total moving time, distance, and completed sessions.",
      direction: getDirection(currentVolume, previousVolume),
      tone: "blue",
      icon: BarChart3,
      points: volumePoints.map((point: any) => ({
        label: formatDate(point.date),
        value: point.totalTime / 3600,
        date: new Date(point.date),
      })),
      rows: [
        { label: "Time", value: volume?.totals ? formatDuration(volume.totals.totalTime) : "--" },
        {
          label: "Distance",
          value: volume?.totals ? formatDistance(volume.totals.totalDistance) : "--",
        },
        {
          label: "Activities",
          value: volume?.totals ? String(volume.totals.totalActivities) : "--",
        },
      ],
    },
    {
      id: "performance",
      title: "Activity Efforts",
      category: "Recent outputs",
      ...getActivityInsightVisualPolicy("activityEfforts"),
      value: latestPerformance?.avgPower
        ? `${formatNumber(latestPerformance.avgPower)} W`
        : latestPerformance?.avgSpeed
          ? `${formatNumber(latestPerformance.avgSpeed * 3.6, 1)} km/h`
          : "--",
      summary: latestPerformance ? latestPerformance.activityName : "No power or speed samples yet",
      detail: "Recent effort trends compare average power or speed across completed activities.",
      direction: getDirection(
        latestPerformance?.avgPower ?? latestPerformance?.avgSpeed ?? null,
        previousPerformance?.avgPower ?? previousPerformance?.avgSpeed ?? null,
      ),
      tone: "purple",
      icon: Zap,
      points: performancePoints.slice(-12).map((point: any) => ({
        label: formatDate(point.date),
        value: point.avgPower ?? point.avgSpeed * 3.6,
        date: new Date(point.date),
      })),
      rows: [
        { label: "Latest", value: latestPerformance?.activityName ?? "--" },
        {
          label: "Avg power",
          value: latestPerformance?.avgPower
            ? `${formatNumber(latestPerformance.avgPower)} W`
            : "--",
        },
        {
          label: "Avg speed",
          value: latestPerformance?.avgSpeed
            ? `${formatNumber(latestPerformance.avgSpeed * 3.6, 1)} km/h`
            : "--",
        },
      ],
    },
    {
      id: "zones",
      title: "Intensity Mix",
      category: "Distribution",
      ...getActivityInsightVisualPolicy("intensityMix"),
      value: weeklyZones ? `${formatNumber(hardZonePercent)}%` : "--",
      summary: weeklyZones ? "High-intensity share this week" : "No zone data yet",
      detail: "Zone mix estimates how much weekly stress landed in easy, moderate, and hard work.",
      direction: hardZonePercent > 35 ? "up" : weeklyZones ? "flat" : "empty",
      tone: "pink",
      icon: HeartPulse,
      points: ZONE_KEYS.map((zone) => ({ label: zone, value: weeklyZones?.zones?.[zone] ?? 0 })),
      rows: ZONE_KEYS.map((zone) => ({
        label: zone.replace(/\b\w/g, (char) => char.toUpperCase()),
        value: weeklyZones ? `${formatNumber(weeklyZones.zones[zone] ?? 0, 1)}%` : "--",
      })),
    },
    {
      id: "peak-power",
      title: "Peak Power",
      category: "Best effort",
      ...getActivityInsightVisualPolicy("peakPower"),
      value: topPower ? `${formatNumber(topPower.value)} ${topPower.unit}` : "--",
      summary: topPower ? topPower.activityName : "No power peak recorded",
      detail: "Peak cards surface the strongest recorded efforts available from activity history.",
      direction: topPower ? "up" : "empty",
      tone: "orange",
      icon: TrendingUp,
      points: (peakPower?.performances ?? [])
        .slice(0, 8)
        .reverse()
        .map((point: any) => ({
          label: `#${point.rank}`,
          value: point.value,
        })),
      rows: (peakPower?.performances ?? []).slice(0, 5).map((point: any) => ({
        label: `#${point.rank} ${point.activityName}`,
        value: `${formatNumber(point.value)} ${point.unit}`,
      })),
    },
  ];
}

function getPointBounds(points: InsightPoint[]) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  return { max, min, range: Math.max(max - min, 1) };
}

function getChartCoordinates(points: InsightPoint[], width: number, height: number, padding = 8) {
  const { min, range } = getPointBounds(points);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  return points.map((point, index) => ({
    x: padding + (points.length <= 1 ? chartWidth : (index / (points.length - 1)) * chartWidth),
    y: padding + (1 - (point.value - min) / range) * chartHeight,
    point,
  }));
}

function buildPath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function EmptyMiniVisual({ expanded = false }: { expanded?: boolean }) {
  return <View className={`${expanded ? "h-24" : "h-16"} rounded-2xl bg-muted/40`} />;
}

function MiniLineVisual({
  points,
  tone,
  filled = false,
  expanded = false,
}: {
  points: InsightPoint[];
  tone: Tone;
  filled?: boolean;
  expanded?: boolean;
}) {
  const visiblePoints = points.slice(-24);
  if (visiblePoints.length === 0) return <EmptyMiniVisual expanded={expanded} />;

  const width = 150;
  const height = expanded ? 104 : 72;
  const accent = getToneStroke(tone);
  const coordinates = getChartCoordinates(visiblePoints, width, height, 10);
  const path = buildPath(coordinates);
  const areaPath = `${path} L ${coordinates.at(-1)?.x ?? width - 10} ${height - 10} L ${coordinates[0]?.x ?? 10} ${height - 10} Z`;

  return (
    <View className={`${expanded ? "h-24" : "h-16"} overflow-hidden rounded-2xl bg-muted/30`}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        {filled ? <Path d={areaPath} fill={accent} opacity={0.16} /> : null}
        <Path
          d={path}
          stroke={accent}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coordinates.at(-1) ? (
          <Circle cx={coordinates.at(-1)!.x} cy={coordinates.at(-1)!.y} r={4} fill={accent} />
        ) : null}
      </Svg>
    </View>
  );
}

export default function TrendsTabScreen() {
  return <TrendsInsightsSurface />;
}

function MiniBarVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-12);
  if (visiblePoints.length === 0) return <EmptyMiniVisual />;

  const { max } = getPointBounds(visiblePoints);
  return (
    <View className="h-16 flex-row items-end gap-1 rounded-2xl bg-muted/30 p-3">
      {visiblePoints.map((point, index) => (
        <View
          key={`${point.label}-${index}`}
          className={`flex-1 rounded-full ${getToneBarClass(tone)}`}
          style={{ height: 6 + Math.max(0, Math.min(1, point.value / max)) * 34 }}
        />
      ))}
    </View>
  );
}

function MiniScatterVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-16);
  if (visiblePoints.length === 0) return <EmptyMiniVisual />;

  const width = 150;
  const height = 72;
  const accent = getToneStroke(tone);
  const coordinates = getChartCoordinates(visiblePoints, width, height, 10);
  const average = visiblePoints.reduce((sum, point) => sum + point.value, 0) / visiblePoints.length;
  const { min, range } = getPointBounds(visiblePoints);
  const averageY = 10 + (1 - (average - min) / range) * (height - 20);

  return (
    <View className="h-16 overflow-hidden rounded-2xl bg-muted/30">
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={10}
          y1={averageY}
          x2={width - 10}
          y2={averageY}
          stroke="#94a3b8"
          strokeWidth={1.5}
          opacity={0.32}
        />
        {coordinates.map((coordinate, index) => (
          <Circle
            key={`${coordinate.point.label}-${index}`}
            cx={coordinate.x}
            cy={coordinate.y}
            r={3.5}
            fill={accent}
            opacity={0.9}
          />
        ))}
      </Svg>
    </View>
  );
}

function MiniStackedVisual({
  points,
  expanded = false,
}: {
  points: InsightPoint[];
  expanded?: boolean;
}) {
  const total = points.reduce((sum, point) => sum + Math.max(point.value, 0), 0);
  if (total <= 0) return <EmptyMiniVisual expanded={expanded} />;

  return (
    <View
      className={`${expanded ? "h-24 gap-3" : "h-16 gap-2"} justify-center rounded-2xl bg-muted/30 px-3`}
    >
      <View
        className={`${expanded ? "h-8" : "h-5"} flex-row overflow-hidden rounded-full bg-muted`}
      >
        {points.map((point, index) => (
          <View
            key={`${point.label}-${index}`}
            className={
              index < 2 ? "bg-green-500/80" : index < 4 ? "bg-orange-500/80" : "bg-pink-500/80"
            }
            style={{ width: `${Math.max((point.value / total) * 100, point.value > 0 ? 4 : 0)}%` }}
          />
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-[10px] font-medium text-green-500">Easy</Text>
        <Text className="text-[10px] font-medium text-orange-500">Tempo</Text>
        <Text className="text-[10px] font-medium text-pink-500">Hard</Text>
      </View>
    </View>
  );
}

function MiniDotVisual({
  points,
  expanded = false,
}: {
  points: InsightPoint[];
  expanded?: boolean;
}) {
  const visiblePoints = points.slice(expanded ? -42 : -28);
  if (visiblePoints.length === 0) return <EmptyMiniVisual expanded={expanded} />;
  const totalDots = expanded ? 42 : 28;

  return (
    <View
      className={`${expanded ? "h-24" : "h-16"} flex-row flex-wrap content-center gap-1.5 rounded-2xl bg-muted/30 p-3`}
    >
      {Array.from({ length: totalDots }).map((_, index) => {
        const active = index >= totalDots - visiblePoints.length;
        return (
          <View
            key={index}
            className={`h-2.5 w-2.5 rounded-full ${active ? "bg-green-500" : "bg-muted"}`}
          />
        );
      })}
    </View>
  );
}

function MiniLollipopVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-6);
  if (visiblePoints.length === 0) return <EmptyMiniVisual />;

  const { max } = getPointBounds(visiblePoints);
  return (
    <View className="h-16 justify-center gap-1 rounded-2xl bg-muted/30 px-3">
      {visiblePoints.slice(-4).map((point, index) => (
        <View key={`${point.label}-${index}`} className="flex-row items-center gap-2">
          <View className="h-1.5 flex-1 rounded-full bg-muted">
            <View
              className={`h-1.5 rounded-full ${getToneBarClass(tone)}`}
              style={{ width: `${Math.max((point.value / max) * 100, 6)}%` }}
            />
          </View>
          <View className={`h-2.5 w-2.5 rounded-full ${getToneBarClass(tone)}`} />
        </View>
      ))}
    </View>
  );
}

function TrendMiniVisual({ insight }: { insight: Insight }) {
  const expanded = insight.compactLayout === "visualFirst";
  if (insight.visualType === "stacked")
    return <MiniStackedVisual points={insight.points} expanded={expanded} />;
  if (insight.visualType === "calendarDots")
    return <MiniDotVisual points={insight.points} expanded={expanded} />;
  if (insight.visualType === "rankedLollipop")
    return <MiniLollipopVisual points={insight.points} tone={insight.tone} />;
  if (insight.visualType === "bar")
    return <MiniBarVisual points={insight.points} tone={insight.tone} />;
  if (insight.visualType === "scatter")
    return <MiniScatterVisual points={insight.points} tone={insight.tone} />;
  return (
    <MiniLineVisual
      points={insight.points}
      tone={insight.tone}
      filled={insight.visualType === "loadMultiLine"}
      expanded={expanded}
    />
  );
}

function TrendInsightCard({ insight, onPress }: { insight: Insight; onPress: () => void }) {
  const hasData = insight.value !== "--";

  return (
    <CompactInsightCard
      title={insight.title}
      value={insight.value}
      icon={insight.icon}
      hasData={hasData}
      layout={insight.compactLayout}
      summary={insight.summary}
      visualPolicy={{ source: insight.source, visualType: insight.visualType }}
      onPress={onPress}
      testID={`trend-card-${insight.id}`}
    >
      <TrendMiniVisual insight={hasData ? insight : { ...insight, points: [] }} />
    </CompactInsightCard>
  );
}

type TrendRangeMode = "30d" | "3m" | "6m" | "1y" | "custom";

const RANGE_OPTIONS: { label: string; value: TrendRangeMode; days: number }[] = [
  { label: "30D", value: "30d", days: 30 },
  { label: "3M", value: "3m", days: 90 },
  { label: "6M", value: "6m", days: 180 },
  { label: "1Y", value: "1y", days: 365 },
];

function getToneStroke(tone: Tone) {
  switch (tone) {
    case "blue":
      return "#60a5fa";
    case "green":
      return "#4ade80";
    case "orange":
      return "#fb923c";
    case "pink":
      return "#f472b6";
    case "purple":
      return "#a78bfa";
    case "red":
      return "#f87171";
    case "slate":
      return "#94a3b8";
  }
}

function formatLongDate(value?: Date) {
  if (!value) return "No date";
  return value.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function toInputDate(date: Date) {
  return date.toISOString().split("T")[0] ?? "";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function shiftDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildRange(mode: TrendRangeMode, endDate = new Date()) {
  const option = RANGE_OPTIONS.find((item) => item.value === mode) ?? RANGE_OPTIONS[0]!;
  const end = startOfDay(endDate);
  return { mode, start: shiftDate(end, -(option.days - 1)), end };
}

function filterPointsByRange(points: InsightPoint[], start: Date, end: Date) {
  const datedPoints = points.filter((point) => point.date);
  if (datedPoints.length === 0) return points;
  const startTime = startOfDay(start).getTime();
  const endTime = startOfDay(end).getTime();
  return datedPoints.filter((point) => {
    const time = startOfDay(point.date!).getTime();
    return time >= startTime && time <= endTime;
  });
}

function DetailLineVisual({
  points,
  tone,
  filled = false,
}: {
  points: InsightPoint[];
  tone: Tone;
  filled?: boolean;
}) {
  const width = 340;
  const height = 330;
  const paddingLeft = 18;
  const paddingRight = 18;
  const paddingTop = 54;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const accent = getToneStroke(tone);
  const coordinates = getChartCoordinates(points, width, height, 18).map((coordinate) => ({
    ...coordinate,
    x: paddingLeft + ((coordinate.x - 18) / (width - 36)) * chartWidth,
    y: paddingTop + ((coordinate.y - 18) / (height - 36)) * chartHeight,
  }));
  const path = buildPath(coordinates);
  const areaPath = `${path} L ${coordinates.at(-1)?.x ?? width - paddingRight} ${height - paddingBottom} L ${coordinates[0]?.x ?? paddingLeft} ${height - paddingBottom} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = paddingTop + ratio * chartHeight;
        return (
          <Line
            key={ratio}
            x1={paddingLeft}
            y1={y}
            x2={width - paddingRight}
            y2={y}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.18}
          />
        );
      })}
      {filled ? <Path d={areaPath} fill={accent} opacity={0.18} /> : null}
      <Path
        d={path}
        stroke={accent}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coordinates.map((coordinate, index) =>
        index % Math.ceil(Math.max(coordinates.length, 1) / 8) === 0 ||
        index === coordinates.length - 1 ? (
          <Circle
            key={`${coordinate.point.label}-${index}`}
            cx={coordinate.x}
            cy={coordinate.y}
            r={3.5}
            fill={accent}
          />
        ) : null,
      )}
    </Svg>
  );
}

function DetailBarVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-24);
  if (visiblePoints.length === 0) return <EmptyDetailVisual />;

  const { max } = getPointBounds(visiblePoints);
  return (
    <View className="h-[330px] justify-end px-2 pb-8 pt-16">
      <View className="h-52 flex-row items-end gap-1.5">
        {visiblePoints.map((point, index) => (
          <View
            key={`${point.label}-${index}`}
            className={`flex-1 rounded-t-full ${getToneBarClass(tone)}`}
            style={{ height: 10 + Math.max(0, Math.min(1, point.value / max)) * 190 }}
          />
        ))}
      </View>
      <View className="mt-3 flex-row justify-between">
        {(visiblePoints.length <= 3
          ? visiblePoints
          : [
              visiblePoints[0],
              visiblePoints[Math.floor(visiblePoints.length / 2)],
              visiblePoints.at(-1),
            ]
        )
          .filter(Boolean)
          .map((point, index) => (
            <Text key={`${point!.label}-${index}`} className="text-[10px] text-muted-foreground">
              {point!.label}
            </Text>
          ))}
      </View>
    </View>
  );
}

function DetailScatterVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-40);
  if (visiblePoints.length === 0) return <EmptyDetailVisual />;

  const width = 340;
  const height = 330;
  const paddingLeft = 18;
  const paddingRight = 18;
  const paddingTop = 58;
  const paddingBottom = 38;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const accent = getToneStroke(tone);
  const { min, range } = getPointBounds(visiblePoints);
  const average = visiblePoints.reduce((sum, point) => sum + point.value, 0) / visiblePoints.length;
  const averageY = paddingTop + (1 - (average - min) / range) * chartHeight;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = paddingTop + ratio * chartHeight;
        return (
          <Line
            key={ratio}
            x1={paddingLeft}
            y1={y}
            x2={width - paddingRight}
            y2={y}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.18}
          />
        );
      })}
      <Line
        x1={paddingLeft}
        y1={averageY}
        x2={width - paddingRight}
        y2={averageY}
        stroke={accent}
        strokeWidth={2}
        opacity={0.36}
        strokeDasharray="5 5"
      />
      {visiblePoints.map((point, index) => {
        const x =
          paddingLeft +
          (visiblePoints.length <= 1
            ? chartWidth
            : (index / (visiblePoints.length - 1)) * chartWidth);
        const y = paddingTop + (1 - (point.value - min) / range) * chartHeight;
        return (
          <Circle
            key={`${point.label}-${index}`}
            cx={x}
            cy={y}
            r={4.5}
            fill={accent}
            opacity={0.92}
          />
        );
      })}
    </Svg>
  );
}

function DetailLoadVisual({ insight }: { insight: Insight }) {
  const series = insight.series?.filter((item) => item.points.length > 0) ?? [];
  if (series.length === 0) return <EmptyDetailVisual />;

  const width = 340;
  const height = 330;
  const paddingLeft = 18;
  const paddingRight = 18;
  const paddingTop = 58;
  const paddingBottom = 38;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const allPoints = series.flatMap((item) => item.points);
  const { min, range } = getPointBounds(allPoints);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + ratio * chartHeight;
          return (
            <Line
              key={ratio}
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight}
              y2={y}
              stroke="#94a3b8"
              strokeWidth={1}
              opacity={0.18}
            />
          );
        })}
        {series.map((item) => {
          const coordinates = item.points.map((point, index) => ({
            x:
              paddingLeft +
              (item.points.length <= 1
                ? chartWidth
                : (index / (item.points.length - 1)) * chartWidth),
            y: paddingTop + (1 - (point.value - min) / range) * chartHeight,
          }));
          return (
            <Path
              key={item.label}
              d={buildPath(coordinates)}
              stroke={getToneStroke(item.tone)}
              strokeWidth={3.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </Svg>
      <View className="absolute bottom-3 left-4 flex-row gap-3">
        {series.map((item) => (
          <View key={item.label} className="flex-row items-center gap-1.5">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getToneStroke(item.tone) }}
            />
            <Text className="text-[10px] font-semibold text-muted-foreground">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailStackedVisual({ points }: { points: InsightPoint[] }) {
  const total = points.reduce((sum, point) => sum + Math.max(point.value, 0), 0);
  if (total <= 0) return <EmptyDetailVisual />;

  return (
    <View className="h-[330px] justify-end gap-6 px-2 pb-8 pt-16">
      <View className="h-16 flex-row overflow-hidden rounded-[28px] bg-muted">
        {points.map((point, index) => (
          <View
            key={`${point.label}-${index}`}
            className={
              index < 2 ? "bg-green-500/80" : index < 4 ? "bg-orange-500/80" : "bg-pink-500/80"
            }
            style={{ width: `${Math.max((point.value / total) * 100, point.value > 0 ? 4 : 0)}%` }}
          />
        ))}
      </View>
      <View className="gap-2">
        {points.map((point, index) => (
          <View key={`${point.label}-${index}`} className="flex-row items-center gap-2">
            <View
              className={
                index < 2
                  ? "h-2 w-2 rounded-full bg-green-500"
                  : index < 4
                    ? "h-2 w-2 rounded-full bg-orange-500"
                    : "h-2 w-2 rounded-full bg-pink-500"
              }
            />
            <Text className="flex-1 text-xs font-medium text-muted-foreground" numberOfLines={1}>
              {point.label}
            </Text>
            <Text className="text-xs font-semibold text-foreground">
              {formatNumber(point.value, 1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailDotVisual({ points }: { points: InsightPoint[] }) {
  if (points.length === 0) return <EmptyDetailVisual />;

  return (
    <View className="h-[330px] justify-center gap-5 px-2 pt-12">
      <View className="flex-row flex-wrap gap-2.5">
        {Array.from({ length: 60 }).map((_, index) => {
          const active = index >= 60 - points.length;
          return (
            <View
              key={index}
              className={`h-4 w-4 rounded-full ${active ? "bg-green-500" : "bg-muted"}`}
            />
          );
        })}
      </View>
      <Text className="text-center text-xs font-medium text-muted-foreground">
        Active days are highlighted across the selected range.
      </Text>
    </View>
  );
}

function DetailLollipopVisual({ points, tone }: { points: InsightPoint[]; tone: Tone }) {
  const visiblePoints = points.slice(-8);
  if (visiblePoints.length === 0) return <EmptyDetailVisual />;

  const { max } = getPointBounds(visiblePoints);
  return (
    <View className="h-[330px] justify-end gap-3 px-2 pb-8 pt-16">
      {visiblePoints.map((point, index) => (
        <View key={`${point.label}-${index}`} className="flex-row items-center gap-3">
          <Text className="w-8 text-xs font-semibold text-muted-foreground">{point.label}</Text>
          <View className="h-2 flex-1 rounded-full bg-muted">
            <View
              className={`h-2 rounded-full ${getToneBarClass(tone)}`}
              style={{ width: `${Math.max((point.value / max) * 100, 6)}%` }}
            />
          </View>
          <View className={`h-4 w-4 rounded-full ${getToneBarClass(tone)}`} />
          <Text className="w-12 text-right text-xs font-semibold text-foreground">
            {formatNumber(point.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EmptyDetailVisual() {
  return (
    <View className="h-[330px] items-center justify-center">
      <Text className="text-sm font-medium text-muted-foreground">No readings in this range</Text>
    </View>
  );
}

function TrendDetailVisual({ insight }: { insight: Insight }) {
  const hasData =
    insight.points.length > 0 || (insight.series?.some((item) => item.points.length > 0) ?? false);
  if (!hasData) return <EmptyDetailVisual />;

  return (
    <View className="overflow-hidden rounded-3xl bg-muted/20">
      <View className="absolute left-4 top-4 z-10 rounded-2xl bg-background/90 px-3 py-2">
        <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {insight.category}
        </Text>
        <Text className="text-2xl font-semibold text-foreground" numberOfLines={1}>
          {insight.value}
        </Text>
      </View>
      <View className="absolute right-4 top-4 z-10 max-w-40 rounded-2xl bg-background/90 px-3 py-2">
        <Text
          className={`text-right text-xs font-semibold ${getToneAccentClass(insight.tone)}`}
          numberOfLines={2}
        >
          {insight.summary}
        </Text>
      </View>
      {insight.visualType === "stacked" ? <DetailStackedVisual points={insight.points} /> : null}
      {insight.visualType === "calendarDots" ? <DetailDotVisual points={insight.points} /> : null}
      {insight.visualType === "rankedLollipop" ? (
        <DetailLollipopVisual points={insight.points} tone={insight.tone} />
      ) : null}
      {insight.visualType === "loadMultiLine" ? <DetailLoadVisual insight={insight} /> : null}
      {insight.visualType === "line" ? (
        <DetailLineVisual points={insight.points} tone={insight.tone} />
      ) : null}
      {insight.visualType === "bar" ? (
        <DetailBarVisual points={insight.points} tone={insight.tone} />
      ) : null}
      {insight.visualType === "scatter" ? (
        <DetailScatterVisual points={insight.points} tone={insight.tone} />
      ) : null}
    </View>
  );
}

function TrendRangeControls({
  range,
  onChangeRange,
  onOpenCustom,
}: {
  range: { mode: TrendRangeMode; start: Date; end: Date };
  onChangeRange: (mode: TrendRangeMode) => void;
  onOpenCustom: () => void;
}) {
  return (
    <View className="gap-2 px-4 pb-3">
      <View className="flex-row rounded-2xl bg-muted p-1">
        {RANGE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChangeRange(option.value)}
            className={`flex-1 rounded-xl py-2 ${range.mode === option.value ? "bg-background" : "bg-transparent"}`}
            testID={`trend-range-${option.value}`}
          >
            <Text
              className={`text-center text-sm font-semibold ${range.mode === option.value ? "text-foreground" : "text-muted-foreground"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onOpenCustom}
          className={`ml-1 flex-row items-center justify-center gap-1 rounded-xl px-3 py-2 ${range.mode === "custom" ? "bg-background" : "bg-transparent"}`}
          testID="trend-range-custom"
        >
          <Icon
            as={CalendarDays}
            size={15}
            className={range.mode === "custom" ? "text-foreground" : "text-muted-foreground"}
          />
          <Text
            className={`text-sm font-semibold ${range.mode === "custom" ? "text-foreground" : "text-muted-foreground"}`}
          >
            Custom
          </Text>
        </Pressable>
      </View>
      <Text className="text-center text-xs text-muted-foreground">
        {formatLongDate(range.start)} - {formatLongDate(range.end)}
      </Text>
    </View>
  );
}

function CustomRangeSheet({
  visible,
  start,
  end,
  onApply,
  onClose,
}: {
  visible: boolean;
  start: Date;
  end: Date;
  onApply: (start: Date, end: Date) => void;
  onClose: () => void;
}) {
  const [startValue, setStartValue] = React.useState(toInputDate(start));
  const [endValue, setEndValue] = React.useState(toInputDate(end));
  const snapPoints = React.useMemo(() => ["42%"], []);
  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  React.useEffect(() => {
    if (visible) {
      setStartValue(toInputDate(start));
      setEndValue(toInputDate(end));
    }
  }, [end, start, visible]);

  if (!visible) return null;

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
    >
      <BottomSheetView className="flex-1 gap-5 px-5 pb-8 pt-2">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">Custom date range</Text>
          <Text className="text-sm text-muted-foreground">
            Use YYYY-MM-DD for the start and end dates.
          </Text>
        </View>

        <View className="gap-3">
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Start date</Text>
            <TextInput
              value={startValue}
              onChangeText={setStartValue}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#737373"
              className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground"
              testID="trend-custom-start-date"
            />
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">End date</Text>
            <TextInput
              value={endValue}
              onChangeText={setEndValue}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#737373"
              className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground"
              testID="trend-custom-end-date"
            />
          </View>
        </View>

        <Pressable
          onPress={() => {
            const nextStart = new Date(`${startValue}T00:00:00`);
            const nextEnd = new Date(`${endValue}T00:00:00`);
            if (!Number.isNaN(nextStart.getTime()) && !Number.isNaN(nextEnd.getTime())) {
              onApply(
                nextStart <= nextEnd ? nextStart : nextEnd,
                nextStart <= nextEnd ? nextEnd : nextStart,
              );
            }
          }}
          className="rounded-2xl bg-primary px-4 py-4"
          testID="trend-custom-apply"
        >
          <Text className="text-center text-sm font-semibold text-primary-foreground">
            Apply range
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

function TrendInsightDetailModal({
  insight,
  visible,
  onClose,
}: {
  insight: Insight | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [range, setRange] = React.useState(() => buildRange("30d"));
  const [customSheetVisible, setCustomSheetVisible] = React.useState(false);

  React.useEffect(() => {
    if (visible) setRange(buildRange("30d"));
  }, [visible]);

  if (!insight) return null;

  const visiblePoints = filterPointsByRange(insight.points, range.start, range.end);
  const visibleSeries = insight.series?.map((item) => ({
    ...item,
    points: filterPointsByRange(item.points, range.start, range.end),
  }));
  const visibleInsight = { ...insight, points: visiblePoints, series: visibleSeries };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="border-b border-border bg-card">
          <View className="flex-row items-center justify-between px-4 pb-3 pt-4">
            <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
              {insight.title}
            </Text>
            <Pressable
              onPress={onClose}
              className="-mr-2 p-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="trend-detail-close"
            >
              <Icon as={X} size={24} className="text-foreground" />
            </Pressable>
          </View>
          <TrendRangeControls
            range={range}
            onChangeRange={(mode) => setRange(buildRange(mode))}
            onOpenCustom={() => setCustomSheetVisible(true)}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
        >
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="p-4">
              <TrendDetailVisual insight={visibleInsight} />
            </CardContent>
          </Card>
        </ScrollView>

        <CustomRangeSheet
          visible={customSheetVisible}
          start={range.start}
          end={range.end}
          onClose={() => setCustomSheetVisible(false)}
          onApply={(start, end) => {
            setRange({ mode: "custom", start, end });
            setCustomSheetVisible(false);
          }}
        />
      </View>
    </Modal>
  );
}

type TrendsInsightsSurfaceProps = {
  embedded?: boolean;
};

export function TrendsInsightsSurface({ embedded = false }: TrendsInsightsSurfaceProps) {
  const [selectedInsight, setSelectedInsight] = React.useState<Insight | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const range = React.useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 364);
    return {
      startDate: start,
      endDate: end,
      start_date: toIsoDate(start),
      end_date: toIsoDate(end),
    };
  }, []);

  const profileMetrics = api.profileMetrics.list.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
    limit: 50,
  });
  const volume = api.trends.getVolumeTrends.useQuery({
    start_date: range.start_date,
    end_date: range.end_date,
    groupBy: "week",
  });
  const load = api.trends.getTrainingLoadTrends.useQuery({
    start_date: range.start_date,
    end_date: range.end_date,
  });
  const consistency = api.trends.getConsistencyMetrics.useQuery({
    start_date: range.start_date,
    end_date: range.end_date,
  });
  const performance = api.trends.getPerformanceTrends.useQuery({
    start_date: range.start_date,
    end_date: range.end_date,
  });
  const zones = api.trends.getZoneDistributionTrends.useQuery({
    start_date: range.start_date,
    end_date: range.end_date,
    metric: "power",
  });
  const peakPower = api.trends.getPeakPerformances.useQuery({ metric: "power", limit: 5 });

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        profileMetrics.refetch(),
        volume.refetch(),
        load.refetch(),
        consistency.refetch(),
        performance.refetch(),
        zones.refetch(),
        peakPower.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [profileMetrics, volume, load, consistency, performance, zones, peakPower]);

  const isLoading =
    profileMetrics.isLoading ||
    volume.isLoading ||
    load.isLoading ||
    consistency.isLoading ||
    performance.isLoading ||
    zones.isLoading ||
    peakPower.isLoading;
  const hasError =
    profileMetrics.error ||
    volume.error ||
    load.error ||
    consistency.error ||
    performance.error ||
    zones.error ||
    peakPower.error;

  const insights = React.useMemo(() => {
    const metricInsights = buildProfileInsights(profileMetrics.data?.items ?? []);
    const activityInsights = buildActivityInsights({
      volume: volume.data,
      load: load.data,
      consistency: consistency.data,
      performance: performance.data,
      zones: zones.data,
      peakPower: peakPower.data,
    });
    return [...metricInsights, ...activityInsights];
  }, [
    profileMetrics.data?.items,
    volume.data,
    load.data,
    consistency.data,
    performance.data,
    zones.data,
    peakPower.data,
  ]);

  return (
    <View
      className={embedded ? "gap-4" : "flex-1 bg-background"}
      testID={embedded ? "profile-trends-section" : "trends-tab-screen"}
    >
      {embedded ? (
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">Analytics & Trends</Text>
          <Text className="text-sm text-muted-foreground">
            Visual summaries from profile metrics, training load, consistency, volume, and recent
            performance.
          </Text>
        </View>
      ) : (
        <AppHeader title="Trends" />
      )}
      {isLoading ? (
        <View
          className={
            embedded
              ? "items-center justify-center rounded-3xl border border-border bg-card p-6"
              : "flex-1 items-center justify-center"
          }
        >
          <ActivityIndicator />
          <Text className="mt-3 text-sm text-muted-foreground">Building your insight cards...</Text>
        </View>
      ) : hasError ? (
        embedded ? (
          <View className="items-center justify-center rounded-3xl border border-border bg-card p-6">
            <Text className="text-center text-lg font-semibold text-foreground">
              Unable to load trends
            </Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Some insight data could not be loaded. Try again later.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerClassName="flex-grow items-center justify-center px-6"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            <Text className="text-center text-lg font-semibold text-foreground">
              Unable to load trends
            </Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Some insight data could not be loaded. Pull to refresh or try again later.
            </Text>
          </ScrollView>
        )
      ) : embedded ? (
        <View className="flex-row flex-wrap gap-4">
          {insights.map((insight) => (
            <TrendInsightCard
              key={insight.id}
              insight={insight}
              onPress={() => setSelectedInsight(insight)}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 p-5 pb-10"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row flex-wrap gap-4">
            {insights.map((insight) => (
              <TrendInsightCard
                key={insight.id}
                insight={insight}
                onPress={() => setSelectedInsight(insight)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <TrendInsightDetailModal
        insight={selectedInsight}
        visible={!!selectedInsight}
        onClose={() => setSelectedInsight(null)}
      />
    </View>
  );
}
