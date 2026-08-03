import type { ActivityCalibrationQuality } from "../activity-analysis/calibration-quality";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadMethod,
  type CommonLoadResult,
  type CommonThresholdEvidence,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  commonThresholdEvidenceSchema,
} from "../load/common-relative-load";
import {
  calculateHeartRateZoneStress,
  type HeartRateCommonLoadCalculationResult,
} from "../load/heart-rate-zone-stress";
import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { HeartRateDurationEvidence } from "../zones/heart-rate-duration";
import type { RecordingMetricsActivityCategory } from "./contracts";

export type ProvisionalCommonLoadMethod = CommonLoadMethod;

export interface ProvisionalCommonLoadInput {
  activityCategory: RecordingMetricsActivityCategory;
  performanceTargets: AthletePerformanceTargetFacts | null;
  computedAsOf: string;
  eligibleDurationSeconds: number;
  recordingSessionId: string | null;
  preferredMethods?: readonly ProvisionalCommonLoadMethod[];
  power: {
    normalizedWatts: number | null;
    contributingDurationSeconds: number;
  };
  heartRate: {
    evidence: HeartRateDurationEvidence;
  };
  run: {
    normalizedGradeAdjustedSpeedMps: number | null;
    contributingDurationSeconds: number;
  };
  swim: {
    distanceMeters: number;
    contributingDurationSeconds: number;
  };
}

type CalibrationUnavailableReason =
  | "threshold_missing"
  | "stale_threshold"
  | "evidence_truncated"
  | "invalid_data";

interface CompleteProvenance {
  quality: ActivityCalibrationQuality;
  thresholdEvidence: CommonThresholdEvidence;
  evidenceFingerprint: string;
  computedAsOf: string;
}

type ResolvedPerformanceTarget =
  | {
      status: "eligible";
      normalizedThreshold: number;
      provenance: CompleteProvenance;
    }
  | { status: "unavailable"; reason: CalibrationUnavailableReason };

interface MethodCandidate {
  method: ProvisionalCommonLoadMethod;
  performanceTarget: ResolvedPerformanceTarget;
  contributingDurationSeconds: number;
  normalizedIntensity: number | null;
  evidenceFailure: Extract<HeartRateCommonLoadCalculationResult, { status: "unavailable" }> | null;
}

const DEFAULT_METHOD_PRIORITY: Record<
  RecordingMetricsActivityCategory,
  readonly ProvisionalCommonLoadMethod[]
> = {
  bike: ["power_threshold", "heart_rate_zones"],
  run: ["run_pace_threshold", "heart_rate_zones"],
  swim: ["swim_pace_threshold", "heart_rate_zones"],
  strength: [],
  other: [],
};

const ALLOWED_METHODS: Record<
  RecordingMetricsActivityCategory,
  readonly ProvisionalCommonLoadMethod[]
> = DEFAULT_METHOD_PRIORITY;

type SelectedPerformanceFact = {
  status: "available" | "partial" | "unavailable";
  value: number | null;
  calculationVersion: string | null;
  sourceEvidenceIds: string[];
  confidence: "high" | "medium" | "low" | "unavailable";
  reasons: string[];
  source: ActivityCalibrationQuality["source"];
  observedAt: string | null;
  computedAt: string;
};

function unavailableReasonForFact(fact: SelectedPerformanceFact): CalibrationUnavailableReason {
  if (fact.reasons.some((reason) => reason.includes("truncated"))) return "evidence_truncated";
  if (fact.reasons.some((reason) => reason.includes("stale"))) return "stale_threshold";
  return fact.status === "available" ? "invalid_data" : "threshold_missing";
}

function buildThresholdEvidence(input: {
  performanceTargets: AthletePerformanceTargetFacts;
  fact: SelectedPerformanceFact;
  method: ProvisionalCommonLoadMethod;
  normalizedThreshold: number;
}): CommonThresholdEvidence {
  const base = {
    value: input.normalizedThreshold,
    source: input.fact.source,
    observedAt: input.fact.observedAt,
    validAt: input.fact.computedAt,
    freshness: "current",
    calculationVersion: input.fact.calculationVersion,
    sourceFingerprint: input.fact.sourceEvidenceIds.join(":"),
  };

  switch (input.method) {
    case "power_threshold":
      return commonThresholdEvidenceSchema.parse({
        ...base,
        type: "ftp_watts",
        unit: "watts",
      });
    case "run_pace_threshold":
      return commonThresholdEvidenceSchema.parse({
        ...base,
        type: "threshold_speed_mps",
        unit: "meters_per_second",
      });
    case "swim_pace_threshold":
      return commonThresholdEvidenceSchema.parse({
        ...base,
        type: "swim_threshold_speed_mps",
        unit: "meters_per_second",
      });
    case "heart_rate_zones":
      return commonThresholdEvidenceSchema.parse({
        ...base,
        type: "lthr_bpm",
        unit: "beats_per_minute",
      });
  }
}

function buildProvenance(input: {
  performanceTargets: AthletePerformanceTargetFacts;
  computedAsOf: string;
  fact: SelectedPerformanceFact;
  method: ProvisionalCommonLoadMethod;
  normalizedThreshold: number;
  recordingSessionId: string | null;
}): CompleteProvenance | null {
  if (
    input.fact.observedAt === null ||
    input.fact.calculationVersion === null ||
    input.fact.sourceEvidenceIds.length === 0
  ) {
    return null;
  }
  const thresholdEvidence = buildThresholdEvidence(input);
  const evidenceFingerprint = input.fact.sourceEvidenceIds.join(":");
  return {
    quality: {
      source: input.fact.source,
      observed_at: input.fact.observedAt,
      valid_at: input.fact.computedAt,
      confidence: input.fact.confidence === "unavailable" ? "unknown" : input.fact.confidence,
      stale: false,
      estimate: input.fact.source === "estimated" || input.fact.source === "modeled",
      calculation_version: input.fact.calculationVersion,
      evidence_fingerprint: evidenceFingerprint,
    },
    thresholdEvidence,
    evidenceFingerprint: [
      "recording-runtime",
      input.recordingSessionId ?? "unbound-session",
      input.method,
      evidenceFingerprint,
    ].join(":"),
    computedAsOf: input.computedAsOf,
  };
}

function factForMethod(
  performanceTargets: AthletePerformanceTargetFacts,
  activityCategory: RecordingMetricsActivityCategory,
  method: ProvisionalCommonLoadMethod,
): SelectedPerformanceFact {
  const targetFact = (
    fact:
      | AthletePerformanceTargetFacts["cycling"]["planningThresholdPower"]
      | AthletePerformanceTargetFacts["running"]["planningThresholdPace"]
      | AthletePerformanceTargetFacts["swimming"]["css"],
  ): SelectedPerformanceFact => ({
    status: fact.status,
    value: fact.value,
    calculationVersion: fact.calculationVersion,
    sourceEvidenceIds: fact.sourceEvidenceIds,
    confidence: fact.confidence,
    reasons: fact.reasons,
    source: fact.status === "available" ? "modeled" : "unknown",
    observedAt: fact.status === "available" ? fact.evidenceTime.observedThrough : null,
    computedAt: fact.evidenceTime.computedAt,
  });
  switch (method) {
    case "power_threshold":
      return targetFact(performanceTargets.cycling.planningThresholdPower);
    case "run_pace_threshold":
      return targetFact(performanceTargets.running.planningThresholdPace);
    case "swim_pace_threshold":
      return targetFact(performanceTargets.swimming.css);
    case "heart_rate_zones": {
      const category =
        activityCategory === "bike" || activityCategory === "run" || activityCategory === "swim"
          ? activityCategory
          : "run";
      const fact = performanceTargets.heartRate[category].lthr;
      return {
        status: fact.status,
        value: fact.valueBpm,
        calculationVersion: fact.calculationVersion,
        sourceEvidenceIds: fact.sourceEvidenceId === null ? [] : [fact.sourceEvidenceId],
        confidence: fact.status === "available" ? "high" : "unavailable",
        reasons: fact.reason === null ? [] : [fact.reason],
        source: fact.status === "available" ? "observed_effort" : "unknown",
        observedAt: fact.observedAt,
        computedAt: performanceTargets.asOf,
      };
    }
  }
}

function normalizeThreshold(method: ProvisionalCommonLoadMethod, value: number): number | null {
  const normalized =
    method === "run_pace_threshold"
      ? 1000 / value
      : method === "swim_pace_threshold"
        ? 100 / value
        : value;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function resolvePerformanceTarget(
  input: ProvisionalCommonLoadInput,
  method: ProvisionalCommonLoadMethod,
): ResolvedPerformanceTarget {
  const performanceTargets = input.performanceTargets;
  if (performanceTargets === null) return { status: "unavailable", reason: "threshold_missing" };
  const fact = factForMethod(performanceTargets, input.activityCategory, method);
  if (fact.status !== "available" || fact.value === null) {
    return { status: "unavailable", reason: unavailableReasonForFact(fact) };
  }
  const normalizedThreshold = normalizeThreshold(method, fact.value);
  if (normalizedThreshold === null) return { status: "unavailable", reason: "invalid_data" };
  const provenance = buildProvenance({
    performanceTargets,
    computedAsOf: input.computedAsOf,
    fact,
    method,
    normalizedThreshold,
    recordingSessionId: input.recordingSessionId,
  });
  return provenance === null
    ? { status: "unavailable", reason: "invalid_data" }
    : { status: "eligible", normalizedThreshold, provenance };
}

function candidateForMethod(
  input: ProvisionalCommonLoadInput,
  method: ProvisionalCommonLoadMethod,
): MethodCandidate {
  const performanceTarget = resolvePerformanceTarget(input, method);
  if (performanceTarget.status === "unavailable") {
    return {
      method,
      performanceTarget,
      contributingDurationSeconds: 0,
      normalizedIntensity: null,
      evidenceFailure: null,
    };
  }

  switch (method) {
    case "power_threshold":
      return {
        method,
        performanceTarget,
        contributingDurationSeconds: input.power.contributingDurationSeconds,
        normalizedIntensity:
          input.power.normalizedWatts === null
            ? null
            : input.power.normalizedWatts / performanceTarget.normalizedThreshold,
        evidenceFailure: null,
      };
    case "run_pace_threshold":
      return {
        method,
        performanceTarget,
        contributingDurationSeconds: input.run.contributingDurationSeconds,
        normalizedIntensity:
          input.run.normalizedGradeAdjustedSpeedMps === null
            ? null
            : input.run.normalizedGradeAdjustedSpeedMps / performanceTarget.normalizedThreshold,
        evidenceFailure: null,
      };
    case "swim_pace_threshold": {
      const contributingDurationSeconds = input.swim.contributingDurationSeconds;
      const speed =
        contributingDurationSeconds > 0
          ? input.swim.distanceMeters / contributingDurationSeconds
          : null;
      return {
        method,
        performanceTarget,
        contributingDurationSeconds,
        normalizedIntensity:
          speed === null || !Number.isFinite(speed)
            ? null
            : speed / performanceTarget.normalizedThreshold,
        evidenceFailure: null,
      };
    }
    case "heart_rate_zones": {
      const zoneLoad = calculateHeartRateZoneStress({
        durationSeconds: input.eligibleDurationSeconds,
        lthrBpm: performanceTarget.normalizedThreshold,
        distribution: input.heartRate.evidence,
      });
      return {
        method,
        performanceTarget,
        contributingDurationSeconds: zoneLoad.contributingDurationSeconds,
        normalizedIntensity:
          zoneLoad.status === "unavailable" ? null : zoneLoad.rawEquivalentIntensityFactor,
        evidenceFailure: zoneLoad.status === "unavailable" ? zoneLoad : null,
      };
    }
  }
}

function unavailableCommonLoad(input: {
  activityCategory: RecordingMetricsActivityCategory;
  computedAsOf: string;
  contributingDurationSeconds?: number | null;
  eligibleDurationSeconds?: number | null;
  sourceTimeCoverage?: number | null;
  method?: ProvisionalCommonLoadMethod | null;
  provenance?: CompleteProvenance | null;
  reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"];
}): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: input.activityCategory,
    method: input.method ?? null,
    quality: input.provenance?.quality ?? null,
    thresholdEvidence: input.provenance?.thresholdEvidence ?? null,
    evidenceFingerprint: input.provenance?.evidenceFingerprint ?? null,
    computedAsOf: input.computedAsOf,
    contributingDurationSeconds: input.contributingDurationSeconds ?? null,
    ...(input.eligibleDurationSeconds === undefined
      ? {}
      : { eligibleDurationSeconds: input.eligibleDurationSeconds }),
    ...(input.sourceTimeCoverage === undefined
      ? {}
      : { sourceTimeCoverage: input.sourceTimeCoverage }),
    reason: input.reason,
  });
}

function partialWithoutNumericResult(
  input: ProvisionalCommonLoadInput,
  candidate: MethodCandidate & {
    performanceTarget: Extract<ResolvedPerformanceTarget, { status: "eligible" }>;
  },
): CommonLoadResult {
  const contributingDurationSeconds = Math.max(0, candidate.contributingDurationSeconds);
  const sourceTimeCoverage = contributingDurationSeconds / input.eligibleDurationSeconds;
  return commonLoadResultSchema.parse({
    status: "partial",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: input.activityCategory,
    method: candidate.method,
    quality: candidate.performanceTarget.provenance.quality,
    thresholdEvidence: candidate.performanceTarget.provenance.thresholdEvidence,
    evidenceFingerprint: candidate.performanceTarget.provenance.evidenceFingerprint,
    computedAsOf: input.computedAsOf,
    load: null,
    intensity: null,
    contributingDurationSeconds,
    eligibleDurationSeconds: input.eligibleDurationSeconds,
    sourceTimeCoverage,
    reason: "activity_data_partial",
  });
}

function partialNumericResult(
  input: ProvisionalCommonLoadInput,
  candidate: MethodCandidate & {
    performanceTarget: Extract<ResolvedPerformanceTarget, { status: "eligible" }>;
    normalizedIntensity: number;
  },
): CommonLoadResult {
  const contributingDurationSeconds = candidate.contributingDurationSeconds;
  const sourceTimeCoverage = contributingDurationSeconds / input.eligibleDurationSeconds;
  if (
    !Number.isFinite(candidate.normalizedIntensity) ||
    candidate.normalizedIntensity < 0 ||
    candidate.normalizedIntensity > 1.5
  ) {
    return unavailableCommonLoad({
      activityCategory: input.activityCategory,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds,
      method: candidate.method,
      provenance: candidate.performanceTarget.provenance,
      reason: "intensity_out_of_range",
    });
  }
  const calculated = calculateAvailableCommonLoad({
    activity_category: input.activityCategory,
    method: candidate.method,
    intensity: candidate.normalizedIntensity,
    contributingDurationSeconds,
    ...candidate.performanceTarget.provenance,
    estimated: candidate.performanceTarget.provenance.quality.estimate,
  });
  if (calculated.status !== "available") {
    return unavailableCommonLoad({
      activityCategory: input.activityCategory,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds,
      reason: "invalid_data",
    });
  }
  const { estimated: _estimated, status: _status, ...retained } = calculated;
  return commonLoadResultSchema.parse({
    status: "partial",
    ...retained,
    eligibleDurationSeconds: input.eligibleDurationSeconds,
    sourceTimeCoverage,
    reason: sourceTimeCoverage >= 0.8 ? "duration_partial" : "activity_data_partial",
  });
}

function isEligibleCandidate(candidate: MethodCandidate): candidate is MethodCandidate & {
  performanceTarget: Extract<ResolvedPerformanceTarget, { status: "eligible" }>;
} {
  return candidate.performanceTarget.status === "eligible";
}

function hasNumericResult(
  candidate: MethodCandidate & {
    performanceTarget: Extract<ResolvedPerformanceTarget, { status: "eligible" }>;
  },
): candidate is MethodCandidate & {
  performanceTarget: Extract<ResolvedPerformanceTarget, { status: "eligible" }>;
  normalizedIntensity: number;
} {
  return candidate.normalizedIntensity !== null && candidate.contributingDurationSeconds > 0;
}

export function calculateProvisionalCommonLoad(
  input: ProvisionalCommonLoadInput,
): CommonLoadResult {
  if (!Number.isFinite(input.eligibleDurationSeconds) || input.eligibleDurationSeconds <= 0) {
    return unavailableCommonLoad({
      activityCategory: input.activityCategory,
      computedAsOf: input.computedAsOf,
      reason: "duration_missing",
    });
  }
  const allowed = ALLOWED_METHODS[input.activityCategory];
  const configured = input.preferredMethods ?? DEFAULT_METHOD_PRIORITY[input.activityCategory];
  const methods = Array.from(
    new Set(
      configured.filter((method) => allowed.some((allowedMethod) => allowedMethod === method)),
    ),
  );
  if (methods.length === 0) {
    return unavailableCommonLoad({
      activityCategory: input.activityCategory,
      computedAsOf: input.computedAsOf,
      contributingDurationSeconds: input.eligibleDurationSeconds,
      reason: "unsupported_modality",
    });
  }

  const candidates = methods.map((method) => candidateForMethod(input, method));
  const eligibleCandidates = candidates.filter(isEligibleCandidate);
  const numericCandidates = eligibleCandidates.filter(hasNumericResult);
  const sufficientlyCovered = numericCandidates.find(
    (candidate) => candidate.contributingDurationSeconds / input.eligibleDurationSeconds >= 0.8,
  );
  const numeric = sufficientlyCovered ?? numericCandidates[0];
  if (numeric) return partialNumericResult(input, numeric);

  const resolved = eligibleCandidates[0];
  if (resolved) {
    if (resolved.evidenceFailure !== null) {
      const failure = resolved.evidenceFailure;
      const reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"] =
        failure.reason === "insufficient_coverage"
          ? "insufficient_coverage"
          : failure.reason === "activity_data_missing"
            ? "activity_data_missing"
            : failure.reason === "intensity_out_of_range"
              ? "intensity_out_of_range"
              : "invalid_data";
      return unavailableCommonLoad({
        activityCategory: input.activityCategory,
        computedAsOf: input.computedAsOf,
        contributingDurationSeconds:
          failure.contributingDurationSeconds > 0 ? failure.contributingDurationSeconds : null,
        ...(reason === "insufficient_coverage"
          ? {
              eligibleDurationSeconds: failure.eligibleDurationSeconds,
              sourceTimeCoverage: failure.coverageRatio,
            }
          : {}),
        method: resolved.method,
        provenance: resolved.performanceTarget.provenance,
        reason,
      });
    }
    if (resolved.contributingDurationSeconds > input.eligibleDurationSeconds) {
      return unavailableCommonLoad({
        activityCategory: input.activityCategory,
        computedAsOf: input.computedAsOf,
        contributingDurationSeconds: input.eligibleDurationSeconds,
        reason: "invalid_data",
      });
    }
    return partialWithoutNumericResult(input, resolved);
  }

  const first = candidates[0];
  if (!first || first.performanceTarget.status !== "unavailable") {
    return unavailableCommonLoad({
      activityCategory: input.activityCategory,
      computedAsOf: input.computedAsOf,
      reason: "invalid_data",
    });
  }
  return unavailableCommonLoad({
    activityCategory: input.activityCategory,
    computedAsOf: input.computedAsOf,
    contributingDurationSeconds: input.eligibleDurationSeconds,
    method: first.performanceTarget.reason === "threshold_missing" ? first.method : null,
    reason: first.performanceTarget.reason,
  });
}
