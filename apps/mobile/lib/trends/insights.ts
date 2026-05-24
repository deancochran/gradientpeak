import {
  Activity,
  BarChart3,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Scale,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import type React from "react";
import type { CompactInsightLayout } from "@/lib/insights/visualPolicy";
import {
  getActivityInsightVisualPolicy,
  getProfileMetricVisualPolicy,
  type InsightSource,
  type InsightVisualType,
} from "@/lib/insights/visualPolicy";

export type TrendDirection = "up" | "down" | "flat" | "empty";
export type Tone = "blue" | "green" | "orange" | "pink" | "purple" | "red" | "slate";

export type InsightPoint = {
  label: string;
  value: number;
  date?: Date;
};

export type InsightSeries = {
  label: string;
  tone: Tone;
  points: InsightPoint[];
};

export type Insight = {
  id: string;
  title: string;
  category: string;
  source: InsightSource;
  value: string;
  summary: string;
  detail: string;
  direction: TrendDirection;
  tone: Tone;
  icon: React.ComponentType<{ className?: string; color?: string; size?: number }>;
  visualType: InsightVisualType;
  compactLayout: CompactInsightLayout;
  points: InsightPoint[];
  series?: InsightSeries[];
  rows: { label: string; value: string }[];
};

type ProfileMetricType = "weight_kg" | "vo2_max" | "resting_hr" | "hrv_rmssd" | "sleep_hours";

type ProfileMetricDefinition = {
  type: ProfileMetricType;
  title: string;
  unit: string;
  icon: Insight["icon"];
  tone: Tone;
  lowerIsBetter: boolean;
};

export type ProfileMetricInsightInput = {
  id?: string;
  metric_type?: string | null;
  value?: number | string | null;
  recorded_at?: Date | string | null;
};

type VolumePoint = {
  date: string;
  totalTime: number;
};

type VolumeTrendInput =
  | {
      dataPoints?: VolumePoint[];
      totals?: {
        totalActivities: number;
        totalDistance: number;
        totalTime: number;
      } | null;
    }
  | null
  | undefined;

type LoadPoint = {
  date: string;
  atl: number;
  ctl: number;
  tsb: number;
};

type TrainingLoadInput =
  | {
      currentStatus?: {
        atl: number;
        ctl: number;
        form: string;
        tsb: number;
      } | null;
      dataPoints?: LoadPoint[];
    }
  | null
  | undefined;

type ConsistencyInput =
  | {
      activityDays?: string[];
      currentStreak: number;
      longestStreak: number;
      totalActivities: number;
      weeklyAvg: number;
    }
  | null
  | undefined;

type PerformancePoint = {
  activityName: string;
  avgPower?: number | null;
  avgSpeed?: number | null;
  date: string;
};

type PerformanceInput =
  | {
      dataPoints?: PerformancePoint[];
    }
  | null
  | undefined;

type ZoneKey = "recovery" | "endurance" | "tempo" | "threshold" | "vo2max" | "anaerobic";

type ZoneWeek = {
  zones: Partial<Record<ZoneKey, number>>;
};

type ZoneDistributionInput =
  | {
      weeklyData?: ZoneWeek[];
    }
  | null
  | undefined;

type PeakPowerPoint = {
  activityName: string;
  rank: number;
  unit: string;
  value: number;
};

type PeakPowerInput =
  | {
      performances?: PeakPowerPoint[];
    }
  | null
  | undefined;

export type ActivityInsightInputs = {
  volume: VolumeTrendInput;
  load: TrainingLoadInput;
  consistency: ConsistencyInput;
  performance: PerformanceInput;
  zones: ZoneDistributionInput;
  peakPower: PeakPowerInput;
};

const PROFILE_METRICS: ProfileMetricDefinition[] = [
  {
    type: "weight_kg",
    title: "Weight",
    unit: "kg",
    icon: Scale,
    tone: "blue",
    lowerIsBetter: false,
  },
  {
    type: "vo2_max",
    title: "VO2 Max",
    unit: "",
    icon: Gauge,
    tone: "purple",
    lowerIsBetter: false,
  },
  {
    type: "resting_hr",
    title: "Resting HR",
    unit: "bpm",
    icon: HeartPulse,
    tone: "red",
    lowerIsBetter: true,
  },
  {
    type: "hrv_rmssd",
    title: "HRV",
    unit: "ms",
    icon: Sparkles,
    tone: "green",
    lowerIsBetter: false,
  },
  {
    type: "sleep_hours",
    title: "Sleep",
    unit: "h",
    icon: Moon,
    tone: "slate",
    lowerIsBetter: false,
  },
];

const ZONE_KEYS: ZoneKey[] = ["recovery", "endurance", "tempo", "threshold", "vo2max", "anaerobic"];

export function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0] ?? "";
}

export function formatNumber(value: number, digits = 0) {
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

function trendSummary(direction: TrendDirection, lowerIsBetter: boolean) {
  if (direction === "empty") return "No data";
  if (direction === "flat") return "Holding steady";
  const favorable = lowerIsBetter ? direction === "down" : direction === "up";
  return favorable ? "Moving in a good direction" : "Watch this trend";
}

export function buildProfileInsights(metrics: ProfileMetricInsightInput[]): Insight[] {
  return PROFILE_METRICS.map((definition) => {
    const policy = getProfileMetricVisualPolicy(definition.type);
    const items = metrics
      .filter((metric) => metric.metric_type === definition.type)
      .map((metric) => ({
        id: metric.id,
        value: Number(metric.value),
        recordedAt: metric.recorded_at,
      }))
      .filter(
        (metric): metric is { id: string | undefined; value: number; recordedAt: Date | string } =>
          Number.isFinite(metric.value) && !!metric.recordedAt,
      )
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

export function buildActivityInsights({
  volume,
  load,
  consistency,
  performance,
  zones,
  peakPower,
}: ActivityInsightInputs): Insight[] {
  const volumePoints = volume?.dataPoints ?? [];
  const currentVolume = volumePoints.at(-1)?.totalTime ?? null;
  const previousVolume = volumePoints.at(-2)?.totalTime ?? null;
  const loadPoints = load?.dataPoints ?? [];
  const latestLoad = loadPoints.at(-1) ?? null;
  const previousLoad = loadPoints.at(-2) ?? null;
  const performancePoints = (performance?.dataPoints ?? []).filter(
    (point) => typeof point.avgPower === "number" || typeof point.avgSpeed === "number",
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
      points: loadPoints.slice(-60).map((point) => ({
        label: formatDate(point.date),
        value: point.ctl,
        date: new Date(point.date),
      })),
      series: [
        {
          label: "CTL",
          tone: "orange",
          points: loadPoints.slice(-60).map((point) => ({
            label: formatDate(point.date),
            value: point.ctl,
            date: new Date(point.date),
          })),
        },
        {
          label: "ATL",
          tone: "blue",
          points: loadPoints.slice(-60).map((point) => ({
            label: formatDate(point.date),
            value: point.atl,
            date: new Date(point.date),
          })),
        },
        {
          label: "TSB",
          tone: "green",
          points: loadPoints.slice(-60).map((point) => ({
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
      direction: consistency?.currentStreak ? "up" : "empty",
      tone: "green",
      icon: Activity,
      points: (consistency?.activityDays ?? []).slice(-60).map((date) => ({
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
      points: volumePoints.map((point) => ({
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
      points: performancePoints.slice(-12).map((point) => ({
        label: formatDate(point.date),
        value: point.avgPower ?? (point.avgSpeed ?? 0) * 3.6,
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
        .map((point) => ({
          label: `#${point.rank}`,
          value: point.value,
        })),
      rows: (peakPower?.performances ?? []).slice(0, 5).map((point) => ({
        label: `#${point.rank} ${point.activityName}`,
        value: `${formatNumber(point.value)} ${point.unit}`,
      })),
    },
  ];
}
