import type { IntensityTargetV2 } from "@repo/core/schemas";
import React from "react";
import { View } from "react-native";
import { formatEstimatedIntensityFactor, formatEstimatedTss } from "@/lib/estimatedMetrics";
import { formatSeconds } from "./format";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

type MetricKey =
  | "time"
  | "lap_time"
  | "distance"
  | "pace"
  | "heart_rate"
  | "heart_rate_zone"
  | "power"
  | "power_zone"
  | "cadence"
  | "speed"
  | "gap"
  | "calories"
  | "work"
  | "ascent"
  | "descent"
  | "grade"
  | "vertical_speed"
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
  unit: string | null;
  target: string | null;
  tone: MetricTone;
}

interface MetricDisplayValue {
  value: string;
  unit: string | null;
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
  const expandedMetrics = React.useMemo(
    () =>
      buildMetricInsights({
        includeUnavailable: true,
        targets: plan.hasPlan ? plan.currentStep?.targets : undefined,
        readings,
        service,
        sessionContract,
        stats,
      }),
    [plan, readings, service, sessionContract, stats],
  );
  const compactMetrics = React.useMemo(
    () =>
      buildMetricInsights({
        includeUnavailable: false,
        targets: plan.hasPlan ? plan.currentStep?.targets : undefined,
        readings,
        service,
        sessionContract,
        stats,
      }).slice(0, 6),
    [plan, readings, service, sessionContract, stats],
  );

  if (compact) {
    return (
      <View className="h-full justify-center" testID="metrics-insight-card">
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {compactMetrics.map((metric) => (
            <MetricTile
              compact
              key={metric.key}
              label={metric.label}
              target={metric.target}
              tone={metric.tone}
              unit={metric.unit}
              value={metric.value}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" testID="metrics-insight-card">
      <View className="flex-1 flex-row flex-wrap content-stretch items-stretch justify-between gap-y-3">
        {expandedMetrics.map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            layout="half"
            target={metric.target}
            tone={metric.tone}
            unit={metric.unit}
            value={metric.value}
          />
        ))}
      </View>
    </View>
  );
}

function buildMetricInsights({
  includeUnavailable,
  targets,
  readings,
  service,
  sessionContract,
  stats,
}: Pick<InsightCardProps, "readings" | "service" | "sessionContract" | "stats"> & {
  includeUnavailable: boolean;
  targets?: IntensityTargetV2[];
}): MetricInsight[] {
  const order = getMetricOrder(targets, sessionContract?.metrics.emphasizedMetrics ?? []);
  const targetValues = getTargetValues(targets, service);

  return order
    .map((key) => {
      const display = getMetricValue(key, readings, stats, service);
      if (!display && !includeUnavailable) return null;

      const current = getMetricNumericValue(key, readings);
      const target = targetValues[key] ?? null;

      return {
        key,
        label: getMetricLabel(key),
        value: display?.value ?? "--",
        unit: display?.unit ?? getMetricUnit(key),
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
    "distance",
    "heart_rate",
    "heart_rate_zone",
    "power",
    "power_zone",
    "normalized_power",
    "training_stress_score",
    "intensity_factor",
    "lap_time",
    "pace",
    "gap",
    "cadence",
    "speed",
    "calories",
    "work",
    "ascent",
    "descent",
    "grade",
    "vertical_speed",
    "avg_heart_rate",
    "avg_power",
    "avg_cadence",
    "avg_speed",
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
): MetricDisplayValue | null {
  switch (key) {
    case "time":
      return { value: formatSeconds(stats.duration ?? 0), unit: null };
    case "lap_time":
      return { value: formatSeconds(getLapTimeSeconds(service, stats)), unit: null };
    case "distance":
      return hasNumber(stats.distance)
        ? { value: (stats.distance / 1000).toFixed(2), unit: "km" }
        : null;
    case "pace":
      return readings.speed && readings.speed > 0
        ? { value: formatPace(1000 / 60 / readings.speed), unit: "/km" }
        : null;
    case "heart_rate":
      return hasNumber(readings.heartRate)
        ? { value: `${Math.round(readings.heartRate)}`, unit: "bpm" }
        : null;
    case "heart_rate_zone":
      return hasNumber(stats.currentHeartRateZone)
        ? { value: `Z${stats.currentHeartRateZone}`, unit: null }
        : null;
    case "power":
      return hasNumber(readings.power)
        ? { value: `${Math.round(readings.power)}`, unit: "W" }
        : null;
    case "power_zone":
      return hasNumber(stats.currentPowerZone)
        ? { value: `Z${stats.currentPowerZone}`, unit: null }
        : null;
    case "cadence":
      return readings.cadence ? { value: `${Math.round(readings.cadence)}`, unit: "rpm" } : null;
    case "speed":
      return readings.speed && readings.speed > 0
        ? { value: (readings.speed * 3.6).toFixed(1), unit: "km/h" }
        : null;
    case "gap":
      return hasNumber(stats.gradeAdjustedPaceSecondsPerKm) &&
        stats.gradeAdjustedPaceSecondsPerKm > 0
        ? { value: formatPace(stats.gradeAdjustedPaceSecondsPerKm / 60), unit: "/km" }
        : null;
    case "calories":
      return hasNumber(stats.calories)
        ? { value: `${Math.round(stats.calories)}`, unit: "cal" }
        : null;
    case "work":
      return hasNumber(stats.work)
        ? { value: `${Math.round(stats.work / 1000)}`, unit: "kJ" }
        : null;
    case "ascent":
      return hasNumber(stats.ascent) ? { value: `${Math.round(stats.ascent)}`, unit: "m" } : null;
    case "descent":
      return hasNumber(stats.descent) ? { value: `${Math.round(stats.descent)}`, unit: "m" } : null;
    case "grade":
      return hasNumber(stats.currentGrade)
        ? { value: stats.currentGrade.toFixed(1), unit: "%" }
        : hasNumber(stats.avgGrade)
          ? { value: stats.avgGrade.toFixed(1), unit: "%" }
          : null;
    case "vertical_speed":
      return hasNumber(stats.verticalSpeedMetersPerHour)
        ? { value: `${Math.round(stats.verticalSpeedMetersPerHour)}`, unit: "m/h" }
        : null;
    case "avg_heart_rate":
      return stats.avgHeartRate > 0
        ? { value: `${Math.round(stats.avgHeartRate)}`, unit: "bpm" }
        : null;
    case "avg_power":
      return stats.avgPower > 0 ? { value: `${Math.round(stats.avgPower)}`, unit: "W" } : null;
    case "avg_cadence":
      return stats.avgCadence > 0
        ? { value: `${Math.round(stats.avgCadence)}`, unit: "rpm" }
        : null;
    case "avg_speed":
      return stats.avgSpeed > 0 ? { value: (stats.avgSpeed * 3.6).toFixed(1), unit: "km/h" } : null;
    case "normalized_power":
      return hasNumber(stats.normalizedPower)
        ? { value: `${Math.round(stats.normalizedPower)}`, unit: "W" }
        : null;
    case "training_stress_score":
      return hasNumber(stats.trainingStressScore)
        ? {
            value: formatEstimatedTss(stats.trainingStressScore, { includeUnit: false }) ?? "--",
            unit: null,
          }
        : null;
    case "intensity_factor":
      return hasNumber(stats.intensityFactor)
        ? { value: formatEstimatedIntensityFactor(stats.intensityFactor) ?? "--", unit: null }
        : null;
  }
}

function getMetricUnit(key: MetricKey) {
  switch (key) {
    case "distance":
      return "km";
    case "pace":
      return "/km";
    case "heart_rate":
    case "avg_heart_rate":
      return "bpm";
    case "power":
    case "avg_power":
    case "normalized_power":
      return "W";
    case "cadence":
    case "avg_cadence":
      return "rpm";
    case "speed":
    case "avg_speed":
      return "km/h";
    case "gap":
      return "/km";
    case "calories":
      return "cal";
    case "work":
      return "kJ";
    case "ascent":
    case "descent":
      return "m";
    case "grade":
      return "%";
    case "vertical_speed":
      return "m/h";
    default:
      return null;
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
  if (key === "heart_rate_zone") return "HR Zone";
  if (key === "power_zone") return "Power Zone";
  if (key === "gap") return "GAP";
  if (key === "lap_time") return "Lap";
  if (key === "vertical_speed") return "VAM";
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
