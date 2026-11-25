import type { CanonicalActivityCategory } from "../../schemas/activity-category";
import {
  type CalculationResult,
  estimatedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import type { ParsedAthleteIntelligenceModelInput } from "../model-input-contracts";

export const CRITICAL_POWER_CAPABILITY_POLICY_VERSION = "critical-power-capability-v2" as const;

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

function confidenceUncertainty(confidence: "high" | "medium" | "low" | "unavailable"): number {
  if (confidence === "high") return 0.1;
  if (confidence === "medium") return 0.35;
  if (confidence === "low") return 0.65;
  return 1;
}

/** Projects CP and reserve exclusively from the canonical as-of cycling performance model. */
export function calculateCriticalPowerCapability(input: {
  model: Pick<ParsedAthleteIntelligenceModelInput, "performanceModel">;
  targetActivityCategory?: CanonicalActivityCategory | null;
}): CriticalPowerCapability {
  if (
    input.targetActivityCategory !== undefined &&
    input.targetActivityCategory !== null &&
    input.targetActivityCategory !== "bike"
  ) {
    const result = unavailable("unsupported", "critical_power_only_supported_for_bike");
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }

  const cycling = input.model.performanceModel?.categories.bike.parameters;
  if (cycling === undefined) {
    const result = unavailable("insufficient_evidence", "canonical_performance_model_unavailable");
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }

  const criticalPower = cycling.criticalPower;
  const reserve = cycling.anaerobicReserve;
  const sourceIds = [
    ...new Set(
      [...criticalPower.sourceEvidenceIds, ...reserve.sourceEvidenceIds].map(
        (evidenceId) => `effort:${evidenceId}:value`,
      ),
    ),
  ];
  if (
    criticalPower.status !== "available" ||
    criticalPower.value === null ||
    reserve.status !== "available" ||
    reserve.value === null ||
    sourceIds.length === 0
  ) {
    const reasonCodes = [...new Set([...criticalPower.reasons, ...reserve.reasons])];
    const result = unavailable(
      "insufficient_evidence",
      reasonCodes[0] ?? "canonical_critical_power_unavailable",
      sourceIds,
    );
    return {
      policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
      criticalPowerWatts: result,
      wPrimeJoules: result,
    };
  }

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
    uncertainty: Math.max(
      confidenceUncertainty(criticalPower.confidence),
      confidenceUncertainty(reserve.confidence),
    ),
    reasonCodes: ["canonical_cycling_duration_performance_model"],
    contributingSourceIds: [firstSourceId, ...sourceIds.slice(1)] as [string, ...string[]],
  } as const;
  return {
    policyVersion: CRITICAL_POWER_CAPABILITY_POLICY_VERSION,
    criticalPowerWatts: estimatedResult({
      estimate: criticalPower.value.watts,
      unit: "watts",
      ...common,
    }),
    wPrimeJoules: estimatedResult({
      estimate: reserve.value.joules,
      unit: "joules",
      ...common,
    }),
  };
}
