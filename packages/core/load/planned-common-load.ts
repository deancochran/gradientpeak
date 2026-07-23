import type { ActivityCalibrationQuality } from "../activity-analysis/calibration-quality";
import type { CanonicalSport } from "../schemas/sport";
import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  type CommonLoadMethod,
  type CommonLoadResult,
  type CommonThresholdEvidence,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
} from "./common-relative-load";

export type PlannedCommonLoadTarget =
  | { type: "percent_threshold"; value: number }
  | { type: "power_watts"; value: number }
  | { type: "speed_mps"; value: number };

export type PlannedCommonLoadDose = {
  sport: CanonicalSport;
  durationSeconds: number | null;
  target: PlannedCommonLoadTarget | null;
  method: CommonLoadMethod | null;
  quality: ActivityCalibrationQuality | null;
  thresholdEvidence: CommonThresholdEvidence | null;
  evidenceFingerprint: string | null;
};

export type PlannedCommonLoadEnvelope = {
  doses: CommonLoadResult[];
  aggregate: CommonLoadAggregate;
};

function unavailable(
  dose: PlannedCommonLoadDose,
  computedAsOf: string,
  reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"],
): CommonLoadResult {
  const completeProvenance =
    dose.method !== null &&
    dose.quality !== null &&
    dose.thresholdEvidence !== null &&
    dose.evidenceFingerprint !== null;
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: dose.sport,
    method: completeProvenance ? dose.method : reason === "threshold_missing" ? dose.method : null,
    quality: completeProvenance ? dose.quality : null,
    thresholdEvidence: completeProvenance ? dose.thresholdEvidence : null,
    evidenceFingerprint: completeProvenance ? dose.evidenceFingerprint : null,
    computedAsOf,
    contributingDurationSeconds:
      dose.durationSeconds !== null &&
      Number.isFinite(dose.durationSeconds) &&
      dose.durationSeconds > 0
        ? dose.durationSeconds
        : null,
    reason,
  });
}

function intensityForDose(dose: PlannedCommonLoadDose): number | null {
  if (dose.target === null || dose.thresholdEvidence === null || dose.method === null) return null;
  if (dose.target.type === "percent_threshold") return dose.target.value;
  if (dose.target.type === "power_watts") {
    return dose.thresholdEvidence.unit === "watts"
      ? dose.target.value / dose.thresholdEvidence.value
      : null;
  }
  return dose.thresholdEvidence.unit === "meters_per_second"
    ? dose.target.value / dose.thresholdEvidence.value
    : null;
}

/**
 * Converts exact timed prescription doses into the common model without reading legacy TSS/IF.
 * Callers must include every active dose; unsupported, untimed, or unevidenced doses remain explicit.
 */
export function adaptPlannedCommonLoadDoses(input: {
  computedAsOf: string;
  doses: readonly PlannedCommonLoadDose[];
}): PlannedCommonLoadEnvelope {
  const doses = input.doses.map((dose): CommonLoadResult => {
    if (dose.sport !== "bike" && dose.sport !== "run" && dose.sport !== "swim") {
      return unavailable(dose, input.computedAsOf, "unsupported_modality");
    }
    if (
      dose.durationSeconds === null ||
      !Number.isFinite(dose.durationSeconds) ||
      dose.durationSeconds <= 0
    ) {
      return unavailable(dose, input.computedAsOf, "duration_missing");
    }
    if (dose.method === null || dose.thresholdEvidence === null) {
      return unavailable(dose, input.computedAsOf, "threshold_missing");
    }
    if (dose.target === null) return unavailable(dose, input.computedAsOf, "activity_data_missing");
    if (
      dose.quality === null ||
      dose.evidenceFingerprint === null ||
      dose.thresholdEvidence.freshness === "stale" ||
      dose.quality.stale
    ) {
      return unavailable(
        dose,
        input.computedAsOf,
        dose.thresholdEvidence.freshness === "stale" || dose.quality?.stale
          ? "stale_threshold"
          : "invalid_data",
      );
    }
    const intensity = intensityForDose(dose);
    if (intensity === null || !Number.isFinite(intensity)) {
      return unavailable(dose, input.computedAsOf, "invalid_data");
    }
    if (intensity < 0 || intensity > 1.5) {
      return unavailable(dose, input.computedAsOf, "intensity_out_of_range");
    }
    return calculateAvailableCommonLoad({
      sport: dose.sport,
      method: dose.method,
      quality: dose.quality,
      thresholdEvidence: dose.thresholdEvidence,
      evidenceFingerprint: dose.evidenceFingerprint,
      computedAsOf: input.computedAsOf,
      estimated: true,
      contributingDurationSeconds: dose.durationSeconds,
      intensity,
    });
  });
  return { doses, aggregate: aggregateCommonLoad(doses) };
}
