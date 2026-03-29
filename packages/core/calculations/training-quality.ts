import type { ActivityDerivedZones, ActivityZoneEntry } from "../activity-analysis/contracts";
import { getTrainingIntensityZone } from "../load/tss";

export interface TrainingQualityActivityInput {
  started_at?: string;
  occurred_at?: string;
  start_time?: string;
  tss?: number | null;
  intensity_factor?: number | null;
  zones?: Partial<ActivityDerivedZones> | null;
  power_zone_1_seconds?: number | null;
  power_zone_2_seconds?: number | null;
  power_zone_3_seconds?: number | null;
  power_zone_4_seconds?: number | null;
  power_zone_5_seconds?: number | null;
  power_zone_6_seconds?: number | null;
  power_zone_7_seconds?: number | null;
  hr_zone_1_seconds?: number | null;
  hr_zone_2_seconds?: number | null;
  hr_zone_3_seconds?: number | null;
  hr_zone_4_seconds?: number | null;
  hr_zone_5_seconds?: number | null;
}

export interface TrainingQualityProfile {
  source: "power" | "hr" | "neutral";
  low_intensity_ratio: number;
  moderate_intensity_ratio: number;
  high_intensity_ratio: number;
  load_factor: number;
  atl_extension_days: 0 | 1 | 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function safeSeconds(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function buildZoneTotalsFromEntries(
  entries: ActivityZoneEntry[] | undefined,
  count: number,
): number[] {
  const totals = Array.from({ length: count }, () => 0);

  for (const entry of entries ?? []) {
    const index = entry.zone - 1;
    if (index < 0 || index >= count) continue;
    totals[index] = (totals[index] ?? 0) + safeSeconds(entry.seconds);
  }

  return totals;
}

function activityDate(activity: TrainingQualityActivityInput): Date | null {
  const candidate = activity.started_at ?? activity.occurred_at ?? activity.start_time;
  if (!candidate) return null;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildProfileFromRatios(input: {
  source: TrainingQualityProfile["source"];
  low: number;
  moderate: number;
  high: number;
}): TrainingQualityProfile {
  const low = clamp01(input.low);
  const moderate = clamp01(input.moderate);
  const high = clamp01(input.high);

  const atl_extension_days: 0 | 1 | 2 = high >= 0.2 ? 2 : high >= 0.1 ? 1 : 0;
  const load_factor = atl_extension_days === 2 ? 1.5 : atl_extension_days === 1 ? 1.25 : 1.0;

  return {
    source: input.source,
    low_intensity_ratio: Number(low.toFixed(3)),
    moderate_intensity_ratio: Number(moderate.toFixed(3)),
    high_intensity_ratio: Number(high.toFixed(3)),
    load_factor,
    atl_extension_days,
  };
}

function buildProfileFromIntensityFactor(intensityFactor: number): TrainingQualityProfile {
  const zone = getTrainingIntensityZone(intensityFactor);

  switch (zone) {
    case "recovery":
      return buildProfileFromRatios({ source: "neutral", low: 1, moderate: 0, high: 0 });
    case "endurance":
      return buildProfileFromRatios({ source: "neutral", low: 0.85, moderate: 0.15, high: 0 });
    case "tempo":
      return buildProfileFromRatios({ source: "neutral", low: 0.2, moderate: 0.8, high: 0 });
    case "threshold":
      return buildProfileFromRatios({ source: "neutral", low: 0.1, moderate: 0.3, high: 0.6 });
    case "vo2max":
    case "anaerobic":
    case "neuromuscular":
      return buildProfileFromRatios({ source: "neutral", low: 0, moderate: 0.15, high: 0.85 });
    default:
      return NEUTRAL_TRAINING_QUALITY_PROFILE;
  }
}

const NEUTRAL_TRAINING_QUALITY_PROFILE: TrainingQualityProfile = buildProfileFromRatios({
  source: "neutral",
  low: 0.7,
  moderate: 0.2,
  high: 0.1,
});

export function analyzeActivityIntensity(
  activity: TrainingQualityActivityInput,
): TrainingQualityProfile {
  const powerZones =
    activity.zones?.power && activity.zones.power.length > 0
      ? buildZoneTotalsFromEntries(activity.zones.power, 7)
      : [
          safeSeconds(activity.power_zone_1_seconds),
          safeSeconds(activity.power_zone_2_seconds),
          safeSeconds(activity.power_zone_3_seconds),
          safeSeconds(activity.power_zone_4_seconds),
          safeSeconds(activity.power_zone_5_seconds),
          safeSeconds(activity.power_zone_6_seconds),
          safeSeconds(activity.power_zone_7_seconds),
        ];
  const hrZones =
    activity.zones?.hr && activity.zones.hr.length > 0
      ? buildZoneTotalsFromEntries(activity.zones.hr, 5)
      : [
          safeSeconds(activity.hr_zone_1_seconds),
          safeSeconds(activity.hr_zone_2_seconds),
          safeSeconds(activity.hr_zone_3_seconds),
          safeSeconds(activity.hr_zone_4_seconds),
          safeSeconds(activity.hr_zone_5_seconds),
        ];

  const powerTotal = powerZones.reduce((sum, value) => sum + value, 0);
  const hrTotal = hrZones.reduce((sum, value) => sum + value, 0);
  const hasPowerZones = powerTotal > 0;
  const hasHrZones = hrTotal > 0;

  if (hasPowerZones) {
    const [z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0, z6 = 0, z7 = 0] = powerZones;
    const low = (z1 + z2) / powerTotal;
    const moderate = (z3 + z4 + z5) / powerTotal;
    const high = (z6 + z7) / powerTotal;
    return buildProfileFromRatios({ source: "power", low, moderate, high });
  }

  if (hasHrZones) {
    const [z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0] = hrZones;
    const low = (z1 + z2) / hrTotal;
    const moderate = (z3 + z4) / hrTotal;
    const high = z5 / hrTotal;
    return buildProfileFromRatios({ source: "hr", low, moderate, high });
  }

  if (
    typeof activity.intensity_factor === "number" &&
    Number.isFinite(activity.intensity_factor) &&
    activity.intensity_factor > 0
  ) {
    return buildProfileFromIntensityFactor(activity.intensity_factor);
  }

  return NEUTRAL_TRAINING_QUALITY_PROFILE;
}

export function calculateRollingTrainingQuality(
  activities: TrainingQualityActivityInput[],
  days: number = 28,
  asOf: Date = new Date(),
): TrainingQualityProfile {
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff = asOf.getTime() - Math.max(1, days) * dayMs;

  let weightedLow = 0;
  let weightedModerate = 0;
  let weightedHigh = 0;
  let totalWeight = 0;
  let source: TrainingQualityProfile["source"] = "neutral";

  for (const activity of activities) {
    const date = activityDate(activity);
    if (!date || date.getTime() < cutoff || date.getTime() > asOf.getTime()) {
      continue;
    }

    const profile = analyzeActivityIntensity(activity);
    const weight = Math.max(1, safeSeconds(activity.tss));

    weightedLow += profile.low_intensity_ratio * weight;
    weightedModerate += profile.moderate_intensity_ratio * weight;
    weightedHigh += profile.high_intensity_ratio * weight;
    totalWeight += weight;

    if (source !== "power") {
      if (profile.source === "power") source = "power";
      else if (profile.source === "hr" && source === "neutral") source = "hr";
    }
  }

  if (totalWeight <= 0) {
    return NEUTRAL_TRAINING_QUALITY_PROFILE;
  }

  const low = weightedLow / totalWeight;
  const moderate = weightedModerate / totalWeight;
  const high = weightedHigh / totalWeight;

  return buildProfileFromRatios({ source, low, moderate, high });
}

export function getIntensityAdjustedATLTimeConstant(
  baseTimeConstant: number,
  trainingQuality?: TrainingQualityProfile,
): number {
  const extension = trainingQuality?.atl_extension_days ?? 0;
  return Math.max(1, Math.round(baseTimeConstant + extension));
}
