import type { EvidenceItem, EvidenceSourceType } from "@repo/core";
import { canonicalEffortValue as normalizeCanonicalEffortValue } from "@repo/core/units";

export type EvidenceRegistry = Record<string, EvidenceItem>;

export function sourceId(
  namespace: "activity" | "metric" | "effort" | "goal" | "manual",
  id: string,
  field?: string,
) {
  const components = field === undefined ? [id] : [id, field];
  return `${namespace}:${components.map(encodeURIComponent).join(":")}`;
}

export function lineageId(namespace: "activity" | "metric" | "manual-test", id: string) {
  return `${namespace}:${encodeURIComponent(id)}`;
}

export function addEvidence(input: {
  registry: EvidenceRegistry;
  athleteId: string;
  sourceId: string;
  lineageGroupId: string;
  observedAt: Date;
  value: number | null;
  unit: string | null;
  sport: "run" | "bike" | "swim" | "strength" | "other" | null;
  modality: string;
  sourceType: EvidenceSourceType;
  validityState?: EvidenceItem["validityState"];
  compatibilityState?: EvidenceItem["compatibilityState"];
}): string {
  input.registry[input.sourceId] = {
    athleteId: input.athleteId,
    sourceId: input.sourceId,
    lineageGroupId: input.lineageGroupId,
    observedAt: input.observedAt.toISOString(),
    rawObservation: { value: input.value, unit: input.unit },
    sport: input.sport,
    modality: input.modality,
    sourceType: input.sourceType,
    qualityState: input.value === null ? "unknown" : "known",
    validityState: input.validityState ?? "valid",
    compatibilityState: input.compatibilityState ?? "compatible",
  };
  return input.sourceId;
}

export function normalizeSport(value: string | null | undefined) {
  const sport = value?.toLowerCase() ?? "";
  if (sport.includes("run")) return "run" as const;
  if (sport.includes("cycl") || sport.includes("bike") || sport.includes("ride"))
    return "bike" as const;
  if (sport.includes("swim")) return "swim" as const;
  if (sport.includes("strength") || sport.includes("weight")) return "strength" as const;
  return "other" as const;
}

export function parseScheduleRecurrence(rule: string | null, startsAt: Date) {
  if (!rule) return null;
  const body = rule.replace(/^RRULE:/i, "");
  const parts: Record<string, string> = {};
  const supportedKeys = new Set(["FREQ", "INTERVAL", "UNTIL"]);
  for (const component of body.split(";")) {
    const separator = component.indexOf("=");
    if (
      separator <= 0 ||
      separator !== component.lastIndexOf("=") ||
      separator === component.length - 1
    )
      return null;
    const key = component.slice(0, separator).toUpperCase();
    const value = component.slice(separator + 1);
    if (!supportedKeys.has(key) || key in parts) return null;
    parts[key] = value;
  }
  const frequency = parts.FREQ?.toLowerCase();
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") return null;
  if (parts.INTERVAL !== undefined && !/^\d+$/.test(parts.INTERVAL)) return null;
  const interval = Number(parts.INTERVAL ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return null;
  const untilValue = parts.UNTIL;
  if (untilValue !== undefined && !/^\d{8}T\d{6}Z$/.test(untilValue)) return null;
  const until = untilValue
    ? new Date(
        untilValue.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"),
      )
    : null;
  if (until && Number.isNaN(until.getTime())) return null;
  const normalizedUntil = until
    ? until.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".000", "")
    : null;
  if (until && (normalizedUntil !== untilValue || until < startsAt)) return null;
  return { frequency, interval, until: until?.toISOString() ?? null };
}

export const metricUnits = {
  ftp: "watts",
  threshold_pace_seconds_per_km: "seconds_per_km",
  css_seconds_per_100m: "seconds_per_100m",
  lthr: "beats_per_minute",
  max_hr: "beats_per_minute",
  resting_hr: "beats_per_minute",
  vo2_max: "milliliters_per_kilogram_per_minute",
  weight_kg: "kilograms",
  hrv_rmssd: "milliseconds",
  sleep_hours: "hours",
  stress_score: "score",
  soreness_level: "score",
  wellness_score: "score",
  age_years: "years",
} as const;

export function canonicalMetricValue(
  type: keyof typeof metricUnits,
  value: number,
  unit: string,
): number | null {
  const normalized = unit.trim().toLowerCase().replaceAll(" ", "");
  const aliases: Record<keyof typeof metricUnits, readonly string[]> = {
    ftp: ["w", "watt", "watts"],
    threshold_pace_seconds_per_km: ["s/km", "sec/km", "seconds_per_km", "secondsperkm"],
    css_seconds_per_100m: ["s/100m", "sec/100m", "seconds_per_100m", "secondsper100m"],
    lthr: ["bpm", "beatperminute", "beatsperminute"],
    max_hr: ["bpm", "beatperminute", "beatsperminute"],
    resting_hr: ["bpm", "beatperminute", "beatsperminute"],
    vo2_max: ["ml/kg/min", "millilitersperkilogramperminute"],
    weight_kg: ["kg", "kilogram", "kilograms"],
    hrv_rmssd: ["ms", "millisecond", "milliseconds"],
    sleep_hours: ["h", "hr", "hrs", "hour", "hours"],
    stress_score: ["score", "points"],
    soreness_level: ["score", "points"],
    wellness_score: ["score", "points"],
    age_years: ["year", "years"],
  };

  if (aliases[type].includes(normalized)) return value;
  if (type === "weight_kg" && ["lb", "lbs", "pound", "pounds"].includes(normalized)) {
    return value * 0.45359237;
  }
  if (type === "sleep_hours" && ["min", "minute", "minutes"].includes(normalized)) {
    return value / 60;
  }
  if (type === "sleep_hours" && ["s", "sec", "second", "seconds"].includes(normalized)) {
    return value / 3_600;
  }
  return null;
}

export function temporalOverlayValue<T>(input: {
  legacyValue: T;
  summaryValue: T | null;
  summaryUpdatedAt: Date | null;
  asOf: Date;
}): T {
  return input.summaryUpdatedAt !== null && input.summaryUpdatedAt <= input.asOf
    ? (input.summaryValue ?? input.legacyValue)
    : input.legacyValue;
}

export function canonicalEffortValue(
  kind: "power" | "speed",
  value: number,
  unit: string,
): { value: number; unit: "watts" | "meters_per_second" } | null {
  return normalizeCanonicalEffortValue({ kind, value, unit });
}
