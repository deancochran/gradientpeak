import {
  evaluateCriticalPower,
  type ObservedCriticalPowerEffort,
} from "../../calculations/critical-power";
import type { CanonicalSport } from "../../schemas/sport";
import {
  type CalculationResult,
  estimatedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import { resolveEvidenceEligibility } from "../evidence-contracts";
import type {
  AthleteIntelligenceModelInput,
  EffortObservationInput,
} from "../model-input-contracts";

export const CRITICAL_POWER_CAPABILITY_POLICY_VERSION = "critical-power-capability-v1" as const;

export type CriticalPowerCapability = Readonly<{
  policyVersion: typeof CRITICAL_POWER_CAPABILITY_POLICY_VERSION;
  criticalPowerWatts: CalculationResult;
  wPrimeJoules: CalculationResult;
}>;

const unavailable = (
  state: "insufficient_evidence" | "unsupported",
  reasonCode: string,
  contributingSourceIds: readonly string[] = [],
): CalculationResult =>
  unavailableResult({
    state,
    missingDataState:
      state === "unsupported"
        ? "unsupported_input"
        : contributingSourceIds.length > 0
          ? "partial"
          : "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reasonCode],
    contributingSourceIds,
  });

function observedPowerEffort(
  model: Pick<AthleteIntelligenceModelInput, "assessmentAsOf" | "evidenceRegistry">,
  effort: EffortObservationInput,
): { effort: ObservedCriticalPowerEffort; sourceIds: string[] } | null {
  if (effort.sport !== "bike" || effort.kind !== "power") return null;
  const eligibleSources = effort.evidenceSourceIds.flatMap((sourceId) => {
    const source = model.evidenceRegistry[sourceId];
    if (!source || source.modality !== "value") return [];
    const eligibility = resolveEvidenceEligibility({
      evidence: source,
      asOf: model.assessmentAsOf,
    });
    return eligibility.eligible &&
      eligibility.evidence.sourceType === "activity_effort" &&
      eligibility.evidence.sport === "bike" &&
      eligibility.evidence.rawObservation.value === effort.powerWatts &&
      eligibility.evidence.rawObservation.unit === "watts"
      ? [sourceId]
      : [];
  });
  if (eligibleSources.length === 0) return null;

  const activityId = effort.lineageGroupId;
  return {
    effort: {
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: effort.durationSeconds,
      value: effort.powerWatts,
      unit: "watts",
      recorded_at: effort.observedAt,
      activity_id: activityId,
      source: "imported",
      method: "activity_file_best_effort",
      provenance: { activity_id: activityId, derived_from: "activity_file_stream" },
    },
    sourceIds: eligibleSources,
  };
}

type AdaptedPowerEffort = NonNullable<ReturnType<typeof observedPowerEffort>>;

function isPreferredCanonicalEffort(
  candidate: AdaptedPowerEffort,
  current: AdaptedPowerEffort,
): boolean {
  if (candidate.effort.value !== current.effort.value) {
    return candidate.effort.value > current.effort.value;
  }
  if (candidate.effort.recorded_at !== current.effort.recorded_at) {
    return candidate.effort.recorded_at > current.effort.recorded_at;
  }
  if (candidate.effort.activity_id !== current.effort.activity_id) {
    return (candidate.effort.activity_id ?? "") < (current.effort.activity_id ?? "");
  }
  return (
    [...candidate.sourceIds].sort().join("\u0000") < [...current.sourceIds].sort().join("\u0000")
  );
}

/** Selects one strongest trusted observation per canonical duration without losing its activity lineage. */
function selectCanonicalPowerEfforts(efforts: readonly AdaptedPowerEffort[]): AdaptedPowerEffort[] {
  const selected = new Map<number, AdaptedPowerEffort>();
  for (const candidate of efforts) {
    const current = selected.get(candidate.effort.duration_seconds);
    if (!current || isPreferredCanonicalEffort(candidate, current)) {
      selected.set(candidate.effort.duration_seconds, candidate);
    }
  }
  return [...selected.values()].sort(
    (left, right) => left.effort.duration_seconds - right.effort.duration_seconds,
  );
}

/** Adapts already-materialized, observed effort evidence into guarded CP/W′ capability outputs. */
export function calculateCriticalPowerCapability(input: {
  model: Pick<
    AthleteIntelligenceModelInput,
    "assessmentAsOf" | "efforts" | "evidenceRegistry" | "readCoverage"
  >;
  targetSport?: CanonicalSport | null;
}): CriticalPowerCapability {
  if (
    input.targetSport !== undefined &&
    input.targetSport !== null &&
    input.targetSport !== "bike"
  ) {
    const result = unavailable("unsupported", "critical_power_only_supported_for_bike");
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }
  if (input.model.readCoverage?.efforts.state === "truncated") {
    const result = unavailable("insufficient_evidence", "efforts_read_truncated");
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }

  const adapted = input.model.efforts.flatMap((effort) => {
    const observed = observedPowerEffort(input.model, effort);
    return observed ? [observed] : [];
  });
  const selected = selectCanonicalPowerEfforts(adapted);
  const sourceIds = [...new Set(selected.flatMap((item) => item.sourceIds))];
  const evaluation = evaluateCriticalPower(selected.map((item) => item.effort));
  if (evaluation.status === "abstained") {
    const result = unavailable(
      "insufficient_evidence",
      `critical_power_${evaluation.reason.replaceAll("-", "_")}`,
      sourceIds,
    );
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }

  const uncertainty = Math.min(1, Math.max(0, 1 - evaluation.model.rSquared));
  const firstSourceId = sourceIds[0];
  if (firstSourceId === undefined) {
    const result = unavailable("insufficient_evidence", "critical_power_evidence_missing");
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }
  const common = {
    uncertainty,
    reasonCodes: ["observed_critical_power_curve_fit"],
    contributingSourceIds: [firstSourceId, ...sourceIds.slice(1)] as [string, ...string[]],
  } as const;
  return {
    policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
    criticalPowerWatts: estimatedResult({
      estimate: evaluation.model.cp,
      unit: "watts",
      ...common,
    }),
    wPrimeJoules: estimatedResult({
      estimate: evaluation.model.wPrime,
      unit: "joules",
      ...common,
    }),
  };
}
