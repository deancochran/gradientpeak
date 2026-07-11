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

export const effortCurveModalitySchema = z.enum(["power", "pace"]);
export const effortCurveUnitSchema = z.enum(["watts", "seconds_per_kilometer"]);

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
  if (target.unit !== "seconds_per_kilometer") return "unsupported_effort_curve_unit";
  return target.sport === "run" ? null : "unsupported_effort_curve_sport";
}

function pointValue(effort: EffortObservationInput, modality: EffortCurveModality): number | null {
  if (modality === "power") return effort.kind === "power" ? effort.powerWatts : null;
  return effort.kind === "speed" ? 1_000 / effort.speedMetersPerSecond : null;
}

function matchingEvidenceSources(input: {
  effort: EffortObservationInput;
  evidenceRegistry: AthleteIntelligenceModelInput["evidenceRegistry"];
  assessmentAsOf: string;
}): { valueSourceId: SourceId; contributingSourceIds: SourceId[] } | null {
  const expectedValue =
    input.effort.kind === "power" ? input.effort.powerWatts : input.effort.speedMetersPerSecond;
  const expectedUnit = input.effort.kind === "power" ? "watts" : "meters_per_second";

  const durationSourceIds: SourceId[] = [];
  const valueSourceIds: SourceId[] = [];
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
    }
    if (
      eligibility.evidence.modality === "value" &&
      observation.value === expectedValue &&
      observation.unit === expectedUnit
    ) {
      valueSourceIds.push(sourceId);
    }
  }
  const valueSourceId = valueSourceIds[0];
  if (durationSourceIds.length === 0 || valueSourceId === undefined) return null;
  return {
    valueSourceId,
    contributingSourceIds: [...new Set([...durationSourceIds, ...valueSourceIds])],
  };
}

function interpolationUncertainty(input: {
  lowerDuration: number;
  upperDuration: number;
  requestedDuration: number;
  lineageCount: number;
}): Uncertainty {
  const span = Math.log(input.upperDuration) - Math.log(input.lowerDuration);
  const position = (Math.log(input.requestedDuration) - Math.log(input.lowerDuration)) / span;
  const distanceFromObserved = 2 * Math.min(position, 1 - position);
  const evidenceUncertainty = 1 / Math.sqrt(input.lineageCount);
  return parseUncertainty(
    Math.min(1, evidenceUncertainty + (1 - evidenceUncertainty) * distanceFromObserved),
  );
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
    const value = pointValue(effort, target.modality);
    if (value !== null) {
      points.push({
        durationSeconds: effort.durationSeconds,
        value,
        valueSourceId: evidenceSources.valueSourceId,
        contributingSourceIds: evidenceSources.contributingSourceIds,
        lineageGroupId: effort.lineageGroupId,
        observedAt: effort.observedAt,
      });
    }
  }

  const exact = points.filter((point) => point.durationSeconds === target.durationSeconds);
  if (exact.length > 0) {
    const unique = bestPerKey(exact, (point) => point.lineageGroupId);
    const estimate = unique.reduce((sum, point) => sum + point.value, 0) / unique.length;
    const uncertainty = parseUncertainty(1 / Math.sqrt(unique.length));
    const solePoint = unique[0];
    const sourceIds = [...new Set(unique.flatMap((point) => point.contributingSourceIds))];
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
  const lineageCount = new Set(uniqueBracket.map((point) => point.lineageGroupId)).size;

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

  return estimatedResult({
    estimate,
    unit: target.unit,
    uncertainty: interpolationUncertainty({
      lowerDuration,
      upperDuration,
      requestedDuration: target.durationSeconds,
      lineageCount,
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
