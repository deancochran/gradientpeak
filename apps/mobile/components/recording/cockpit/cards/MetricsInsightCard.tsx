import type { IntensityTargetV2 } from "@repo/core/schemas";
import React from "react";
import { View } from "react-native";
import { formatSeconds } from "./format";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

type MetricKey =
  | "time"
  | "lap_time"
  | "distance"
  | "pace"
  | "heart_rate"
  | "power"
  | "cadence"
  | "speed"
  | "calories"
  | "work"
  | "ascent"
  | "descent"
  | "grade"
  | "avg_heart_rate"
  | "avg_power"
  | "avg_cadence"
  | "avg_speed"
  | "normalized_power"
  | "training_stress_score"
  | "intensity_factor";
type MetricTone = "neutral" | "good" | "warn" | "danger";

interface MetricInsight {
  key: MetricKey;
  label: string;
  value: string;
  target: string | null;
  tone: MetricTone;
}

export function MetricsInsightCard({
  mode,
  plan,
  readings,
  service,
  sessionContract,
  stats,
}: InsightCardProps) {
  const compact = mode === "compact";
  const metrics = React.useMemo(
    () =>
      buildMetricInsights({
        targets: plan.hasPlan ? plan.currentStep?.targets : undefined,
        readings,
        service,
        sessionContract,
        stats,
      }),
    [plan, readings, service, sessionContract, stats],
  );
  const compactMetrics = metrics.slice(0, 6);

  if (compact) {
    return (
      <View className="h-full justify-center" testID="metrics-insight-card">
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {compactMetrics.map((metric) => (
            <MetricTile
              compact
              key={metric.key}
              label={metric.label}
              subtitle={metric.target ? `Target ${metric.target}` : null}
              tone={metric.tone}
              value={metric.value}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View testID="metrics-insight-card">
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {metrics.map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            layout="half"
            subtitle={metric.target ? `Target ${metric.target}` : null}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </View>
    </View>
  );
}

function buildMetricInsights({
  targets,
  readings,
  service,
  sessionContract,
  stats,
}: Pick<InsightCardProps, "readings" | "service" | "sessionContract" | "stats"> & {
  targets?: IntensityTargetV2[];
}): MetricInsight[] {
  const order = getMetricOrder(targets, sessionContract?.metrics.emphasizedMetrics ?? []);
  const targetValues = getTargetValues(targets, service);

  return order
    .map((key) => {
      const value = getMetricValue(key, readings, stats, service);
      if (!value) return null;

      const current = getMetricNumericValue(key, readings);
      const target = targetValues[key] ?? null;

      return {
        key,
        label: getMetricLabel(key),
        value,
        target: target?.label ?? null,
        tone: current && target ? getTargetTone(current, target.value) : "neutral",
      };
    })
    .filter((metric): metric is MetricInsight => metric !== null);
}

function getMetricOrder(targets: IntensityTargetV2[] | undefined, emphasized: MetricKey[]) {
  const targetMetrics = new Set<MetricKey>();

  for (const target of targets ?? []) {
    if (target.type === "%FTP" || target.type === "watts") targetMetrics.add("power");
    if (target.type === "%MaxHR" || target.type === "%ThresholdHR" || target.type === "bpm") {
      targetMetrics.add("heart_rate");
    }
    if (target.type === "cadence") targetMetrics.add("cadence");
    if (target.type === "speed") targetMetrics.add("pace");
  }

  return uniqueMetrics([
    ...targetMetrics,
    ...emphasized,
    "time",
    "lap_time",
    "distance",
    "pace",
    "heart_rate",
    "power",
    "cadence",
    "speed",
    "calories",
    "work",
    "ascent",
    "descent",
    "grade",
    "avg_heart_rate",
    "avg_power",
    "avg_cadence",
    "avg_speed",
    "normalized_power",
    "training_stress_score",
    "intensity_factor",
  ]);
}

function uniqueMetrics(metrics: Iterable<MetricKey>) {
  return Array.from(new Set(metrics));
}

function getMetricValue(
  key: MetricKey,
  readings: InsightCardProps["readings"],
  stats: InsightCardProps["stats"],
  service: InsightCardProps["service"],
) {
  switch (key) {
    case "time":
      return formatSeconds(stats.duration ?? 0);
    case "lap_time":
      return formatSeconds(getLapTimeSeconds(service, stats));
    case "distance":
      return hasNumber(stats.distance) ? `${(stats.distance / 1000).toFixed(2)} km` : null;
    case "pace":
      return readings.speed && readings.speed > 0
        ? `${formatPace(1000 / 60 / readings.speed)} /km`
        : null;
    case "heart_rate":
      return readings.heartRate ? `${Math.round(readings.heartRate)} bpm` : null;
    case "power":
      return readings.power ? `${Math.round(readings.power)} W` : null;
    case "cadence":
      return readings.cadence ? `${Math.round(readings.cadence)} rpm` : null;
    case "speed":
      return readings.speed && readings.speed > 0
        ? `${(readings.speed * 3.6).toFixed(1)} km/h`
        : null;
    case "calories":
      return hasNumber(stats.calories) ? `${Math.round(stats.calories)} cal` : null;
    case "work":
      return hasNumber(stats.work) ? `${Math.round(stats.work / 1000)} kJ` : null;
    case "ascent":
      return hasNumber(stats.ascent) ? `${Math.round(stats.ascent)} m` : null;
    case "descent":
      return hasNumber(stats.descent) ? `${Math.round(stats.descent)} m` : null;
    case "grade":
      return stats.avgGrade !== undefined ? `${stats.avgGrade.toFixed(1)}%` : null;
    case "avg_heart_rate":
      return stats.avgHeartRate > 0 ? `${Math.round(stats.avgHeartRate)} bpm` : null;
    case "avg_power":
      return stats.avgPower > 0 ? `${Math.round(stats.avgPower)} W` : null;
    case "avg_cadence":
      return stats.avgCadence > 0 ? `${Math.round(stats.avgCadence)} rpm` : null;
    case "avg_speed":
      return stats.avgSpeed > 0 ? `${(stats.avgSpeed * 3.6).toFixed(1)} km/h` : null;
    case "normalized_power":
      return stats.normalizedPower ? `${Math.round(stats.normalizedPower)} W` : null;
    case "training_stress_score":
      return stats.trainingStressScore ? `${Math.round(stats.trainingStressScore)}` : null;
    case "intensity_factor":
      return stats.intensityFactor ? stats.intensityFactor.toFixed(2) : null;
  }
}

function hasNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getMetricNumericValue(key: MetricKey, readings: InsightCardProps["readings"]) {
  if (key === "power") return readings.power ?? null;
  if (key === "heart_rate") return readings.heartRate ?? null;
  if (key === "cadence") return readings.cadence ?? null;
  if (key === "pace" && readings.speed && readings.speed > 0) return 1000 / 60 / readings.speed;
  return null;
}

function getTargetValues(
  targets: IntensityTargetV2[] | undefined,
  service: InsightCardProps["service"],
) {
  const values: Partial<Record<MetricKey, { label: string; value: number }>> = {};
  const ftp = service?.getBaseFtp?.() ?? 200;
  const maxHr = service?.getBaseThresholdHr?.() ?? 160;
  const thresholdHr = service?.getBaseThresholdHr?.() ?? 160;

  for (const target of targets ?? []) {
    if (target.type === "%FTP") {
      const value = Math.round((target.intensity / 100) * ftp);
      values.power = { label: `${value} W`, value };
    } else if (target.type === "watts") {
      values.power = { label: `${Math.round(target.intensity)} W`, value: target.intensity };
    } else if (target.type === "%MaxHR") {
      const value = Math.round((target.intensity / 100) * maxHr);
      values.heart_rate = { label: `${value} bpm`, value };
    } else if (target.type === "%ThresholdHR") {
      const value = Math.round((target.intensity / 100) * thresholdHr);
      values.heart_rate = { label: `${value} bpm`, value };
    } else if (target.type === "bpm") {
      values.heart_rate = { label: `${Math.round(target.intensity)} bpm`, value: target.intensity };
    } else if (target.type === "cadence") {
      values.cadence = { label: `${Math.round(target.intensity)} rpm`, value: target.intensity };
    } else if (target.type === "speed") {
      const pace = target.intensity > 0 ? 1000 / 60 / target.intensity : 0;
      values.pace = { label: `${formatPace(pace)} /km`, value: pace };
    }
  }

  return values;
}

function getTargetTone(current: number, target: number): MetricTone {
  if (target <= 0) return "neutral";
  const low = target * 0.9;
  const high = target * 1.1;

  if (current < low) return "warn";
  if (current > high) return "danger";
  return "good";
}

function getMetricLabel(key: MetricKey) {
  if (key === "heart_rate") return "HR";
  if (key === "lap_time") return "Lap";
  if (key === "avg_heart_rate") return "Avg HR";
  if (key === "avg_power") return "Avg Power";
  if (key === "avg_cadence") return "Avg Cadence";
  if (key === "avg_speed") return "Avg Speed";
  if (key === "normalized_power") return "NP";
  if (key === "training_stress_score") return "TSS";
  if (key === "intensity_factor") return "IF";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function getLapTimeSeconds(service: InsightCardProps["service"], stats: InsightCardProps["stats"]) {
  const serviceLapTime = service?.getLapTime?.();
  if (typeof serviceLapTime === "number" && Number.isFinite(serviceLapTime)) {
    return Math.max(0, Math.floor(serviceLapTime / 1000));
  }

  return Math.max(0, Math.floor(stats.movingTime ?? stats.duration ?? 0));
}

function formatPace(minPerKm: number) {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "--";
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
