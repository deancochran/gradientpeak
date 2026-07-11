import type { CanonicalSport } from "../schemas/sport";
import {
  type CalculationEligibleEvidence,
  type EvidenceExclusionReasonCode,
  type EvidenceItem,
  evidenceItemSchema,
  resolveEvidenceEligibility,
} from "./evidence-contracts";
import type { LineageGroupId, SourceId } from "./lineage";

export type EvidenceFieldEligibilityReasonCode =
  | EvidenceExclusionReasonCode
  | "evidence_sport_missing"
  | "evidence_incompatible_sport";

/** Evidence metadata required to allow one raw numeric field into a calculation. */
export interface FieldEvidenceEligibilityInput {
  evidence: EvidenceItem;
  asOf: string;
  requiredSport?: CanonicalSport;
}

export type FieldEvidenceEligibility =
  | {
      eligible: true;
      evidence: CalculationEligibleEvidence;
      sourceId: SourceId;
      lineageGroupId: LineageGroupId;
    }
  | {
      eligible: false;
      sourceId: SourceId;
      lineageGroupId: LineageGroupId;
      reasonCode: EvidenceFieldEligibilityReasonCode;
    };

/**
 * Resolves whether a raw field may affect a calculation. It never transforms
 * the raw field value: callers retain their observation and use this only as a gate.
 */
export function resolveFieldEvidenceEligibility(
  input: FieldEvidenceEligibilityInput,
): FieldEvidenceEligibility {
  const evidence = evidenceItemSchema.parse(input.evidence);
  const eligibility = resolveEvidenceEligibility({ evidence, asOf: input.asOf });

  if (!eligibility.eligible) {
    return {
      eligible: false,
      sourceId: evidence.sourceId,
      lineageGroupId: evidence.lineageGroupId,
      reasonCode: eligibility.reasonCode,
    };
  }

  if (input.requiredSport !== undefined && evidence.sport === null) {
    return {
      eligible: false,
      sourceId: evidence.sourceId,
      lineageGroupId: evidence.lineageGroupId,
      reasonCode: "evidence_sport_missing",
    };
  }

  if (input.requiredSport !== undefined && evidence.sport !== input.requiredSport) {
    return {
      eligible: false,
      sourceId: evidence.sourceId,
      lineageGroupId: evidence.lineageGroupId,
      reasonCode: "evidence_incompatible_sport",
    };
  }

  return {
    eligible: true,
    evidence: eligibility.evidence,
    sourceId: evidence.sourceId,
    lineageGroupId: evidence.lineageGroupId,
  };
}
