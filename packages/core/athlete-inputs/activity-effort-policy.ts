import { type CanonicalEffortUnit, canonicalEffortValue } from "../units/effort";
import type { ActivityEffortCategory, ActivityEffortType } from "./activity-efforts";

export const ACTIVITY_EFFORT_HARD_BOUNDS = {
  durationSeconds: { min: 1, max: 14_400 },
  bikePowerWatts: { min: 1, max: 3_000 },
  runSpeedMetersPerSecond: { min: 0.3, max: 13 },
  swimSpeedMetersPerSecond: { min: 0.1, max: 3 },
  heartRateBpm: { min: 30, max: 240 },
} as const;

interface PlausibilityBand {
  maxDurationSeconds: number;
  maxValue: number;
}

interface BikePlausibilityBand extends PlausibilityBand {
  maxFtpMultiple: number;
  maxWattsPerKilogram: number;
}

/** Broad review thresholds, not population-performance predictions. */
export const BIKE_POWER_PLAUSIBILITY_BANDS = [
  { maxDurationSeconds: 15, maxValue: 3_000, maxFtpMultiple: 12, maxWattsPerKilogram: 30 },
  { maxDurationSeconds: 60, maxValue: 2_000, maxFtpMultiple: 6, maxWattsPerKilogram: 20 },
  { maxDurationSeconds: 300, maxValue: 1_200, maxFtpMultiple: 2.5, maxWattsPerKilogram: 12 },
  { maxDurationSeconds: 1_200, maxValue: 800, maxFtpMultiple: 1.5, maxWattsPerKilogram: 8 },
  { maxDurationSeconds: 3_600, maxValue: 650, maxFtpMultiple: 1.2, maxWattsPerKilogram: 6.5 },
  { maxDurationSeconds: 14_400, maxValue: 500, maxFtpMultiple: 1.05, maxWattsPerKilogram: 5.5 },
] as const satisfies readonly BikePlausibilityBand[];

export const RUN_SPEED_PLAUSIBILITY_BANDS = [
  { maxDurationSeconds: 15, maxValue: 13 },
  { maxDurationSeconds: 60, maxValue: 11 },
  { maxDurationSeconds: 300, maxValue: 8 },
  { maxDurationSeconds: 1_200, maxValue: 7 },
  { maxDurationSeconds: 3_600, maxValue: 6.5 },
  { maxDurationSeconds: 14_400, maxValue: 6 },
] as const satisfies readonly PlausibilityBand[];

export const SWIM_SPEED_PLAUSIBILITY_BANDS = [
  { maxDurationSeconds: 30, maxValue: 3 },
  { maxDurationSeconds: 120, maxValue: 2.5 },
  { maxDurationSeconds: 600, maxValue: 2 },
  { maxDurationSeconds: 1_800, maxValue: 1.8 },
  { maxDurationSeconds: 14_400, maxValue: 1.6 },
] as const satisfies readonly PlausibilityBand[];

export interface ActivityEffortPlausibilityInput {
  activityCategory: ActivityEffortCategory;
  effortType: ActivityEffortType;
  durationSeconds: number;
  value: number;
  context?: {
    ftpWatts?: number | null;
    weightKilograms?: number | null;
  };
}

export type ActivityEffortPlausibilityClassification =
  | { classification: "hard-invalid"; reasons: string[]; heuristicCeiling: null }
  | { classification: "plausible"; reasons: []; heuristicCeiling: number }
  | {
      classification: "quarantinable-implausible";
      reasons: string[];
      heuristicCeiling: number;
    };

export type ActivityEffortObservationStatus = "observed" | "modeled" | "review" | "invalid";

export type ActivityEffortThresholdEvidence = "imported_activity_stream";

export interface ActivityEffortObservationInput extends ActivityEffortPlausibilityInput {
  activityId?: string | null;
  unit?: string | null;
  source?: string | null;
  method?: string | null;
  provenance?: unknown;
}

export const MANUAL_ACTIVITY_EFFORT_PROVENANCE = {
  observation_type: "observed",
  trusted: true,
  entered_by: "athlete",
} as const;

export const MANUAL_ACTIVITY_EFFORT_METHOD = "manual_activity_effort_entry";

export function isSupportedActivityEffortCombination(input: {
  activityCategory: string;
  effortType: string;
}): boolean {
  return (
    (input.activityCategory === "bike" && input.effortType === "power") ||
    ((input.activityCategory === "run" || input.activityCategory === "swim") &&
      input.effortType === "speed") ||
    ((input.activityCategory === "bike" ||
      input.activityCategory === "run" ||
      input.activityCategory === "swim") &&
      input.effortType === "heart_rate")
  );
}

export function canonicalizeActivityEffortObservation(input: {
  effortType: ActivityEffortType;
  value: number;
  unit?: string | null;
}): { value: number; unit: CanonicalEffortUnit } | null {
  if (!input.unit) {
    return {
      value: input.value,
      unit:
        input.effortType === "power"
          ? "watts"
          : input.effortType === "speed"
            ? "meters_per_second"
            : "bpm",
    };
  }
  return canonicalEffortValue({ kind: input.effortType, value: input.value, unit: input.unit });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Single eligibility and provenance policy for observed effort analytics. */
export function getActivityEffortObservationStatus(
  input: ActivityEffortObservationInput,
): ActivityEffortObservationStatus {
  const provenance = isRecord(input.provenance) ? input.provenance : null;
  if (
    input.source === "derived" ||
    input.source === "estimated" ||
    input.method === "onboarding_modeled_curve" ||
    provenance?.observation_type === "modeled"
  ) {
    return "modeled";
  }

  const canonical = canonicalizeActivityEffortObservation(input);
  if (!canonical) return "invalid";
  const plausibility = classifyActivityEffortPlausibility({
    activityCategory: input.activityCategory,
    effortType: input.effortType,
    durationSeconds: input.durationSeconds,
    value: canonical.value,
    context: input.context,
  });
  if (plausibility.classification === "hard-invalid") return "invalid";
  if (plausibility.classification === "quarantinable-implausible") return "review";

  if (input.source === "manual") {
    return provenance?.trusted === true && provenance.observation_type === "observed"
      ? "observed"
      : "review";
  }
  if (input.source === "imported" && input.method === "activity_file_best_effort") {
    if (provenance?.derived_from !== "activity_file_stream") return "review";
    return typeof provenance.activity_id === "string" && provenance.activity_id === input.activityId
      ? "observed"
      : "review";
  }
  if (input.source === "provider") {
    return provenance?.trusted === true && provenance.observation_type === "observed"
      ? "observed"
      : "review";
  }
  return "review";
}

/** Returns the provenance evidence required before a 20-minute effort may calibrate a threshold. */
export function getActivityEffortThresholdEvidence(
  input: ActivityEffortObservationInput,
): ActivityEffortThresholdEvidence | null {
  if (input.durationSeconds !== 1200 || !hasTrustedActivityStreamEvidence(input)) {
    return null;
  }
  return "imported_activity_stream";
}

/** True only for a plausible observation proven to originate from its owned activity stream. */
export function hasTrustedActivityStreamEvidence(input: ActivityEffortObservationInput): boolean {
  if (getActivityEffortObservationStatus(input) !== "observed") return false;
  if (
    input.source !== "imported" ||
    input.method !== "activity_file_best_effort" ||
    !input.activityId
  ) {
    return false;
  }
  const provenance = isRecord(input.provenance) ? input.provenance : null;
  return (
    provenance?.derived_from === "activity_file_stream" &&
    provenance.activity_id === input.activityId
  );
}

function bandForDuration<T extends PlausibilityBand>(
  bands: readonly T[],
  durationSeconds: number,
): T {
  const band = bands.find((candidate) => durationSeconds <= candidate.maxDurationSeconds);
  if (band) return band;
  const fallback = bands.at(-1);
  if (!fallback) throw new Error("At least one plausibility band is required");
  return fallback;
}

/**
 * Separates values that must not be stored from valid raw observations that
 * should be retained but quarantined from performance modeling pending review.
 */
export function classifyActivityEffortPlausibility(
  input: ActivityEffortPlausibilityInput,
): ActivityEffortPlausibilityClassification {
  const reasons: string[] = [];
  const durationBounds = ACTIVITY_EFFORT_HARD_BOUNDS.durationSeconds;
  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < durationBounds.min ||
    input.durationSeconds > durationBounds.max
  ) {
    reasons.push("duration-outside-hard-bounds");
  }

  const supportedCombination = isSupportedActivityEffortCombination(input);
  if (!supportedCombination) reasons.push("unsupported-sport-effort-combination");

  const valueBounds =
    input.effortType === "heart_rate"
      ? ACTIVITY_EFFORT_HARD_BOUNDS.heartRateBpm
      : input.activityCategory === "bike" && input.effortType === "power"
        ? ACTIVITY_EFFORT_HARD_BOUNDS.bikePowerWatts
        : input.activityCategory === "run" && input.effortType === "speed"
          ? ACTIVITY_EFFORT_HARD_BOUNDS.runSpeedMetersPerSecond
          : input.activityCategory === "swim" && input.effortType === "speed"
            ? ACTIVITY_EFFORT_HARD_BOUNDS.swimSpeedMetersPerSecond
            : null;
  if (
    !valueBounds ||
    !Number.isFinite(input.value) ||
    input.value < valueBounds.min ||
    input.value > valueBounds.max
  ) {
    reasons.push("value-outside-hard-bounds");
  }

  if (reasons.length > 0) {
    return { classification: "hard-invalid", reasons, heuristicCeiling: null };
  }

  let heuristicCeiling: number;
  if (input.activityCategory === "bike") {
    const band = bandForDuration(BIKE_POWER_PLAUSIBILITY_BANDS, input.durationSeconds);
    const ceilings: number[] = [band.maxValue];
    const ftp = input.context?.ftpWatts;
    const weight = input.context?.weightKilograms;
    if (ftp != null && Number.isFinite(ftp) && ftp > 0) ceilings.push(ftp * band.maxFtpMultiple);
    if (weight != null && Number.isFinite(weight) && weight > 0) {
      ceilings.push(weight * band.maxWattsPerKilogram);
    }
    heuristicCeiling = Math.min(...ceilings);
  } else if (input.activityCategory === "run") {
    heuristicCeiling = bandForDuration(
      RUN_SPEED_PLAUSIBILITY_BANDS,
      input.durationSeconds,
    ).maxValue;
  } else {
    heuristicCeiling = bandForDuration(
      SWIM_SPEED_PLAUSIBILITY_BANDS,
      input.durationSeconds,
    ).maxValue;
  }

  if (input.value > heuristicCeiling) {
    return {
      classification: "quarantinable-implausible",
      reasons: ["value-exceeds-duration-aware-ceiling"],
      heuristicCeiling,
    };
  }

  return { classification: "plausible", reasons: [], heuristicCeiling };
}
