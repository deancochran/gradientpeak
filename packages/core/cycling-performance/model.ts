import { BEST_EFFORT_CALCULATION_VERSION } from "../calculations/best-efforts";
import {
  buildDurationPerformanceEvidenceSummary,
  type CanonicalCyclingDurationEffortEvidence,
  buildDurationPerformanceCoverage as coverage,
  createDurationPerformanceCalculationIdentity,
  durationPerformanceCurveConfidence as curveConfidence,
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  durationPerformanceEvidenceExpiry as evidenceExpiryAt,
  fitInverseDurationModel,
  type InverseDurationFitFailure,
  isMonotonicDurationCurve as isMonotonicCurve,
  lowestDurationPerformanceConfidence as lowestAvailableConfidence,
  durationPerformancePointConfidence as pointConfidence,
  selectCanonicalDurationEvidence,
  durationPerformanceSourceEvidenceIds as sourceEvidenceIds,
} from "../duration-performance";
import {
  CYCLING_CAPABILITY_PROFILE_VERSION,
  CYCLING_CRITICAL_POWER_CALCULATION_VERSION,
  CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
  CYCLING_DURATION_PERFORMANCE_MODEL_VERSION,
  CYCLING_DURATION_PERFORMANCE_POLICY,
  CYCLING_DURATION_RETENTION_CALCULATION_VERSION,
  CYCLING_FIVE_SECOND_POWER_CALCULATION_VERSION,
  CYCLING_MMP_CURVE_CALCULATION_VERSION,
  CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
  CYCLING_PERFORMANCE_EVIDENCE_POLICY_VERSION,
  CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION,
  CYCLING_RESERVE_CALCULATION_VERSION,
  CYCLING_TRAINING_LEVELS_VERSION,
  type CyclingDurationPerformanceInput,
  type CyclingDurationPerformanceModel,
  type CyclingPerformanceReason,
  cyclingDurationPerformanceInputSchema,
  cyclingDurationPerformanceModelSchema,
} from "./contracts";

const RECALCULATION_TRIGGERS = [
  "new_canonical_best_effort",
  "source_evidence_corrected",
  "source_evidence_expired",
  "calculation_policy_changed",
];

const CRITICAL_POWER_DURATION_BANDS = [
  { minimumDurationSeconds: 180, maximumDurationSeconds: 360, minimumPointCount: 1 },
  { minimumDurationSeconds: 361, maximumDurationSeconds: 900, minimumPointCount: 1 },
  { minimumDurationSeconds: 901, maximumDurationSeconds: 1_800, minimumPointCount: 1 },
];

interface BuiltOutcomeMetadata {
  calculationVersion: string;
  sourceEvidenceIds: string[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: DurationPerformanceConfidence;
  expiresAt: string | null;
  recalculationTriggers: string[];
}

type BuiltOutcome<T> =
  | (BuiltOutcomeMetadata & {
      status: "available";
      value: T;
      reasons: CyclingPerformanceReason[];
    })
  | (BuiltOutcomeMetadata & {
      status: "partial";
      value: T;
      reasons: CyclingPerformanceReason[];
    })
  | (BuiltOutcomeMetadata & {
      status: "unavailable";
      value: null;
      reasons: CyclingPerformanceReason[];
    });

interface CriticalPowerFitDiagnostics {
  pointCount: number;
  activityCount: number;
  fitMinimumDurationSeconds: number;
  fitMaximumDurationSeconds: number;
  rSquared: number;
  rmseWatts: number;
  normalizedRmse: number;
  maximumAbsoluteResidualWatts: number;
  maximumCpRemovalChangeRatio: number;
  maximumReserveRemovalChangeRatio: number;
}

interface AcceptedCriticalPowerFit {
  status: "accepted";
  criticalPowerWatts: number;
  reserveJoules: number;
  diagnostics: CriticalPowerFitDiagnostics;
}

interface UnavailableCriticalPowerFit {
  status: "unavailable";
  reason: CyclingPerformanceReason;
}

type CriticalPowerFit = AcceptedCriticalPowerFit | UnavailableCriticalPowerFit;

interface SelectedEvidence {
  eligible: CanonicalCyclingDurationEffortEvidence[];
  selected: CanonicalCyclingDurationEffortEvidence[];
  excluded: Array<{
    evidenceId: string;
    reason:
      | "future_observation"
      | "outside_freshness_window"
      | "partial_source_coverage_below_minimum"
      | "duration_value_plausibility_review_required";
  }>;
  supersededEvidenceIds: string[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function metadata(input: {
  calculationVersion: string;
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: DurationPerformanceConfidence;
}): BuiltOutcomeMetadata {
  return {
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: sourceEvidenceIds(input.points),
    evidenceCoverage: input.evidenceCoverage,
    confidence: input.confidence,
    expiresAt: evidenceExpiryAt(
      input.points,
      CYCLING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    ),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function availableOutcome<T>(input: {
  calculationVersion: string;
  value: T;
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: Exclude<DurationPerformanceConfidence, "unavailable">;
}): BuiltOutcome<T> {
  return {
    status: "available",
    value: input.value,
    reasons: [],
    ...metadata(input),
  };
}

function partialOutcome<T>(input: {
  calculationVersion: string;
  value: T;
  reasons: CyclingPerformanceReason[];
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: Exclude<DurationPerformanceConfidence, "unavailable">;
}): BuiltOutcome<T> {
  return {
    status: "partial",
    value: input.value,
    reasons: input.reasons,
    ...metadata(input),
  };
}

function unavailableOutcome(input: {
  calculationVersion: string;
  reason: CyclingPerformanceReason;
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
}): BuiltOutcome<never> {
  return {
    status: "unavailable",
    value: null,
    reasons: [input.reason],
    ...metadata({ ...input, confidence: "unavailable" }),
  };
}

function outcomeForCoverage<T>(input: {
  calculationVersion: string;
  value: T;
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  availableConfidence: Exclude<DurationPerformanceConfidence, "unavailable">;
  partialReasons: CyclingPerformanceReason[];
}): BuiltOutcome<T> {
  if (input.evidenceCoverage.state === "complete") {
    return availableOutcome({
      calculationVersion: input.calculationVersion,
      value: input.value,
      points: input.points,
      evidenceCoverage: input.evidenceCoverage,
      confidence: input.availableConfidence,
    });
  }
  return partialOutcome({
    calculationVersion: input.calculationVersion,
    value: input.value,
    reasons: input.partialReasons,
    points: input.points,
    evidenceCoverage: input.evidenceCoverage,
    confidence: "low",
  });
}

function partialReasons(input: {
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  missingRequirementReason: CyclingPerformanceReason;
}): CyclingPerformanceReason[] {
  const reasons: CyclingPerformanceReason[] = [];
  const observedDurations = new Set(input.evidenceCoverage.observedDurationsSeconds);
  const hasMissingExactDuration = input.evidenceCoverage.requiredExactDurationsSeconds.some(
    (duration) => !observedDurations.has(duration),
  );
  const hasMissingDurationBand = input.evidenceCoverage.requiredDurationBands.some(
    (band) =>
      input.evidenceCoverage.observedDurationsSeconds.filter(
        (duration) =>
          duration >= band.minimumDurationSeconds && duration <= band.maximumDurationSeconds,
      ).length < band.minimumPointCount,
  );
  if (input.evidenceCoverage.partialSourcePointCount > 0) {
    reasons.push("partial_source_evidence");
  }
  if (
    hasMissingExactDuration ||
    hasMissingDurationBand ||
    input.evidenceCoverage.selectedPointCount < input.evidenceCoverage.minimumDistinctDurations ||
    input.evidenceCoverage.distinctActivityCount < input.evidenceCoverage.minimumDistinctActivities
  ) {
    reasons.push(input.missingRequirementReason);
  }
  return [...new Set(reasons)];
}

function selectCanonicalEvidence(input: CyclingDurationPerformanceInput): SelectedEvidence {
  return selectCanonicalDurationEvidence({
    efforts: input.efforts,
    assessmentAsOf: input.assessmentAsOf,
    freshnessWindowDays: CYCLING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    minimumPartialSourceTimeCoverage:
      CYCLING_DURATION_PERFORMANCE_POLICY.minimumPartialSourceTimeCoverage,
  });
}

function pointAt(
  points: readonly CanonicalCyclingDurationEffortEvidence[],
  durationSeconds: number,
): CanonicalCyclingDurationEffortEvidence | null {
  return points.find((point) => point.durationSeconds === durationSeconds) ?? null;
}

function pointsForIds(
  points: readonly CanonicalCyclingDurationEffortEvidence[],
  ids: readonly string[],
): CanonicalCyclingDurationEffortEvidence[] {
  const wanted = new Set(ids);
  return points.filter((point) => wanted.has(point.evidenceId));
}

function criticalPowerReason(reason: InverseDurationFitFailure): CyclingPerformanceReason {
  switch (reason) {
    case "insufficient_points":
      return "critical_power_insufficient_points";
    case "missing_duration_band":
      return "critical_power_missing_duration_band";
    case "insufficient_independent_activities":
      return "critical_power_insufficient_independent_activities";
    case "degenerate_fit":
      return "critical_power_degenerate_fit";
    case "parameters_out_of_bounds":
      return "critical_power_parameters_out_of_bounds";
    case "poor_fit":
      return "critical_power_poor_fit";
    case "unstable_fit":
      return "critical_power_unstable_fit";
  }
}

function evaluateCriticalPowerFit(
  points: readonly CanonicalCyclingDurationEffortEvidence[],
): CriticalPowerFit {
  const bounds = CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerBounds;
  const fit = fitInverseDurationModel({
    points,
    minimumPoints: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumPoints,
    minimumActivities: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumActivities,
    requiredDurationBands: CRITICAL_POWER_DURATION_BANDS,
    interceptBounds: { minimum: bounds.minimumWatts, maximum: bounds.maximumWatts },
    reserveBounds: {
      minimum: bounds.minimumReserveJoules,
      maximum: bounds.maximumReserveJoules,
    },
    minimumRSquared: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumRSquared,
    maximumNormalizedRmse: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMaximumNormalizedRmse,
    maximumInterceptRemovalChangeRatio:
      CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMaximumCpChangeRatio,
    maximumReserveRemovalChangeRatio:
      CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMaximumReserveChangeRatio,
  });
  if (fit.status === "unavailable") {
    return { status: "unavailable", reason: criticalPowerReason(fit.reason) };
  }
  return {
    status: "accepted",
    criticalPowerWatts: fit.intercept,
    reserveJoules: fit.reserve,
    diagnostics: {
      pointCount: fit.diagnostics.pointCount,
      activityCount: fit.diagnostics.activityCount,
      fitMinimumDurationSeconds: fit.diagnostics.fitMinimumDurationSeconds,
      fitMaximumDurationSeconds: fit.diagnostics.fitMaximumDurationSeconds,
      rSquared: fit.diagnostics.rSquared,
      rmseWatts: fit.diagnostics.rmse,
      normalizedRmse: fit.diagnostics.normalizedRmse,
      maximumAbsoluteResidualWatts: fit.diagnostics.maximumAbsoluteResidual,
      maximumCpRemovalChangeRatio: fit.diagnostics.maximumInterceptRemovalChangeRatio,
      maximumReserveRemovalChangeRatio: fit.diagnostics.maximumReserveRemovalChangeRatio,
    },
  };
}

function fitConfidence(
  fit: AcceptedCriticalPowerFit,
): Exclude<DurationPerformanceConfidence, "unavailable"> {
  if (fit.diagnostics.rSquared >= 0.99 && fit.diagnostics.activityCount >= 3) return "high";
  return "medium";
}

function unavailableTrainingLevel(input: {
  levelId:
    | "sprint_capacity"
    | "reserve_capacity"
    | "threshold_capacity"
    | "long_duration_capacity"
    | "duration_retention_capacity"
    | "repeated_effort_recovery";
  targetCapability:
    | "short_duration_capacity"
    | "anaerobic_reserve"
    | "threshold_capacity"
    | "long_duration_capacity"
    | "duration_retention"
    | "repeated_effort_recovery";
  reason: CyclingPerformanceReason;
  points: readonly CanonicalCyclingDurationEffortEvidence[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
}) {
  return {
    status: "unavailable",
    levelId: input.levelId,
    targetCapability: input.targetCapability,
    prescription: null,
    reasons: [input.reason],
    calculationVersion: CYCLING_TRAINING_LEVELS_VERSION,
    sourceEvidenceIds: sourceEvidenceIds(input.points),
    evidenceCoverage: input.evidenceCoverage,
    confidence: "unavailable",
    expiresAt: evidenceExpiryAt(input.points),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function calculationIdentity(
  assessmentAsOf: string,
  athleteId: string,
  points: readonly CanonicalCyclingDurationEffortEvidence[],
) {
  return createDurationPerformanceCalculationIdentity({
    modelVersion: CYCLING_DURATION_PERFORMANCE_MODEL_VERSION,
    inputContractVersion: CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
    evidencePolicyVersion: CYCLING_PERFORMANCE_EVIDENCE_POLICY_VERSION,
    assessmentAsOf,
    athleteId,
    activityCategory: "bike",
    modelVariant: "cycling_power",
    sourceCalculationVersions: [BEST_EFFORT_CALCULATION_VERSION],
    evidence: points.map((point) => ({
      evidenceId: point.evidenceId,
      observationId: point.observationId,
      evidenceRevision: point.evidenceRevision,
      sourceCalculationVersion: point.calculationVersion,
      facts: {
        activityId: point.activityId,
        segmentId: point.segmentId,
        recordedAt: point.recordedAt,
        durationSeconds: point.durationSeconds,
        value: point.value,
        unit: point.unit,
        sourceTimeCoverage: point.provenance.sourceTimeCoverage,
        extractionStatus: point.provenance.extractionStatus,
      },
    })),
  });
}

function globalUnavailableModel(input: {
  parsed: CyclingDurationPerformanceInput;
  evidence: SelectedEvidence;
  reason: CyclingPerformanceReason;
}): CyclingDurationPerformanceModel {
  const readCoverageState = input.parsed.effortReadCoverage.state;
  const curveCoverage = coverage({
    selected: input.evidence.selected,
    eligibleEffortCount: input.evidence.eligible.length,
    readCoverageState,
    requiredExactDurationsSeconds:
      CYCLING_DURATION_PERFORMANCE_POLICY.curveRequiredDurationsSeconds,
    minimumDistinctDurations:
      CYCLING_DURATION_PERFORMANCE_POLICY.curveRequiredDurationsSeconds.length,
    minimumDistinctActivities: 1,
  });
  const unavailable = (calculationVersion: string) =>
    unavailableOutcome({
      calculationVersion,
      reason: input.reason,
      points: input.evidence.selected,
      evidenceCoverage: curveCoverage,
    });
  const repeatedCoverage = coverage({
    selected: [],
    eligibleEffortCount: 0,
    readCoverageState,
    minimumDistinctDurations: 1,
    minimumDistinctActivities: 1,
  });
  const repeatedRecovery = unavailableOutcome({
    calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
    reason: "repeated_effort_recovery_not_supported_by_maximal_efforts",
    points: [],
    evidenceCoverage: repeatedCoverage,
  });
  const trainingTargets = [
    ["sprint_capacity", "short_duration_capacity"],
    ["reserve_capacity", "anaerobic_reserve"],
    ["threshold_capacity", "threshold_capacity"],
    ["long_duration_capacity", "long_duration_capacity"],
    ["duration_retention_capacity", "duration_retention"],
  ];
  const trainingLevels = trainingTargets.map(([levelId, targetCapability]) => ({
    status: "unavailable",
    levelId,
    targetCapability,
    prescription: null,
    reasons: [input.reason],
    calculationVersion: CYCLING_TRAINING_LEVELS_VERSION,
    sourceEvidenceIds: sourceEvidenceIds(input.evidence.selected),
    evidenceCoverage: curveCoverage,
    confidence: "unavailable",
    expiresAt: evidenceExpiryAt(input.evidence.selected),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  }));
  trainingLevels.push(
    unavailableTrainingLevel({
      levelId: "repeated_effort_recovery",
      targetCapability: "repeated_effort_recovery",
      reason: "repeated_effort_recovery_not_supported_by_maximal_efforts",
      points: [],
      evidenceCoverage: repeatedCoverage,
    }),
  );

  return cyclingDurationPerformanceModelSchema.parse({
    contractVersion: CYCLING_DURATION_PERFORMANCE_MODEL_VERSION,
    assessmentAsOf: input.parsed.assessmentAsOf,
    athleteId: input.parsed.athleteId,
    activityCategory: "bike",
    calculationIdentity: calculationIdentity(
      input.parsed.assessmentAsOf,
      input.parsed.athleteId,
      input.evidence.selected,
    ),
    evidenceSummary: buildDurationPerformanceEvidenceSummary(input.evidence),
    maximalMeanPowerCurve: unavailable(CYCLING_MMP_CURVE_CALCULATION_VERSION),
    parameters: {
      fiveSecondPower: unavailable(CYCLING_FIVE_SECOND_POWER_CALCULATION_VERSION),
      criticalPower: unavailable(CYCLING_CRITICAL_POWER_CALCULATION_VERSION),
      anaerobicReserve: unavailable(CYCLING_RESERVE_CALCULATION_VERSION),
      planningThresholdPower: unavailable(CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION),
      modeledTimeToExhaustion: unavailable(CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION),
      durationRetention: unavailable(CYCLING_DURATION_RETENTION_CALCULATION_VERSION),
    },
    capabilityProfile: {
      contractVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
      athleteId: input.parsed.athleteId,
      activityCategory: "bike",
      shortDurationCapacity: unavailable(CYCLING_CAPABILITY_PROFILE_VERSION),
      anaerobicReserve: unavailable(CYCLING_RESERVE_CALCULATION_VERSION),
      thresholdCapacity: unavailable(CYCLING_CAPABILITY_PROFILE_VERSION),
      longDurationCapacity: unavailable(CYCLING_CAPABILITY_PROFILE_VERSION),
      durationRetention: unavailable(CYCLING_DURATION_RETENTION_CALCULATION_VERSION),
      repeatedEffortRecovery: repeatedRecovery,
    },
    trainingLevels,
  });
}

/**
 * Builds an evidence-first cycling duration-performance model from canonical
 * extracted efforts. The function is pure: assessment time, read coverage, and
 * every source identity are caller supplied.
 */
export function calculateCyclingDurationPerformance(
  input: CyclingDurationPerformanceInput,
): CyclingDurationPerformanceModel {
  const parsed = cyclingDurationPerformanceInputSchema.parse(input);
  const evidence = selectCanonicalEvidence(parsed);
  if (parsed.effortReadCoverage.state === "truncated") {
    return globalUnavailableModel({
      parsed,
      evidence,
      reason: "evidence_read_truncated",
    });
  }
  if (evidence.selected.length === 0) {
    return globalUnavailableModel({ parsed, evidence, reason: "no_eligible_efforts" });
  }
  if (!isMonotonicCurve(evidence.selected)) {
    return globalUnavailableModel({
      parsed,
      evidence,
      reason: "non_monotonic_canonical_curve",
    });
  }

  const readCoverageState = parsed.effortReadCoverage.state;
  const curveCoverage = coverage({
    selected: evidence.selected,
    eligibleEffortCount: evidence.eligible.length,
    readCoverageState,
    requiredExactDurationsSeconds:
      CYCLING_DURATION_PERFORMANCE_POLICY.curveRequiredDurationsSeconds,
    minimumDistinctDurations:
      CYCLING_DURATION_PERFORMANCE_POLICY.curveRequiredDurationsSeconds.length,
    minimumDistinctActivities: 1,
  });
  const curveValue = {
    points: evidence.selected.map((point) => ({
      observationId: point.observationId,
      evidenceRevision: point.evidenceRevision,
      durationSeconds: point.durationSeconds,
      powerWatts: point.value,
      sourceEvidenceId: point.evidenceId,
      activityId: point.activityId,
      segmentId: point.segmentId,
      recordedAt: point.recordedAt,
      sourceExtractionStatus: point.provenance.extractionStatus,
      sourceCalculationVersion: point.calculationVersion,
    })),
    selectionPolicy: "strongest_per_exact_duration_then_newest_then_evidence_id",
    monotonicityPolicy: "abstain_without_repair_on_increasing_power_with_duration",
  };
  const maximalMeanPowerCurve = outcomeForCoverage({
    calculationVersion: CYCLING_MMP_CURVE_CALCULATION_VERSION,
    value: curveValue,
    points: evidence.selected,
    evidenceCoverage: curveCoverage,
    availableConfidence: curveConfidence(evidence.selected),
    partialReasons: partialReasons({
      evidenceCoverage: curveCoverage,
      missingRequirementReason: "missing_curve_anchors",
    }),
  });

  const fiveSecond = pointAt(evidence.selected, 5);
  const fiveSecondPowerPoints = fiveSecond ? [fiveSecond] : [];
  const fiveSecondPowerCoverage = coverage({
    selected: fiveSecondPowerPoints,
    eligibleEffortCount: evidence.eligible.filter((point) => point.durationSeconds === 5).length,
    readCoverageState,
    requiredExactDurationsSeconds: [5],
    minimumDistinctDurations: 1,
    minimumDistinctActivities: 1,
  });
  const fiveSecondPower = fiveSecond
    ? outcomeForCoverage({
        calculationVersion: CYCLING_FIVE_SECOND_POWER_CALCULATION_VERSION,
        value: {
          watts: fiveSecond.value,
          durationSeconds: 5,
          interpretation: "five_second_maximal_mean_power_proxy_not_instantaneous_power",
        },
        points: fiveSecondPowerPoints,
        evidenceCoverage: fiveSecondPowerCoverage,
        availableConfidence: pointConfidence({
          eligible: evidence.eligible,
          durationSeconds: 5,
        }),
        partialReasons: ["partial_source_evidence"],
      })
    : unavailableOutcome({
        calculationVersion: CYCLING_FIVE_SECOND_POWER_CALCULATION_VERSION,
        reason: "five_second_power_effort_missing",
        points: [],
        evidenceCoverage: fiveSecondPowerCoverage,
      });

  const fitDurationSet = new Set(
    CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerFitDurationsSeconds,
  );
  const criticalPowerPoints = evidence.selected.filter((point) =>
    fitDurationSet.has(point.durationSeconds),
  );
  const criticalPowerEligibleCount = evidence.eligible.filter((point) =>
    fitDurationSet.has(point.durationSeconds),
  ).length;
  const criticalPowerCoverage = coverage({
    selected: criticalPowerPoints,
    eligibleEffortCount: criticalPowerEligibleCount,
    readCoverageState,
    requiredDurationBands: CRITICAL_POWER_DURATION_BANDS,
    minimumDistinctDurations: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumPoints,
    minimumDistinctActivities: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumActivities,
  });
  const fit = evaluateCriticalPowerFit(criticalPowerPoints);
  let criticalPower: BuiltOutcome<{
    watts: number;
    model: string;
    fit: CriticalPowerFitDiagnostics;
  }>;
  let anaerobicReserve: BuiltOutcome<{
    joules: number;
    name: string;
    interpretation: string;
    fit: CriticalPowerFitDiagnostics;
  }>;
  if (fit.status === "unavailable") {
    criticalPower = unavailableOutcome({
      calculationVersion: CYCLING_CRITICAL_POWER_CALCULATION_VERSION,
      reason: fit.reason,
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
    });
    anaerobicReserve = unavailableOutcome({
      calculationVersion: CYCLING_RESERVE_CALCULATION_VERSION,
      reason: fit.reason,
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
    });
  } else {
    const fitPartialReasons = partialReasons({
      evidenceCoverage: criticalPowerCoverage,
      missingRequirementReason: "critical_power_missing_duration_band",
    });
    criticalPower = outcomeForCoverage({
      calculationVersion: CYCLING_CRITICAL_POWER_CALCULATION_VERSION,
      value: {
        watts: fit.criticalPowerWatts,
        model: "power_watts_equals_cp_plus_gradientpeak_reserve_joules_over_seconds",
        fit: fit.diagnostics,
      },
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
      availableConfidence: fitConfidence(fit),
      partialReasons: fitPartialReasons,
    });
    anaerobicReserve = outcomeForCoverage({
      calculationVersion: CYCLING_RESERVE_CALCULATION_VERSION,
      value: {
        joules: fit.reserveJoules,
        name: "gradientpeak_reserve",
        interpretation: "two_parameter_model_work_term_not_a_direct_physiology_measurement",
        fit: fit.diagnostics,
      },
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
      availableConfidence: fitConfidence(fit),
      partialReasons: fitPartialReasons,
    });
  }

  const twentyMinute = pointAt(evidence.selected, 1_200);
  const thresholdPoints =
    fit.status === "accepted" && twentyMinute
      ? uniqueSorted([
          ...criticalPowerPoints.map((point) => point.evidenceId),
          twentyMinute.evidenceId,
        ])
      : [];
  const thresholdEvidence = pointsForIds(evidence.selected, thresholdPoints);
  const thresholdCoverage = coverage({
    selected: thresholdEvidence,
    eligibleEffortCount: criticalPowerEligibleCount,
    readCoverageState,
    requiredExactDurationsSeconds: [1_200],
    requiredDurationBands: CRITICAL_POWER_DURATION_BANDS,
    minimumDistinctDurations: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumPoints,
    minimumDistinctActivities: CYCLING_DURATION_PERFORMANCE_POLICY.criticalPowerMinimumActivities,
  });
  let planningThresholdPower: BuiltOutcome<{
    watts: number;
    referenceDurationSeconds: number;
    referencePowerFraction: number;
    formula: string;
    interpretation: string;
  }>;
  let modeledTimeToExhaustion: BuiltOutcome<{
    seconds: number;
    atPowerWatts: number;
    formula: string;
    interpretation: string;
  }>;
  if (fit.status === "unavailable") {
    planningThresholdPower = unavailableOutcome({
      calculationVersion: CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION,
      reason: "planning_threshold_power_dependency_unavailable",
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
    });
    modeledTimeToExhaustion = unavailableOutcome({
      calculationVersion: CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
      reason: "modeled_time_to_exhaustion_dependency_unavailable",
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
    });
  } else if (!twentyMinute) {
    planningThresholdPower = unavailableOutcome({
      calculationVersion: CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION,
      reason: "planning_threshold_power_twenty_minute_evidence_missing",
      points: criticalPowerPoints,
      evidenceCoverage: thresholdCoverage,
    });
    modeledTimeToExhaustion = unavailableOutcome({
      calculationVersion: CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
      reason: "modeled_time_to_exhaustion_dependency_unavailable",
      points: criticalPowerPoints,
      evidenceCoverage: thresholdCoverage,
    });
  } else {
    const modelTwentyMinutePower = fit.criticalPowerWatts + fit.reserveJoules / 1_200;
    const thresholdWatts =
      CYCLING_DURATION_PERFORMANCE_POLICY.planningThresholdPowerTwentyMinuteFraction *
      modelTwentyMinutePower;
    if (thresholdWatts <= fit.criticalPowerWatts) {
      planningThresholdPower = unavailableOutcome({
        calculationVersion: CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION,
        reason: "planning_threshold_power_not_above_critical_power",
        points: thresholdEvidence,
        evidenceCoverage: thresholdCoverage,
      });
      modeledTimeToExhaustion = unavailableOutcome({
        calculationVersion: CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
        reason: "modeled_time_to_exhaustion_dependency_unavailable",
        points: thresholdEvidence,
        evidenceCoverage: thresholdCoverage,
      });
    } else {
      const thresholdValue = {
        watts: thresholdWatts,
        referenceDurationSeconds: 1_200,
        referencePowerFraction: 0.95,
        formula: "0.95_times_critical_power_model_power_at_1200_seconds",
        interpretation: "gradientpeak_planning_anchor_not_ftp_or_lactate_threshold",
      };
      const thresholdPartialReasons = partialReasons({
        evidenceCoverage: thresholdCoverage,
        missingRequirementReason: "planning_threshold_power_twenty_minute_evidence_missing",
      });
      planningThresholdPower = outcomeForCoverage({
        calculationVersion: CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION,
        value: thresholdValue,
        points: thresholdEvidence,
        evidenceCoverage: thresholdCoverage,
        availableConfidence: fitConfidence(fit),
        partialReasons: thresholdPartialReasons,
      });
      const modeledTimeToExhaustionSeconds =
        fit.reserveJoules / (thresholdWatts - fit.criticalPowerWatts);
      const modeledTimeToExhaustionBounds =
        CYCLING_DURATION_PERFORMANCE_POLICY.modeledTimeToExhaustionBoundsSeconds;
      if (
        !Number.isFinite(modeledTimeToExhaustionSeconds) ||
        modeledTimeToExhaustionSeconds < modeledTimeToExhaustionBounds.minimum ||
        modeledTimeToExhaustionSeconds > modeledTimeToExhaustionBounds.maximum
      ) {
        modeledTimeToExhaustion = unavailableOutcome({
          calculationVersion: CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
          reason: "modeled_time_to_exhaustion_outside_supported_bounds",
          points: thresholdEvidence,
          evidenceCoverage: thresholdCoverage,
        });
      } else {
        modeledTimeToExhaustion = outcomeForCoverage({
          calculationVersion: CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION,
          value: {
            seconds: modeledTimeToExhaustionSeconds,
            atPowerWatts: thresholdWatts,
            formula: "gradientpeak_reserve_joules_over_threshold_minus_cp_watts",
            interpretation: "model_intersection_not_observed_exhaustion_time",
          },
          points: thresholdEvidence,
          evidenceCoverage: thresholdCoverage,
          availableConfidence: fitConfidence(fit),
          partialReasons: thresholdPartialReasons,
        });
      }
    }
  }

  const oneHour = pointAt(evidence.selected, 3_600);
  const durationRetentionPoints = [twentyMinute, oneHour].filter(
    (point): point is CanonicalCyclingDurationEffortEvidence => point !== null,
  );
  const durationRetentionCoverage = coverage({
    selected: durationRetentionPoints,
    eligibleEffortCount: evidence.eligible.filter(
      (point) => point.durationSeconds === 1_200 || point.durationSeconds === 3_600,
    ).length,
    readCoverageState,
    requiredExactDurationsSeconds: [1_200, 3_600],
    minimumDistinctDurations: 2,
    minimumDistinctActivities: 2,
  });
  let durationRetention: BuiltOutcome<{
    ratio: number;
    shortReferenceDurationSeconds: number;
    longReferenceDurationSeconds: number;
    shortReferencePowerWatts: number;
    longReferencePowerWatts: number;
    formula: string;
    interpretation: string;
  }>;
  if (!twentyMinute || !oneHour) {
    durationRetention = unavailableOutcome({
      calculationVersion: CYCLING_DURATION_RETENTION_CALCULATION_VERSION,
      reason: "duration_retention_evidence_missing",
      points: durationRetentionPoints,
      evidenceCoverage: durationRetentionCoverage,
    });
  } else {
    durationRetention = outcomeForCoverage({
      calculationVersion: CYCLING_DURATION_RETENTION_CALCULATION_VERSION,
      value: {
        ratio: oneHour.value / twentyMinute.value,
        shortReferenceDurationSeconds: 1_200,
        longReferenceDurationSeconds: 3_600,
        shortReferencePowerWatts: twentyMinute.value,
        longReferencePowerWatts: oneHour.value,
        formula: "3600_second_mmp_over_1200_second_mmp",
        interpretation: "cross_duration_retention_not_late_ride_fatigue_resistance",
      },
      points: durationRetentionPoints,
      evidenceCoverage: durationRetentionCoverage,
      availableConfidence: durationRetentionCoverage.distinctActivityCount >= 3 ? "high" : "medium",
      partialReasons: partialReasons({
        evidenceCoverage: durationRetentionCoverage,
        missingRequirementReason: "duration_retention_independent_activity_evidence_missing",
      }),
    });
  }

  const thirtySecond = pointAt(evidence.selected, 30);
  const sixtySecond = pointAt(evidence.selected, 60);
  const shortDurationPoints = [fiveSecond, thirtySecond, sixtySecond].filter(
    (point): point is CanonicalCyclingDurationEffortEvidence => point !== null,
  );
  const shortDurationCoverage = coverage({
    selected: shortDurationPoints,
    eligibleEffortCount: evidence.eligible.filter((point) =>
      [5, 30, 60].includes(point.durationSeconds),
    ).length,
    readCoverageState,
    requiredExactDurationsSeconds: [5, 30, 60],
    minimumDistinctDurations: 3,
    minimumDistinctActivities: 1,
  });
  const shortDurationCapacity =
    fiveSecond && thirtySecond && sixtySecond
      ? outcomeForCoverage({
          calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
          value: {
            fiveSecondPowerWatts: fiveSecond.value,
            thirtySecondPowerWatts: thirtySecond.value,
            sixtySecondPowerWatts: sixtySecond.value,
          },
          points: shortDurationPoints,
          evidenceCoverage: shortDurationCoverage,
          availableConfidence: curveConfidence(shortDurationPoints),
          partialReasons: ["partial_source_evidence"],
        })
      : unavailableOutcome({
          calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
          reason: "short_duration_evidence_missing",
          points: shortDurationPoints,
          evidenceCoverage: shortDurationCoverage,
        });

  const longDurationPoints = oneHour ? [oneHour] : [];
  const longDurationCoverage = coverage({
    selected: longDurationPoints,
    eligibleEffortCount: evidence.eligible.filter((point) => point.durationSeconds === 3_600)
      .length,
    readCoverageState,
    requiredExactDurationsSeconds: [3_600],
    minimumDistinctDurations: 1,
    minimumDistinctActivities: 1,
  });
  const longDurationCapacity = oneHour
    ? outcomeForCoverage({
        calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
        value: { powerWatts: oneHour.value, durationSeconds: 3_600 },
        points: longDurationPoints,
        evidenceCoverage: longDurationCoverage,
        availableConfidence: pointConfidence({
          eligible: evidence.eligible,
          durationSeconds: 3_600,
        }),
        partialReasons: ["partial_source_evidence"],
      })
    : unavailableOutcome({
        calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
        reason: "long_duration_evidence_missing",
        points: [],
        evidenceCoverage: longDurationCoverage,
      });

  const thresholdDependencies: BuiltOutcome<unknown>[] = [
    criticalPower,
    planningThresholdPower,
    modeledTimeToExhaustion,
  ];
  let thresholdCapacity: BuiltOutcome<{
    criticalPowerWatts: number;
    planningThresholdPowerWatts: number;
    modeledTimeToExhaustionSeconds: number;
  }>;
  if (
    criticalPower.status === "unavailable" ||
    planningThresholdPower.status === "unavailable" ||
    modeledTimeToExhaustion.status === "unavailable"
  ) {
    thresholdCapacity = unavailableOutcome({
      calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
      reason: "capability_dependency_unavailable",
      points: thresholdEvidence,
      evidenceCoverage: thresholdCoverage,
    });
  } else {
    const thresholdValue = {
      criticalPowerWatts: criticalPower.value.watts,
      planningThresholdPowerWatts: planningThresholdPower.value.watts,
      modeledTimeToExhaustionSeconds: modeledTimeToExhaustion.value.seconds,
    };
    const dependencyPartial = thresholdDependencies.some(
      (dependency) => dependency.status === "partial",
    );
    thresholdCapacity = dependencyPartial
      ? partialOutcome({
          calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
          value: thresholdValue,
          reasons: ["partial_source_evidence"],
          points: thresholdEvidence,
          evidenceCoverage: { ...thresholdCoverage, state: "partial" },
          confidence: "low",
        })
      : availableOutcome({
          calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
          value: thresholdValue,
          points: thresholdEvidence,
          evidenceCoverage: thresholdCoverage,
          confidence: lowestAvailableConfidence(thresholdDependencies),
        });
  }

  const repeatedEffortCoverage = coverage({
    selected: [],
    eligibleEffortCount: 0,
    readCoverageState,
    minimumDistinctDurations: 1,
    minimumDistinctActivities: 1,
  });
  const repeatedEffortRecovery = unavailableOutcome({
    calculationVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
    reason: "repeated_effort_recovery_not_supported_by_maximal_efforts",
    points: [],
    evidenceCoverage: repeatedEffortCoverage,
  });

  const capabilityProfile = {
    contractVersion: CYCLING_CAPABILITY_PROFILE_VERSION,
    athleteId: parsed.athleteId,
    activityCategory: "bike",
    shortDurationCapacity,
    anaerobicReserve,
    thresholdCapacity,
    longDurationCapacity,
    durationRetention,
    repeatedEffortRecovery,
  };

  const trainingLevels = [
    unavailableTrainingLevel({
      levelId: "sprint_capacity",
      targetCapability: "short_duration_capacity",
      points: shortDurationPoints,
      evidenceCoverage: shortDurationCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    }),
    unavailableTrainingLevel({
      levelId: "reserve_capacity",
      targetCapability: "anaerobic_reserve",
      points: criticalPowerPoints,
      evidenceCoverage: criticalPowerCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    }),
    unavailableTrainingLevel({
      levelId: "threshold_capacity",
      targetCapability: "threshold_capacity",
      points: thresholdEvidence,
      evidenceCoverage: thresholdCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    }),
    unavailableTrainingLevel({
      levelId: "long_duration_capacity",
      targetCapability: "long_duration_capacity",
      points: longDurationPoints,
      evidenceCoverage: longDurationCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    }),
    unavailableTrainingLevel({
      levelId: "duration_retention_capacity",
      targetCapability: "duration_retention",
      points: durationRetentionPoints,
      evidenceCoverage: durationRetentionCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    }),
    unavailableTrainingLevel({
      levelId: "repeated_effort_recovery",
      targetCapability: "repeated_effort_recovery",
      reason: "repeated_effort_recovery_not_supported_by_maximal_efforts",
      points: [],
      evidenceCoverage: repeatedEffortCoverage,
    }),
  ];

  return cyclingDurationPerformanceModelSchema.parse({
    contractVersion: CYCLING_DURATION_PERFORMANCE_MODEL_VERSION,
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "bike",
    calculationIdentity: calculationIdentity(
      parsed.assessmentAsOf,
      parsed.athleteId,
      evidence.selected,
    ),
    evidenceSummary: buildDurationPerformanceEvidenceSummary(evidence),
    maximalMeanPowerCurve,
    parameters: {
      fiveSecondPower,
      criticalPower,
      anaerobicReserve,
      planningThresholdPower,
      modeledTimeToExhaustion,
      durationRetention,
    },
    capabilityProfile,
    trainingLevels,
  });
}
