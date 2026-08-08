import type { commonLoadHistoryResultSchema } from "@repo/core/load";
import { z } from "zod";
import type { athleteActivityAnalyticsSchema } from "./activity-analytics";

const directionSchema = z.enum(["up", "down", "flat", "empty"]);
const toneSchema = z.enum(["blue", "green", "orange", "pink", "purple", "red", "slate"]);
const visualTypeSchema = z.enum([
  "line",
  "bar",
  "scatter",
  "stacked",
  "calendarDots",
  "rankedLollipop",
  "loadMultiLine",
]);
const layoutSchema = z.enum(["metricFooter", "visualFirst", "summaryFooter"]);
const pointSchema = z
  .object({ label: z.string(), value: z.number().finite(), date: z.string().datetime().optional() })
  .strict();

export const trendInsightSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: z.string().min(1),
    source: z.enum(["profileMetric", "activityAnalysis"]),
    value: z.string(),
    summary: z.string(),
    detail: z.string(),
    direction: directionSchema,
    tone: toneSchema,
    icon: z.enum([
      "activity",
      "barChart",
      "flame",
      "gauge",
      "heartPulse",
      "moon",
      "scale",
      "sparkles",
      "trendingUp",
      "zap",
    ]),
    visualType: visualTypeSchema,
    compactLayout: layoutSchema,
    points: z.array(pointSchema).max(366),
    series: z
      .array(
        z
          .object({ label: z.string(), tone: toneSchema, points: z.array(pointSchema).max(366) })
          .strict(),
      )
      .max(8)
      .optional(),
    rows: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(20),
  })
  .strict();

export const trendInsightsSectionSchema = z
  .object({
    status: z.enum(["available", "partial"]),
    items: z.array(trendInsightSchema).max(20),
  })
  .strict();

type Analytics = z.infer<typeof athleteActivityAnalyticsSchema>;
type LoadHistory = z.infer<typeof commonLoadHistoryResultSchema> | null;
type Observation = {
  metric_type: string;
  recorded_at: Date | string;
  value: number;
};
type Direction = z.infer<typeof directionSchema>;

function number(value: number, digits = 0) {
  return value.toFixed(digits).replace(/\.0+$/, "");
}

function dateLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toISOString().slice(0, 10);
}

function direction(current: number | null, previous: number | null): Direction {
  if (current === null || previous === null) return "empty";
  const delta = current - previous;
  return Math.abs(delta) < 0.01 ? "flat" : delta > 0 ? "up" : "down";
}

function profileInsights(observations: Observation[]) {
  const definitions = [
    ["weight_kg", "Weight", "kg", "scale", "blue", false, "line"],
    ["vo2_max", "VO2 Max", "", "gauge", "purple", false, "line"],
    ["resting_hr", "Resting HR", "bpm", "heartPulse", "red", true, "line"],
    ["hrv_rmssd", "HRV", "ms", "sparkles", "green", false, "line"],
    ["sleep_hours", "Sleep", "h", "moon", "slate", false, "bar"],
  ] as const;

  return definitions.map(([metricType, title, unit, icon, tone, lowerIsBetter, visualType]) => {
    const values = observations
      .filter((item) => item.metric_type === metricType)
      .map((item) => ({ value: Number(item.value), date: item.recorded_at }))
      .filter((item) => Number.isFinite(item.value))
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    const latest = values.at(-1) ?? null;
    const previous = values.at(-2) ?? null;
    const trend = direction(latest?.value ?? null, previous?.value ?? null);
    const delta = latest && previous ? latest.value - previous.value : null;
    const favorable =
      trend === "flat" ? "Holding steady" : lowerIsBetter ? trend === "down" : trend === "up";
    const detail =
      trend === "empty"
        ? "No data"
        : typeof favorable === "string"
          ? favorable
          : favorable
            ? "Moving in a good direction"
            : "Watch this trend";
    return trendInsightSchema.parse({
      id: `profile-${metricType}`,
      title,
      category: "Profile metric",
      source: "profileMetric",
      value: latest
        ? `${number(latest.value, unit === "kg" ? 1 : 0)}${unit ? ` ${unit}` : ""}`
        : "--",
      summary:
        delta === null
          ? detail
          : `${delta > 0 ? "+" : ""}${number(delta, unit === "kg" ? 1 : 0)}${unit ? ` ${unit}` : ""} since last entry`,
      detail,
      direction: trend,
      tone,
      icon,
      visualType,
      compactLayout: "metricFooter",
      points: values.slice(-60).map((item) => ({
        label: dateLabel(item.date),
        value: item.value,
        date: new Date(item.date).toISOString(),
      })),
      rows: [
        { label: "Latest", value: latest ? dateLabel(latest.date) : "No entries" },
        { label: "Entries", value: String(values.length) },
        {
          label: "Last change",
          value: delta === null ? "--" : `${delta > 0 ? "+" : ""}${number(delta, 1)}`,
        },
      ],
    });
  });
}

function activityInsights(analytics: Analytics, load: LoadHistory) {
  const dashboard = analytics.status === "available" ? analytics.dashboard : null;
  const peaks = analytics.status === "available" ? analytics.peakPerformances : [];
  const loadPoints = load?.status === "available" ? load.points : [];
  const latestLoad = loadPoints.at(-1) ?? null;
  const previousLoad = loadPoints.at(-2) ?? null;
  const volumePoints = dashboard?.volume.dataPoints ?? [];
  const latestVolume = volumePoints.at(-1)?.totalTime ?? null;
  const previousVolume = volumePoints.at(-2)?.totalTime ?? null;
  const performancePoints = (dashboard?.performance.dataPoints ?? []).filter(
    (item) => item.avgPower !== null || item.avgSpeed !== null,
  );
  const latestPerformance = performancePoints.at(-1) ?? null;
  const previousPerformance = performancePoints.at(-2) ?? null;
  const latestZones = dashboard?.zones.weeklyData.at(-1) ?? null;
  const zoneKeys = ["recovery", "endurance", "tempo", "threshold", "vo2max", "anaerobic"] as const;
  const hardZonePercent = latestZones
    ? (latestZones.zones.threshold ?? 0) +
      (latestZones.zones.vo2max ?? 0) +
      (latestZones.zones.anaerobic ?? 0)
    : 0;
  const topPower = peaks[0] ?? null;
  const loadUnavailable = load?.status === "unavailable" ? load.reason : null;
  const maturity = load?.status === "available" ? load.maturity.status : null;
  const coverage = load?.status === "available" ? load.coverageStatus : null;

  const items = [
    {
      id: "training-load",
      title: "Training Load",
      category: "Training",
      source: "activityAnalysis",
      value: latestLoad ? number(latestLoad.dailyLoad, 1) : "--",
      summary: latestLoad
        ? `${maturity ?? "Common"} daily Load through ${dateLabel(latestLoad.date)} · ${coverage ?? "unknown"} coverage`
        : "Common load history is unavailable",
      detail: latestLoad
        ? "Common load history uses completed activities and ends on the previous planning day."
        : loadUnavailable === "insufficient_history"
          ? "There is not yet enough complete history to calculate common load. No zero value is assumed."
          : "Common load is shown only when complete history is available. No zero value is assumed.",
      direction: direction(latestLoad?.dailyLoad ?? null, previousLoad?.dailyLoad ?? null),
      tone: "orange",
      icon: "flame",
      visualType: "loadMultiLine",
      compactLayout: "visualFirst",
      points: loadPoints.map((point) => ({
        label: dateLabel(point.date),
        value: point.dailyLoad,
        date: `${point.date}T00:00:00.000Z`,
      })),
      series: [
        ["Daily Load", "orange", "dailyLoad"],
        ["Long-term Load", "blue", "longTermLoad"],
        ["Recent Load", "green", "recentLoad"],
        ["Load Balance", "purple", "loadBalance"],
      ].map(([label, tone, key]) => ({
        label,
        tone,
        points: loadPoints.map((point) => ({
          label: dateLabel(point.date),
          value: point[key as "dailyLoad"],
          date: `${point.date}T00:00:00.000Z`,
        })),
      })),
      rows: [
        { label: "Daily Load", value: latestLoad ? number(latestLoad.dailyLoad, 1) : "--" },
        { label: "Long-term Load", value: latestLoad ? number(latestLoad.longTermLoad, 1) : "--" },
        { label: "Recent Load", value: latestLoad ? number(latestLoad.recentLoad, 1) : "--" },
        { label: "Load Balance", value: latestLoad ? number(latestLoad.loadBalance, 1) : "--" },
      ],
    },
    {
      id: "consistency",
      title: "Consistency",
      category: "Activity rhythm",
      source: "activityAnalysis",
      value: dashboard ? `${dashboard.consistency.currentStreak}d` : "--",
      summary: dashboard
        ? `${number(dashboard.consistency.weeklyAvg, 1)} activities per week`
        : "No activity rhythm yet",
      detail: "Consistency looks at recent activity days, streaks, and average weekly frequency.",
      direction: dashboard?.consistency.currentStreak ? "up" : "empty",
      tone: "green",
      icon: "activity",
      visualType: "calendarDots",
      compactLayout: "visualFirst",
      points: (dashboard?.consistency.activityDays ?? [])
        .slice(-60)
        .map((date) => ({ label: dateLabel(date), value: 1, date: new Date(date).toISOString() })),
      rows: [
        {
          label: "Current streak",
          value: dashboard ? `${dashboard.consistency.currentStreak} days` : "--",
        },
        {
          label: "Longest streak",
          value: dashboard ? `${dashboard.consistency.longestStreak} days` : "--",
        },
        {
          label: "Activities",
          value: dashboard ? String(dashboard.consistency.totalActivities) : "--",
        },
      ],
    },
    {
      id: "volume",
      title: "Volume",
      category: "Work done",
      source: "activityAnalysis",
      value: dashboard?.volume.totals
        ? `${number(dashboard.volume.totals.totalTime / 3600, 1)}h`
        : "--",
      summary: dashboard?.volume.totals
        ? `${number(dashboard.volume.totals.totalDistance / 1000, 1)} km across ${dashboard.volume.totals.totalActivities} activities`
        : "No volume in this range",
      detail: "Volume summarizes total moving time, distance, and completed sessions.",
      direction: direction(latestVolume, previousVolume),
      tone: "blue",
      icon: "barChart",
      visualType: "bar",
      compactLayout: "metricFooter",
      points: volumePoints.map((point) => ({
        label: dateLabel(point.date),
        value: point.totalTime / 3600,
        date: new Date(point.date).toISOString(),
      })),
      rows: [],
    },
    {
      id: "performance",
      title: "Activity Efforts",
      category: "Recent outputs",
      source: "activityAnalysis",
      value: latestPerformance?.avgPower
        ? `${number(latestPerformance.avgPower)} W`
        : latestPerformance?.avgSpeed
          ? `${number(latestPerformance.avgSpeed * 3.6, 1)} km/h`
          : "--",
      summary: latestPerformance?.activityName ?? "No power or speed samples yet",
      detail: "Recent effort trends compare average power or speed across completed activities.",
      direction: direction(
        latestPerformance?.avgPower ?? latestPerformance?.avgSpeed ?? null,
        previousPerformance?.avgPower ?? previousPerformance?.avgSpeed ?? null,
      ),
      tone: "purple",
      icon: "zap",
      visualType: "scatter",
      compactLayout: "summaryFooter",
      points: performancePoints.slice(-12).map((point) => ({
        label: dateLabel(point.date),
        value: point.avgPower ?? (point.avgSpeed ?? 0) * 3.6,
        date: new Date(point.date).toISOString(),
      })),
      rows: [],
    },
    {
      id: "zones",
      title: "Intensity Mix",
      category: "Distribution",
      source: "activityAnalysis",
      value: latestZones ? `${number(hardZonePercent)}%` : "--",
      summary: latestZones ? "High-intensity share this week" : "No zone data yet",
      detail: "Zone mix estimates how much weekly stress landed in easy, moderate, and hard work.",
      direction: hardZonePercent > 35 ? "up" : latestZones ? "flat" : "empty",
      tone: "pink",
      icon: "heartPulse",
      visualType: "stacked",
      compactLayout: "visualFirst",
      points: zoneKeys.map((zone) => ({ label: zone, value: latestZones?.zones[zone] ?? 0 })),
      rows: zoneKeys.map((zone) => ({
        label: zone,
        value: latestZones ? `${number(latestZones.zones[zone] ?? 0, 1)}%` : "--",
      })),
    },
    {
      id: "peak-power",
      title: "Peak Power",
      category: "Best effort",
      source: "activityAnalysis",
      value: topPower ? `${number(topPower.value)} ${topPower.unit}` : "--",
      summary: topPower?.activityName ?? "No power peak recorded",
      detail: "Peak cards surface the strongest recorded efforts available from activity history.",
      direction: topPower ? "up" : "empty",
      tone: "orange",
      icon: "trendingUp",
      visualType: "rankedLollipop",
      compactLayout: "metricFooter",
      points: peaks
        .slice(0, 8)
        .reverse()
        .map((point) => ({ label: `#${point.rank}`, value: point.value })),
      rows: peaks.slice(0, 5).map((point) => ({
        label: `#${point.rank} ${point.activityName}`,
        value: `${number(point.value)} ${point.unit}`,
      })),
    },
  ];

  return items.map((item) => trendInsightSchema.parse(item));
}

export function buildTrendInsights(input: {
  analytics: Analytics;
  loadHistory: LoadHistory;
  observations: Observation[];
}) {
  return trendInsightsSectionSchema.parse({
    status:
      input.analytics.status === "available" && input.loadHistory?.status === "available"
        ? "available"
        : "partial",
    items: [
      ...profileInsights(input.observations),
      ...activityInsights(input.analytics, input.loadHistory),
    ],
  });
}
