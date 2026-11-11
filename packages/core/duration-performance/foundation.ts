import { classifyActivityEffortPlausibility } from "../athlete-inputs/activity-effort-policy";
import {
  type CanonicalJson,
  fingerprintCanonicalJson,
} from "../athlete-intelligence/canonical-json";
import {
  type CanonicalQualifiedDurationEffortEvidence,
  DURATION_PERFORMANCE_FOUNDATION_VERSION,
  DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS,
  DURATION_PERFORMANCE_MINIMUM_PARTIAL_SOURCE_COVERAGE,
  type DurationPerformanceCalculationIdentity,
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  type DurationPerformanceEvidenceSummary,
  type DurationPerformanceFoundationReason,
  type DurationPerformanceReadCoverage,
  type DurationPerformanceRecalculationTrigger,
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceEvidenceSummarySchema,
} from "./contracts";

const MILLISECONDS_PER_DAY = 86_400_000;

export const DURATION_PERFORMANCE_RECALCULATION_TRIGGERS = Object.freeze([
  "new_canonical_best_effort",
  "source_evidence_corrected",
  "source_evidence_expired",
  "calculation_policy_changed",
]) satisfies readonly DurationPerformanceRecalculationTrigger[];

export interface DurationBandRequirement {
  minimumDurationSeconds: number;
  maximumDurationSeconds: number;
  minimumPointCount: number;
}

interface DurationEvidenceLike {
  observationId: string;
  evidenceId: string;
  evidenceRevision: number;
  athleteId: string;
  activityId: string;
  segmentId: string;
  recordedAt: string;
  durationSeconds: number;
  value: number;
  unit: "watts" | "meters_per_second";
  calculationVersion: string;
  provenance: {
    extractionStatus: "available" | "partial";
    sourceTimeCoverage: number;
  };
}

export interface DurationPerformanceCoverageInput<T extends DurationEvidenceLike> {
  selected: readonly T[];
  eligibleEffortCount: number;
  readCoverageState: "complete" | "truncated";
  requiredExactDurationsSeconds?: readonly number[];
  requiredDurationBands?: readonly DurationBandRequirement[];
  minimumDistinctDurations?: number;
  minimumDistinctActivities?: number;
  forcePartial?: boolean;
}

export type DurationEvidenceExclusionReason =
  | "future_observation"
  | "outside_freshness_window"
  | "partial_source_coverage_below_minimum"
  | "duration_value_plausibility_review_required";

export interface SelectedDurationEvidence<T extends DurationEvidenceLike> {
  eligible: T[];
  selected: T[];
  excluded: Array<{ evidenceId: string; reason: DurationEvidenceExclusionReason }>;
  supersededEvidenceIds: string[];
}

export interface DurationPerformanceCurvePoint {
  observationId: string;
  sourceEvidenceId: string;
  evidenceRevision: number;
  activityId: string;
  segmentId: string;
  recordedAt: string;
  durationSeconds: number;
  value: number;
  unit: "watts" | "meters_per_second";
  sourceExtractionStatus: "available" | "partial";
  sourceCalculationVersion: string;
}

export type DurationPerformanceFoundation<T extends CanonicalQualifiedDurationEffortEvidence> = {
  status: "available" | "partial" | "unavailable";
  reasons: DurationPerformanceFoundationReason[];
  curve: { points: DurationPerformanceCurvePoint[] } | null;
  confidence: DurationPerformanceConfidence;
  expiresAt: string | null;
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  evidenceSummary: DurationPerformanceEvidenceSummary;
  eligible: T[];
  selected: T[];
};

export type DurationPerformanceOutcome<T, R extends string> =
  | (DurationPerformanceOutcomeMetadata & {
      status: "available";
      value: T;
      reasons: R[];
    })
  | (DurationPerformanceOutcomeMetadata & {
      status: "partial";
      value: T;
      reasons: R[];
    })
  | (DurationPerformanceOutcomeMetadata & {
      status: "unavailable";
      value: null;
      reasons: R[];
    });

export interface DurationPerformanceOutcomeMetadata {
  calculationVersion: string;
  sourceEvidenceIds: string[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: DurationPerformanceConfidence;
  expiresAt: string | null;
  recalculationTriggers: DurationPerformanceRecalculationTrigger[];
}

export interface InverseDurationFitDiagnostics {
  pointCount: number;
  activityCount: number;
  fitMinimumDurationSeconds: number;
  fitMaximumDurationSeconds: number;
  rSquared: number;
  rmse: number;
  normalizedRmse: number;
  maximumAbsoluteResidual: number;
  maximumInterceptRemovalChangeRatio: number;
  maximumReserveRemovalChangeRatio: number;
}

export type InverseDurationFitFailure =
  | "insufficient_points"
  | "missing_duration_band"
  | "insufficient_independent_activities"
  | "degenerate_fit"
  | "parameters_out_of_bounds"
  | "poor_fit"
  | "unstable_fit";

export type InverseDurationFit =
  | {
      status: "accepted";
      intercept: number;
      reserve: number;
      diagnostics: InverseDurationFitDiagnostics;
    }
  | { status: "unavailable"; reason: InverseDurationFitFailure };

interface BasicInverseDurationFit {
  intercept: number;
  reserve: number;
  rSquared: number;
  rmse: number;
  normalizedRmse: number;
  maximumAbsoluteResidual: number;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedDurations(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function durationPerformanceSourceEvidenceIds<T extends DurationEvidenceLike>(
  points: readonly T[],
): string[] {
  return uniqueSorted(points.map((point) => point.evidenceId));
}

export function durationPerformanceEvidenceExpiry<T extends DurationEvidenceLike>(
  points: readonly T[],
  freshnessWindowDays = DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS,
): string | null {
  if (points.length === 0) return null;
  const freshnessMilliseconds = freshnessWindowDays * MILLISECONDS_PER_DAY;
  let earliestExpiry = Number.POSITIVE_INFINITY;
  for (const point of points) {
    earliestExpiry = Math.min(earliestExpiry, Date.parse(point.recordedAt) + freshnessMilliseconds);
  }
  return Number.isFinite(earliestExpiry) ? new Date(earliestExpiry).toISOString() : null;
}

export function buildDurationPerformanceCoverage<T extends DurationEvidenceLike>(
  input: DurationPerformanceCoverageInput<T>,
): DurationPerformanceEvidenceCoverage {
  const requiredExactDurationsSeconds = uniqueSortedDurations(
    input.requiredExactDurationsSeconds ?? [],
  );
  const requiredDurationBands = (input.requiredDurationBands ?? []).map((band) => ({ ...band }));
  const observedDurationsSeconds = uniqueSortedDurations(
    input.selected.map((point) => point.durationSeconds),
  );
  const observedDurationSet = new Set(observedDurationsSeconds);
  const distinctActivityCount = new Set(input.selected.map((point) => point.activityId)).size;
  const completeSourcePointCount = input.selected.filter(
    (point) => point.provenance.extractionStatus === "available",
  ).length;
  const partialSourcePointCount = input.selected.length - completeSourcePointCount;
  const minimumDistinctDurations = input.minimumDistinctDurations ?? 0;
  const minimumDistinctActivities = input.minimumDistinctActivities ?? 0;
  const hasExactDurations = requiredExactDurationsSeconds.every((duration) =>
    observedDurationSet.has(duration),
  );
  const hasDurationBands = requiredDurationBands.every(
    (band) =>
      input.selected.filter(
        (point) =>
          point.durationSeconds >= band.minimumDurationSeconds &&
          point.durationSeconds <= band.maximumDurationSeconds,
      ).length >= band.minimumPointCount,
  );
  const requirementsComplete =
    hasExactDurations &&
    hasDurationBands &&
    observedDurationsSeconds.length >= minimumDistinctDurations &&
    distinctActivityCount >= minimumDistinctActivities;
  const state =
    input.selected.length === 0
      ? "insufficient"
      : requirementsComplete &&
          partialSourcePointCount === 0 &&
          input.readCoverageState === "complete" &&
          input.forcePartial !== true
        ? "complete"
        : "partial";

  return durationPerformanceEvidenceCoverageSchema.parse({
    state,
    readCoverageState: input.readCoverageState,
    requiredExactDurationsSeconds,
    requiredDurationBands,
    minimumDistinctDurations,
    minimumDistinctActivities,
    observedDurationsSeconds,
    eligibleEffortCount: input.eligibleEffortCount,
    selectedPointCount: input.selected.length,
    distinctActivityCount,
    completeSourcePointCount,
    partialSourcePointCount,
  });
}

function preferredEffort<T extends DurationEvidenceLike>(candidate: T, current: T): boolean {
  if (candidate.value !== current.value) return candidate.value > current.value;
  const candidateTime = Date.parse(candidate.recordedAt);
  const currentTime = Date.parse(current.recordedAt);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.evidenceId.localeCompare(current.evidenceId) < 0;
}

export function selectCanonicalDurationEvidence<
  T extends CanonicalQualifiedDurationEffortEvidence,
>(input: {
  efforts: readonly T[];
  assessmentAsOf: string;
  freshnessWindowDays?: number;
  minimumPartialSourceTimeCoverage?: number;
}): SelectedDurationEvidence<T> {
  const freshnessWindowDays =
    input.freshnessWindowDays ?? DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS;
  const minimumPartialSourceTimeCoverage =
    input.minimumPartialSourceTimeCoverage ?? DURATION_PERFORMANCE_MINIMUM_PARTIAL_SOURCE_COVERAGE;
  const asOf = Date.parse(input.assessmentAsOf);
  const cutoff = asOf - freshnessWindowDays * MILLISECONDS_PER_DAY;
  const eligible: T[] = [];
  const excluded: SelectedDurationEvidence<T>["excluded"] = [];

  for (const effort of [...input.efforts].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  )) {
    const observedAt = Date.parse(effort.recordedAt);
    if (observedAt > asOf) {
      excluded.push({ evidenceId: effort.evidenceId, reason: "future_observation" });
      continue;
    }
    if (observedAt < cutoff) {
      excluded.push({ evidenceId: effort.evidenceId, reason: "outside_freshness_window" });
      continue;
    }
    if (
      effort.provenance.extractionStatus === "partial" &&
      effort.provenance.sourceTimeCoverage < minimumPartialSourceTimeCoverage
    ) {
      excluded.push({
        evidenceId: effort.evidenceId,
        reason: "partial_source_coverage_below_minimum",
      });
      continue;
    }
    const plausibility = classifyActivityEffortPlausibility({
      activityCategory: effort.activityCategory,
      effortType: effort.metric,
      durationSeconds: effort.durationSeconds,
      value: effort.value,
    });
    if (plausibility.classification !== "plausible") {
      excluded.push({
        evidenceId: effort.evidenceId,
        reason: "duration_value_plausibility_review_required",
      });
      continue;
    }
    eligible.push(effort);
  }

  const selectedByDuration = new Map<number, T>();
  for (const effort of eligible) {
    const current = selectedByDuration.get(effort.durationSeconds);
    if (!current || preferredEffort(effort, current))
      selectedByDuration.set(effort.durationSeconds, effort);
  }
  const selected = [...selectedByDuration.values()].sort(
    (left, right) => left.durationSeconds - right.durationSeconds,
  );
  const selectedIds = new Set(selected.map((effort) => effort.evidenceId));

  return {
    eligible,
    selected,
    excluded,
    supersededEvidenceIds: uniqueSorted(
      eligible
        .filter((effort) => !selectedIds.has(effort.evidenceId))
        .map((effort) => effort.evidenceId),
    ),
  };
}

export function isMonotonicDurationCurve<T extends DurationEvidenceLike>(
  points: readonly T[],
): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    if (current.value > previous.value) return false;
  }
  return true;
}

export function durationPerformanceCurveConfidence<T extends DurationEvidenceLike>(
  points: readonly T[],
): Exclude<DurationPerformanceConfidence, "unavailable"> {
  const activities = new Set(points.map((point) => point.activityId)).size;
  if (points.length >= 8 && activities >= 4) return "high";
  if (points.length >= 6 && activities >= 2) return "medium";
  return "low";
}

export function durationPerformancePointConfidence<T extends DurationEvidenceLike>(input: {
  eligible: readonly T[];
  durationSeconds: number;
}): Exclude<DurationPerformanceConfidence, "unavailable"> {
  const activities = new Set(
    input.eligible
      .filter((point) => point.durationSeconds === input.durationSeconds)
      .map((point) => point.activityId),
  ).size;
  return activities >= 3 ? "high" : activities === 2 ? "medium" : "low";
}

export function durationPerformancePartialReasons<R extends string>(input: {
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  missingRequirementReason: R;
  partialSourceReason: R;
}): R[] {
  const reasons: R[] = [];
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
  if (input.evidenceCoverage.partialSourcePointCount > 0) reasons.push(input.partialSourceReason);
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

export function buildDurationPerformanceEvidenceSummary<T extends DurationEvidenceLike>(
  selected: SelectedDurationEvidence<T>,
): DurationPerformanceEvidenceSummary {
  return durationPerformanceEvidenceSummarySchema.parse({
    inputEvidenceCount: selected.eligible.length + selected.excluded.length,
    eligibleEvidenceIds: uniqueSorted(selected.eligible.map((effort) => effort.evidenceId)),
    selectedSourceEvidenceIds: selected.selected.map((effort) => effort.evidenceId),
    selectedObservationIds: uniqueSorted(selected.selected.map((effort) => effort.observationId)),
    supersededEvidenceIds: selected.supersededEvidenceIds,
    excludedEvidence: [...selected.excluded].sort((left, right) =>
      left.evidenceId.localeCompare(right.evidenceId),
    ),
  });
}

function curvePoints<T extends DurationEvidenceLike>(
  points: readonly T[],
): DurationPerformanceCurvePoint[] {
  return points.map((point) => ({
    observationId: point.observationId,
    sourceEvidenceId: point.evidenceId,
    evidenceRevision: point.evidenceRevision,
    activityId: point.activityId,
    segmentId: point.segmentId,
    recordedAt: point.recordedAt,
    durationSeconds: point.durationSeconds,
    value: point.value,
    unit: point.unit,
    sourceExtractionStatus: point.provenance.extractionStatus,
    sourceCalculationVersion: point.calculationVersion,
  }));
}

/**
 * Builds only the shared canonical curve foundation. Category semantics (power,
 * pace or session evidence) remain in their owning model.
 */
export function buildCanonicalDurationPerformanceCurve<
  T extends CanonicalQualifiedDurationEffortEvidence,
>(input: {
  efforts: readonly T[];
  assessmentAsOf: string;
  readCoverage: DurationPerformanceReadCoverage;
  requiredExactDurationsSeconds: readonly number[];
  minimumDistinctActivities?: number;
  freshnessWindowDays?: number;
}): DurationPerformanceFoundation<T> {
  const selected = selectCanonicalDurationEvidence({
    efforts: input.efforts,
    assessmentAsOf: input.assessmentAsOf,
    ...(input.freshnessWindowDays === undefined
      ? {}
      : { freshnessWindowDays: input.freshnessWindowDays }),
  });
  const evidenceCoverage = buildDurationPerformanceCoverage({
    selected: selected.selected,
    eligibleEffortCount: selected.eligible.length,
    readCoverageState: input.readCoverage.state,
    requiredExactDurationsSeconds: input.requiredExactDurationsSeconds,
    minimumDistinctDurations: input.requiredExactDurationsSeconds.length,
    minimumDistinctActivities: input.minimumDistinctActivities ?? 1,
  });
  const summary = buildDurationPerformanceEvidenceSummary(selected);
  const expiresAt = durationPerformanceEvidenceExpiry(selected.selected, input.freshnessWindowDays);
  if (input.readCoverage.state === "truncated") {
    return {
      status: "unavailable",
      reasons: ["evidence_read_truncated"],
      curve: null,
      confidence: "unavailable",
      expiresAt,
      evidenceCoverage,
      evidenceSummary: summary,
      eligible: selected.eligible,
      selected: selected.selected,
    };
  }
  if (selected.selected.length === 0) {
    return {
      status: "unavailable",
      reasons: ["no_eligible_efforts"],
      curve: null,
      confidence: "unavailable",
      expiresAt,
      evidenceCoverage,
      evidenceSummary: summary,
      eligible: selected.eligible,
      selected: selected.selected,
    };
  }
  if (!isMonotonicDurationCurve(selected.selected)) {
    return {
      status: "unavailable",
      reasons: ["non_monotonic_canonical_curve"],
      curve: null,
      confidence: "unavailable",
      expiresAt,
      evidenceCoverage,
      evidenceSummary: summary,
      eligible: selected.eligible,
      selected: selected.selected,
    };
  }
  const reasons = durationPerformancePartialReasons({
    evidenceCoverage,
    missingRequirementReason: "missing_curve_anchors",
    partialSourceReason: "partial_source_evidence",
  });
  return {
    status: evidenceCoverage.state === "complete" ? "available" : "partial",
    reasons,
    curve: { points: curvePoints(selected.selected) },
    confidence:
      evidenceCoverage.state === "complete"
        ? durationPerformanceCurveConfidence(selected.selected)
        : "low",
    expiresAt,
    evidenceCoverage,
    evidenceSummary: summary,
    eligible: selected.eligible,
    selected: selected.selected,
  };
}

function basicInverseDurationFit<T extends DurationEvidenceLike>(
  points: readonly T[],
): BasicInverseDurationFit | null {
  if (points.length < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXy = 0;
  let sumXx = 0;
  for (const point of points) {
    const inverseDuration = 1 / point.durationSeconds;
    sumX += inverseDuration;
    sumY += point.value;
    sumXy += inverseDuration * point.value;
    sumXx += inverseDuration * inverseDuration;
  }
  const count = points.length;
  const denominator = count * sumXx - sumX * sumX;
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= Number.EPSILON) return null;
  const reserve = (count * sumXy - sumX * sumY) / denominator;
  const intercept = (sumY - reserve * sumX) / count;
  if (!Number.isFinite(intercept) || !Number.isFinite(reserve)) return null;

  const meanValue = sumY / count;
  const residuals = points.map(
    (point) => point.value - (intercept + reserve / point.durationSeconds),
  );
  const residualSquares = residuals.reduce((sum, residual) => sum + residual * residual, 0);
  const totalSquares = points.reduce((sum, point) => sum + (point.value - meanValue) ** 2, 0);
  if (totalSquares <= 0 || meanValue <= 0) return null;
  const rawRSquared = 1 - residualSquares / totalSquares;
  const rmse = Math.sqrt(residualSquares / count);
  const normalizedRmse = rmse / meanValue;
  const maximumAbsoluteResidual = Math.max(...residuals.map((residual) => Math.abs(residual)));
  if (
    !Number.isFinite(rawRSquared) ||
    !Number.isFinite(rmse) ||
    !Number.isFinite(normalizedRmse) ||
    !Number.isFinite(maximumAbsoluteResidual)
  ) {
    return null;
  }
  return {
    intercept,
    reserve,
    rSquared: Math.max(0, Math.min(1, rawRSquared)),
    rmse,
    normalizedRmse,
    maximumAbsoluteResidual,
  };
}

export function fitInverseDurationModel<T extends DurationEvidenceLike>(input: {
  points: readonly T[];
  minimumPoints: number;
  minimumActivities: number;
  requiredDurationBands: readonly DurationBandRequirement[];
  interceptBounds: { minimum: number; maximum: number };
  reserveBounds: { minimum: number; maximum: number };
  minimumRSquared: number;
  maximumNormalizedRmse: number;
  maximumInterceptRemovalChangeRatio: number;
  maximumReserveRemovalChangeRatio: number;
}): InverseDurationFit {
  if (input.points.length < input.minimumPoints) {
    return { status: "unavailable", reason: "insufficient_points" };
  }
  if (
    input.requiredDurationBands.some(
      (band) =>
        input.points.filter(
          (point) =>
            point.durationSeconds >= band.minimumDurationSeconds &&
            point.durationSeconds <= band.maximumDurationSeconds,
        ).length < band.minimumPointCount,
    )
  ) {
    return { status: "unavailable", reason: "missing_duration_band" };
  }
  const activityCount = new Set(input.points.map((point) => point.activityId)).size;
  if (activityCount < input.minimumActivities) {
    return { status: "unavailable", reason: "insufficient_independent_activities" };
  }

  const fit = basicInverseDurationFit(input.points);
  if (!fit) return { status: "unavailable", reason: "degenerate_fit" };
  if (
    fit.intercept < input.interceptBounds.minimum ||
    fit.intercept > input.interceptBounds.maximum ||
    fit.reserve < input.reserveBounds.minimum ||
    fit.reserve > input.reserveBounds.maximum
  ) {
    return { status: "unavailable", reason: "parameters_out_of_bounds" };
  }
  if (fit.rSquared < input.minimumRSquared || fit.normalizedRmse > input.maximumNormalizedRmse) {
    return { status: "unavailable", reason: "poor_fit" };
  }

  let maximumInterceptRemovalChangeRatio = 0;
  let maximumReserveRemovalChangeRatio = 0;
  for (let removedIndex = 0; removedIndex < input.points.length; removedIndex += 1) {
    const reduced = basicInverseDurationFit(
      input.points.filter((_point, index) => index !== removedIndex),
    );
    if (!reduced || reduced.intercept <= 0 || reduced.reserve <= 0) {
      return { status: "unavailable", reason: "unstable_fit" };
    }
    maximumInterceptRemovalChangeRatio = Math.max(
      maximumInterceptRemovalChangeRatio,
      Math.abs(reduced.intercept - fit.intercept) / fit.intercept,
    );
    maximumReserveRemovalChangeRatio = Math.max(
      maximumReserveRemovalChangeRatio,
      Math.abs(reduced.reserve - fit.reserve) / fit.reserve,
    );
  }
  if (
    maximumInterceptRemovalChangeRatio > input.maximumInterceptRemovalChangeRatio ||
    maximumReserveRemovalChangeRatio > input.maximumReserveRemovalChangeRatio
  ) {
    return { status: "unavailable", reason: "unstable_fit" };
  }

  const first = input.points[0];
  const last = input.points.at(-1);
  if (!first || !last) return { status: "unavailable", reason: "degenerate_fit" };
  return {
    status: "accepted",
    intercept: fit.intercept,
    reserve: fit.reserve,
    diagnostics: {
      pointCount: input.points.length,
      activityCount,
      fitMinimumDurationSeconds: first.durationSeconds,
      fitMaximumDurationSeconds: last.durationSeconds,
      rSquared: fit.rSquared,
      rmse: fit.rmse,
      normalizedRmse: fit.normalizedRmse,
      maximumAbsoluteResidual: fit.maximumAbsoluteResidual,
      maximumInterceptRemovalChangeRatio,
      maximumReserveRemovalChangeRatio,
    },
  };
}

export function durationPerformanceFitConfidence(
  fit: Extract<InverseDurationFit, { status: "accepted" }>,
): Exclude<DurationPerformanceConfidence, "unavailable"> {
  if (fit.diagnostics.rSquared >= 0.99 && fit.diagnostics.activityCount >= 3) return "high";
  return "medium";
}

function outcomeMetadata<T extends DurationEvidenceLike>(input: {
  calculationVersion: string;
  points: readonly T[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: DurationPerformanceConfidence;
  freshnessWindowDays?: number;
}): DurationPerformanceOutcomeMetadata {
  return {
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: durationPerformanceSourceEvidenceIds(input.points),
    evidenceCoverage: input.evidenceCoverage,
    confidence: input.confidence,
    expiresAt: durationPerformanceEvidenceExpiry(input.points, input.freshnessWindowDays),
    recalculationTriggers: [...DURATION_PERFORMANCE_RECALCULATION_TRIGGERS],
  };
}

export function availableDurationPerformanceOutcome<
  T,
  R extends string,
  E extends DurationEvidenceLike,
>(input: {
  calculationVersion: string;
  value: T;
  points: readonly E[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: Exclude<DurationPerformanceConfidence, "unavailable">;
  freshnessWindowDays?: number;
}): DurationPerformanceOutcome<T, R> {
  return { status: "available", value: input.value, reasons: [], ...outcomeMetadata(input) };
}

export function partialDurationPerformanceOutcome<
  T,
  R extends string,
  E extends DurationEvidenceLike,
>(input: {
  calculationVersion: string;
  value: T;
  reasons: R[];
  points: readonly E[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: Exclude<DurationPerformanceConfidence, "unavailable">;
  freshnessWindowDays?: number;
}): DurationPerformanceOutcome<T, R> {
  return {
    status: "partial",
    value: input.value,
    reasons: input.reasons,
    ...outcomeMetadata(input),
  };
}

export function unavailableDurationPerformanceOutcome<
  R extends string,
  E extends DurationEvidenceLike,
>(input: {
  calculationVersion: string;
  reasons: R[];
  points: readonly E[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  freshnessWindowDays?: number;
}): DurationPerformanceOutcome<never, R> {
  return {
    status: "unavailable",
    value: null,
    reasons: input.reasons,
    ...outcomeMetadata({ ...input, confidence: "unavailable" }),
  };
}

export function durationPerformanceOutcomeForCoverage<
  T,
  R extends string,
  E extends DurationEvidenceLike,
>(input: {
  calculationVersion: string;
  value: T;
  points: readonly E[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  availableConfidence: Exclude<DurationPerformanceConfidence, "unavailable">;
  partialReasons: R[];
  freshnessWindowDays?: number;
}): DurationPerformanceOutcome<T, R> {
  if (input.evidenceCoverage.state === "complete") {
    return availableDurationPerformanceOutcome({
      ...input,
      confidence: input.availableConfidence,
    });
  }
  return partialDurationPerformanceOutcome({
    ...input,
    reasons: input.partialReasons,
    confidence: "low",
  });
}

export function durationPerformanceConfidenceRank(
  confidence: DurationPerformanceConfidence,
): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    case "unavailable":
      return 0;
  }
}

export function lowestDurationPerformanceConfidence(
  outcomes: readonly { confidence: DurationPerformanceConfidence }[],
): Exclude<DurationPerformanceConfidence, "unavailable"> {
  const available = outcomes
    .map((outcome) => outcome.confidence)
    .filter((confidence) => confidence !== "unavailable")
    .sort(
      (left, right) =>
        durationPerformanceConfidenceRank(left) - durationPerformanceConfidenceRank(right),
    );
  return available[0] ?? "low";
}

export function createDurationPerformanceCalculationIdentity(input: {
  modelVersion: string;
  inputContractVersion: string;
  evidencePolicyVersion: string;
  assessmentAsOf: string;
  athleteId: string;
  activityCategory: "bike" | "run" | "swim" | "strength" | "other";
  modelVariant: string;
  sourceCalculationVersions: readonly string[];
  evidence: readonly {
    evidenceId: string;
    observationId: string;
    evidenceRevision: number;
    sourceCalculationVersion: string;
    facts: CanonicalJson;
  }[];
}): DurationPerformanceCalculationIdentity {
  const sourceCalculationVersions = uniqueSorted([
    ...input.sourceCalculationVersions,
    ...input.evidence.map((evidence) => evidence.sourceCalculationVersion),
  ]);
  const normalizedEvidence = [...input.evidence]
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))
    .map((evidence) => ({
      evidenceId: evidence.evidenceId,
      observationId: evidence.observationId,
      evidenceRevision: evidence.evidenceRevision,
      sourceCalculationVersion: evidence.sourceCalculationVersion,
      facts: evidence.facts,
    }));
  const historySeriesFingerprint = fingerprintCanonicalJson({
    foundationVersion: DURATION_PERFORMANCE_FOUNDATION_VERSION,
    athleteId: input.athleteId,
    activityCategory: input.activityCategory,
    modelVariant: input.modelVariant,
  });
  const evidenceSetFingerprint = fingerprintCanonicalJson(normalizedEvidence);
  const calculationFingerprint = fingerprintCanonicalJson({
    foundationVersion: DURATION_PERFORMANCE_FOUNDATION_VERSION,
    modelVersion: input.modelVersion,
    inputContractVersion: input.inputContractVersion,
    evidencePolicyVersion: input.evidencePolicyVersion,
    assessmentAsOf: input.assessmentAsOf,
    historySeriesFingerprint,
    evidenceSetFingerprint,
  });
  return durationPerformanceCalculationIdentitySchema.parse({
    foundationVersion: DURATION_PERFORMANCE_FOUNDATION_VERSION,
    modelVersion: input.modelVersion,
    inputContractVersion: input.inputContractVersion,
    evidencePolicyVersion: input.evidencePolicyVersion,
    sourceCalculationVersions,
    assessmentAsOf: input.assessmentAsOf,
    athleteId: input.athleteId,
    activityCategory: input.activityCategory,
    modelVariant: input.modelVariant,
    historySeriesFingerprint,
    evidenceSetFingerprint,
    calculationFingerprint,
  });
}
