import { z } from "zod";

import {
  type CalculationResult,
  estimatedResult,
  observedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import { resolveEvidenceEligibility } from "../evidence-contracts";
import type { LineageGroupId, SourceId } from "../lineage";
import type {
  AthleteIntelligenceModelInput,
  EffortObservationInput,
} from "../model-input-contracts";
import { parseUncertainty, type Uncertainty } from "../uncertainty";

export const EFFORT_CURVE_POLICY_VERSION = "effort-curves-v1";
export const EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION =
  "effort-curves-decision-uncertainty-v1";

/**
 * Immutable decision-safety boundaries. These describe evidence adequacy, not
 * a probability, confidence interval, or generic score. Unsafe evidence is
 * returned as insufficient rather than being made recommendation-compatible.
 */
export const EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY = Object.freeze({
  version: EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
  freshWithinDays: 14,
  staleAfterDays: 42,
  minimumIndependentLineages: 2,
  maximumRobustRelativeDisagreement: 0.25,
  uncertainty: Object.freeze({
    base: 0.1,
    independentLineages: Object.freeze({ two: 0.2, three: 0.1, fourOrMore: 0 }),
    eligibleObservationDensity: Object.freeze({ two: 0.2, three: 0.1, fourOrMore: 0 }),
    observationAge: Object.freeze({ fresh: 0, aging: 0.15 }),
    sourceQuality: 0,
    robustInterLineageDisagreement: Object.freeze({ low: 0, elevated: 0.15 }),
    interpolationDistance: Object.freeze({ endpoint: 0, midpoint: 0.2 }),
  }),
});

export const effortCurveModalitySchema = z.enum(["power", "pace"]);
export const effortCurveUnitSchema = z.enum(["watts", "seconds_per_kilometer", "seconds_per_100m"]);

export type EffortCurveModality = z.infer<typeof effortCurveModalitySchema>;
export type EffortCurveUnit = z.infer<typeof effortCurveUnitSchema>;

export type EffortCurveTarget = {
  durationSeconds: number;
  modality: EffortCurveModality;
  unit: EffortCurveUnit;
  sport: string;
};

export type DurationAwareEffortCurve = {
  policyVersion: typeof EFFORT_CURVE_POLICY_VERSION;
  threshold: CalculationResult;
  highIntensity: CalculationResult;
};

type CurvePoint = {
  durationSeconds: number;
  value: number;
  valueSourceId: SourceId;
  contributingSourceIds: SourceId[];
  lineageGroupId: LineageGroupId;
  observedAt: string;
  sourceObservedAt: string;
};

type DecisionEvidence = {
  independentLineageCount: number;
  eligibleObservationCount: number;
  oldestObservationAgeDays: number;
  robustRelativeDisagreement: number;
};

function bestPerKey(
  points: readonly CurvePoint[],
  keyOf: (point: CurvePoint) => string,
): CurvePoint[] {
  const selected = new Map<string, CurvePoint>();
  const ordered = [...points].sort(
    (left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt) ||
      left.valueSourceId.localeCompare(right.valueSourceId),
  );
  for (const point of ordered) if (!selected.has(keyOf(point))) selected.set(keyOf(point), point);
  return [...selected.values()];
}

function isNonEmpty<T>(values: readonly T[]): values is readonly [T, ...T[]] {
  return values.length > 0;
}

const UNKNOWN_UNCERTAINTY = parseUncertainty(1);

function compatibilityReason(target: EffortCurveTarget): string | null {
  if (target.modality === "power") {
    if (target.unit !== "watts") return "unsupported_effort_curve_unit";
    return target.sport === "bike" ? null : "unsupported_effort_curve_sport";
  }
  if (target.sport === "run")
    return target.unit === "seconds_per_kilometer" ? null : "unsupported_effort_curve_unit";
  if (target.sport === "swim")
    return target.unit === "seconds_per_100m" ? null : "unsupported_effort_curve_unit";
  return "unsupported_effort_curve_sport";
}

function pointValue(effort: EffortObservationInput, target: EffortCurveTarget): number | null {
  if (target.modality === "power") return effort.kind === "power" ? effort.powerWatts : null;
  if (effort.kind !== "speed") return null;
  const distanceMeters = target.unit === "seconds_per_100m" ? 100 : 1_000;
  return distanceMeters / effort.speedMetersPerSecond;
}

function matchingEvidenceSources(input: {
  effort: EffortObservationInput;
  evidenceRegistry: AthleteIntelligenceModelInput["evidenceRegistry"];
  assessmentAsOf: string;
}): {
  valueSourceId: SourceId;
  contributingSourceIds: SourceId[];
  sourceObservedAt: string;
} | null {
  const expectedValue =
    input.effort.kind === "power" ? input.effort.powerWatts : input.effort.speedMetersPerSecond;
  const expectedUnit = input.effort.kind === "power" ? "watts" : "meters_per_second";

  const durationSourceIds: SourceId[] = [];
  const valueSourceIds: SourceId[] = [];
  const sourceObservedAt: string[] = [];
  for (const sourceId of input.effort.evidenceSourceIds) {
    const source = input.evidenceRegistry[sourceId];
    if (!source) continue;
    const eligibility = resolveEvidenceEligibility({
      evidence: source,
      asOf: input.assessmentAsOf,
    });
    if (!eligibility.eligible || eligibility.evidence.sport !== input.effort.sport) continue;
    const observation = eligibility.evidence.rawObservation;
    if (
      eligibility.evidence.modality === "duration" &&
      observation.value === input.effort.durationSeconds &&
      observation.unit === "seconds"
    ) {
      durationSourceIds.push(sourceId);
      sourceObservedAt.push(eligibility.evidence.observedAt);
    }
    if (
      eligibility.evidence.modality === "value" &&
      observation.value === expectedValue &&
      observation.unit === expectedUnit
    ) {
      valueSourceIds.push(sourceId);
      sourceObservedAt.push(eligibility.evidence.observedAt);
    }
  }
  const valueSourceId = valueSourceIds[0];
  if (durationSourceIds.length === 0 || valueSourceId === undefined) return null;
  return {
    valueSourceId,
    contributingSourceIds: [...new Set([...durationSourceIds, ...valueSourceIds])],
    sourceObservedAt: sourceObservedAt.sort()[0] ?? input.effort.observedAt,
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  const lower = ordered[Math.max(0, middle - (ordered.length % 2 === 0 ? 1 : 0))];
  return ((lower ?? 0) + (upper ?? 0)) / 2;
}

function robustRelativeDisagreement(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const center = median(values);
  if (center === 0) return values.some((value) => value !== 0) ? 1 : 0;
  return median(values.map((value) => Math.abs(value - center) / Math.abs(center)));
}

function decisionEvidence(input: {
  points: readonly CurvePoint[];
  assessmentAsOf: string;
  disagreementValues: readonly number[];
}): DecisionEvidence {
  const assessmentAsOf = Date.parse(input.assessmentAsOf);
  return {
    independentLineageCount: new Set(input.points.map((point) => point.lineageGroupId)).size,
    eligibleObservationCount: input.points.length,
    oldestObservationAgeDays: Math.max(
      ...input.points.map((point) =>
        Math.max(0, (assessmentAsOf - Date.parse(point.sourceObservedAt)) / 86_400_000),
      ),
    ),
    robustRelativeDisagreement: robustRelativeDisagreement(input.disagreementValues),
  };
}

function decisionUncertainty(input: {
  evidence: DecisionEvidence;
  interpolationDistance: number;
}): Uncertainty {
  const policy = EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY;
  const lineageUncertainty =
    input.evidence.independentLineageCount >= 4
      ? policy.uncertainty.independentLineages.fourOrMore
      : input.evidence.independentLineageCount === 3
        ? policy.uncertainty.independentLineages.three
        : policy.uncertainty.independentLineages.two;
  const densityUncertainty =
    input.evidence.eligibleObservationCount >= 4
      ? policy.uncertainty.eligibleObservationDensity.fourOrMore
      : input.evidence.eligibleObservationCount === 3
        ? policy.uncertainty.eligibleObservationDensity.three
        : policy.uncertainty.eligibleObservationDensity.two;
  const ageUncertainty =
    input.evidence.oldestObservationAgeDays <= policy.freshWithinDays
      ? policy.uncertainty.observationAge.fresh
      : policy.uncertainty.observationAge.aging;
  const disagreementUncertainty =
    input.evidence.robustRelativeDisagreement <= policy.maximumRobustRelativeDisagreement / 2
      ? policy.uncertainty.robustInterLineageDisagreement.low
      : policy.uncertainty.robustInterLineageDisagreement.elevated;
  const interpolationUncertainty =
    policy.uncertainty.interpolationDistance.endpoint +
    policy.uncertainty.interpolationDistance.midpoint * input.interpolationDistance;
  return parseUncertainty(
    Math.min(
      1,
      policy.uncertainty.base +
        lineageUncertainty +
        densityUncertainty +
        ageUncertainty +
        policy.uncertainty.sourceQuality +
        disagreementUncertainty +
        interpolationUncertainty,
    ),
  );
}

function decisionSafetyReason(evidence: DecisionEvidence): string | null {
  const policy = EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY;
  if (evidence.independentLineageCount < policy.minimumIndependentLineages)
    return "single_lineage_not_recommendation_compatible";
  if (evidence.oldestObservationAgeDays > policy.staleAfterDays)
    return "stale_effort_evidence_not_recommendation_compatible";
  if (evidence.robustRelativeDisagreement > policy.maximumRobustRelativeDisagreement)
    return "divergent_independent_lineages_not_recommendation_compatible";
  return null;
}

function insufficientDecisionEvidence(input: {
  reasonCode: string;
  contributingSourceIds: SourceId[];
}): CalculationResult {
  return unavailableResult({
    state: "insufficient_evidence",
    missingDataState: "partial",
    uncertainty: UNKNOWN_UNCERTAINTY,
    reasonCodes: [input.reasonCode],
    contributingSourceIds: input.contributingSourceIds,
  });
}

function calculateTarget(
  model: Pick<AthleteIntelligenceModelInput, "efforts" | "evidenceRegistry">,
  target: EffortCurveTarget,
  assessmentAsOf: string,
): CalculationResult {
  const unsupportedReason = compatibilityReason(target);
  if (unsupportedReason !== null) {
    return unavailableResult({
      state: "unsupported",
      missingDataState: "unsupported_input",
      uncertainty: UNKNOWN_UNCERTAINTY,
      reasonCodes: [unsupportedReason],
    });
  }
  if (!Number.isFinite(target.durationSeconds) || target.durationSeconds <= 0) {
    return unavailableResult({
      state: "unsupported",
      missingDataState: "unsupported_input",
      uncertainty: UNKNOWN_UNCERTAINTY,
      reasonCodes: ["unsupported_effort_curve_duration"],
    });
  }

  const points: CurvePoint[] = [];
  for (const effort of model.efforts) {
    if (effort.sport !== target.sport) continue;
    const evidenceSources = matchingEvidenceSources({
      effort,
      evidenceRegistry: model.evidenceRegistry,
      assessmentAsOf,
    });
    if (!evidenceSources) continue;
    const value = pointValue(effort, target);
    if (value !== null) {
      points.push({
        durationSeconds: effort.durationSeconds,
        value,
        valueSourceId: evidenceSources.valueSourceId,
        contributingSourceIds: evidenceSources.contributingSourceIds,
        lineageGroupId: effort.lineageGroupId,
        observedAt: effort.observedAt,
        sourceObservedAt: evidenceSources.sourceObservedAt,
      });
    }
  }

  const exact = points.filter((point) => point.durationSeconds === target.durationSeconds);
  if (exact.length > 0) {
    const unique = bestPerKey(exact, (point) => point.lineageGroupId);
    const estimate = unique.reduce((sum, point) => sum + point.value, 0) / unique.length;
    const solePoint = unique[0];
    const sourceIds = [...new Set(unique.flatMap((point) => point.contributingSourceIds))];
    const evidence = decisionEvidence({
      points: unique,
      assessmentAsOf,
      disagreementValues: unique.map((point) => point.value),
    });
    const unsafeReason = decisionSafetyReason(evidence);
    if (unsafeReason !== null)
      return insufficientDecisionEvidence({
        reasonCode: unsafeReason,
        contributingSourceIds: sourceIds,
      });
    const uncertainty = decisionUncertainty({ evidence, interpolationDistance: 0 });
    return unique.length === 1 && solePoint !== undefined
      ? observedResult({
          rawValue: estimate,
          unit: target.unit,
          sourceId: solePoint.valueSourceId,
          uncertainty,
        })
      : isNonEmpty(sourceIds)
        ? estimatedResult({
            estimate,
            unit: target.unit,
            uncertainty,
            reasonCodes: ["combined_independent_efforts"],
            contributingSourceIds: sourceIds,
          })
        : unavailableResult({
            state: "insufficient_evidence",
            missingDataState: "required_data_missing",
            uncertainty: UNKNOWN_UNCERTAINTY,
            reasonCodes: ["no_compatible_efforts"],
          });
  }

  const lowerDuration = Math.max(
    ...points
      .filter((point) => point.durationSeconds < target.durationSeconds)
      .map((point) => point.durationSeconds),
  );
  const upperDuration = Math.min(
    ...points
      .filter((point) => point.durationSeconds > target.durationSeconds)
      .map((point) => point.durationSeconds),
  );
  if (!Number.isFinite(lowerDuration) || !Number.isFinite(upperDuration)) {
    return unavailableResult({
      state: "insufficient_evidence",
      missingDataState: points.length === 0 ? "required_data_missing" : "partial",
      uncertainty: UNKNOWN_UNCERTAINTY,
      reasonCodes: [points.length === 0 ? "no_compatible_efforts" : "extrapolation_prohibited"],
      contributingSourceIds: [...new Set(points.flatMap((point) => point.contributingSourceIds))],
    });
  }

  const bracket = points.filter(
    (point) => point.durationSeconds === lowerDuration || point.durationSeconds === upperDuration,
  );
  const uniqueBracket = bestPerKey(
    bracket,
    (point) => `${point.durationSeconds}:${point.lineageGroupId}`,
  );
  const meanAt = (duration: number): number => {
    const atDuration = uniqueBracket.filter((point) => point.durationSeconds === duration);
    return atDuration.reduce((sum, point) => sum + point.value, 0) / atDuration.length;
  };
  const position =
    (Math.log(target.durationSeconds) - Math.log(lowerDuration)) /
    (Math.log(upperDuration) - Math.log(lowerDuration));
  const estimate =
    meanAt(lowerDuration) + position * (meanAt(upperDuration) - meanAt(lowerDuration));
  const contributingSourceIds = [
    ...new Set(uniqueBracket.flatMap((point) => point.contributingSourceIds)),
  ];
  if (!isNonEmpty(contributingSourceIds)) {
    return unavailableResult({
      state: "insufficient_evidence",
      missingDataState: "required_data_missing",
      uncertainty: UNKNOWN_UNCERTAINTY,
      reasonCodes: ["no_compatible_efforts"],
    });
  }

  const bracketEvidence = decisionEvidence({
    points: uniqueBracket,
    assessmentAsOf,
    disagreementValues: uniqueBracket.map((point) => point.value / meanAt(point.durationSeconds)),
  });
  const unsafeReason = decisionSafetyReason(bracketEvidence);
  if (unsafeReason !== null)
    return insufficientDecisionEvidence({ reasonCode: unsafeReason, contributingSourceIds });

  return estimatedResult({
    estimate,
    unit: target.unit,
    uncertainty: decisionUncertainty({
      evidence: bracketEvidence,
      interpolationDistance: 2 * Math.min(position, 1 - position),
    }),
    reasonCodes: ["log_duration_interpolation"],
    contributingSourceIds,
  });
}

/** Calculates distinct threshold and high-intensity values at caller-supplied durations. */
export function calculateDurationAwareEffortCurve(input: {
  model: Pick<AthleteIntelligenceModelInput, "efforts" | "evidenceRegistry">;
  assessmentAsOf: string;
  threshold: EffortCurveTarget;
  highIntensity: EffortCurveTarget;
}): DurationAwareEffortCurve {
  return {
    policyVersion: EFFORT_CURVE_POLICY_VERSION,
    threshold: calculateTarget(input.model, input.threshold, input.assessmentAsOf),
    highIntensity: calculateTarget(input.model, input.highIntensity, input.assessmentAsOf),
  };
}
