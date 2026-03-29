import type { AggregatedStream } from "../calculations";
import { calculateHRZones, calculatePowerZones } from "../calculations";
import { calculateTrainingTSS, getTrainingIntensityZone } from "../load/tss";
import type { ActivityDerivedMetrics, ActivityZoneEntry } from "./contracts";

export type ActivityAnalysisContext = {
  profileMetrics: {
    ftp?: number | null;
    lthr?: number | null;
    max_hr?: number | null;
    resting_hr?: number | null;
    weight_kg?: number | null;
  };
  recentEfforts: Array<{
    recorded_at: string;
    effort_type: "power" | "speed";
    duration_seconds: number;
    value: number;
    activity_category?: string | null;
  }>;
  profile: {
    dob?: string | null;
    gender?: "male" | "female" | "other" | null;
  };
};

export type ActivitySummaryForAnalysis = {
  id: string;
  type: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  moving_seconds?: number | null;
  distance_meters?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  avg_power?: number | null;
  max_power?: number | null;
  avg_speed_mps?: number | null;
  max_speed_mps?: number | null;
  normalized_power?: number | null;
  normalized_speed_mps?: number | null;
  normalized_graded_speed_mps?: number | null;
};

export type ActivityAnalysisStreams = {
  heart_rate?: AggregatedStream | null;
  power?: AggregatedStream | null;
  speed?: AggregatedStream | null;
};

type AnalyzeActivityDerivedMetricsInput = {
  activity: ActivitySummaryForAnalysis;
  context: ActivityAnalysisContext;
  streams?: ActivityAnalysisStreams | null;
};

const HR_ZONE_LABELS = [
  "Zone 1 (Recovery)",
  "Zone 2 (Endurance)",
  "Zone 3 (Tempo)",
  "Zone 4 (Threshold)",
  "Zone 5 (VO2 Max)",
] as const;

const POWER_ZONE_LABELS = [
  "Zone 1 (Active Recovery)",
  "Zone 2 (Endurance)",
  "Zone 3 (Tempo)",
  "Zone 4 (Threshold)",
  "Zone 5 (VO2 Max)",
  "Zone 6 (Anaerobic)",
  "Zone 7 (Neuromuscular)",
] as const;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function toZoneEntries(
  values: Record<string, number | undefined>,
  labels: readonly string[],
): ActivityZoneEntry[] {
  return labels
    .map((label, index) => ({
      zone: index + 1,
      seconds: Math.max(0, Math.round(values[`zone${index + 1}`] ?? 0)),
      label,
    }))
    .filter((entry) => entry.seconds > 0);
}

function resolveIntensityFactor(input: {
  normalizedPower?: number | null;
  avgPower?: number | null;
  ftp?: number | null;
}): number | null {
  const { normalizedPower, avgPower, ftp } = input;
  if (!ftp) return null;

  const referencePower = normalizedPower ?? avgPower;
  if (!referencePower || referencePower <= 0) return null;

  return roundToTwoDecimals(referencePower / ftp);
}

function resolveTrainingEffect(
  intensityFactor: number | null,
): ActivityDerivedMetrics["stress"]["training_effect"] {
  if (intensityFactor === null) return null;

  const zone = getTrainingIntensityZone(intensityFactor);
  switch (zone) {
    case "recovery":
      return "recovery";
    case "endurance":
      return "base";
    case "tempo":
      return "tempo";
    case "threshold":
      return "threshold";
    default:
      return "vo2max";
  }
}

function resolveTrimp(input: {
  avgHeartRate?: number | null;
  durationSeconds: number;
  maxHr?: number | null;
  restingHr?: number | null;
}): number | null {
  const { avgHeartRate, durationSeconds, maxHr, restingHr } = input;
  if (!avgHeartRate || !maxHr || !restingHr || maxHr <= restingHr) {
    return null;
  }

  const hrReserveRatio = (avgHeartRate - restingHr) / (maxHr - restingHr);
  if (!Number.isFinite(hrReserveRatio) || hrReserveRatio <= 0) {
    return null;
  }

  const durationMinutes = durationSeconds / 60;
  const trimp = durationMinutes * hrReserveRatio * 0.64 * Math.exp(1.92 * hrReserveRatio);
  return Number.isFinite(trimp) ? Math.round(trimp) : null;
}

export function analyzeActivityDerivedMetrics(
  input: AnalyzeActivityDerivedMetricsInput,
): ActivityDerivedMetrics {
  const { activity, context, streams } = input;
  const ftp = context.profileMetrics.ftp ?? null;
  const lthr = context.profileMetrics.lthr ?? null;
  const maxHr = context.profileMetrics.max_hr ?? null;
  const restingHr = context.profileMetrics.resting_hr ?? null;

  const intensityFactor = resolveIntensityFactor({
    normalizedPower: activity.normalized_power,
    avgPower: activity.avg_power,
    ftp,
  });

  const tss =
    intensityFactor !== null
      ? Math.round(calculateTrainingTSS(activity.duration_seconds, intensityFactor))
      : null;

  const trimp = resolveTrimp({
    avgHeartRate: activity.avg_heart_rate,
    durationSeconds: activity.duration_seconds,
    maxHr,
    restingHr,
  });

  const hrZones = toZoneEntries(
    calculateHRZones(streams?.heart_rate ?? undefined, lthr),
    HR_ZONE_LABELS,
  );
  const powerZones = toZoneEntries(
    calculatePowerZones(streams?.power ?? undefined, ftp),
    POWER_ZONE_LABELS,
  );

  return {
    stress: {
      tss,
      intensity_factor: intensityFactor,
      trimp,
      trimp_source: trimp !== null ? "hr" : intensityFactor !== null ? "power_proxy" : null,
      training_effect: resolveTrainingEffect(intensityFactor),
    },
    zones: {
      hr: hrZones,
      power: powerZones,
    },
    computed_as_of: activity.finished_at,
  };
}
