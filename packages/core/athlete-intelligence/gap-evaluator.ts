import { fingerprintCanonicalJson } from "./canonical-json";
import {
  ATHLETE_INTELLIGENCE_VERSION,
  type CapabilityAssessment,
  type Confidence,
  type GoalGapAssessment,
  type GoalRequirementSet,
  goalGapAssessmentSchema,
  intelligenceDimensions,
} from "./contracts";

function confidenceForDimension(input: {
  capabilityConfidence: Confidence;
  hasEvidence: boolean;
}): Confidence {
  if (!input.hasEvidence) {
    return {
      score: 0,
      level: "low",
      reasons: ["Capability evidence is missing; no gap was inferred."],
    };
  }

  return input.capabilityConfidence;
}

/** Evaluates goal gaps while preserving absent capability evidence as unknown. */
export function evaluateGoalGaps(input: {
  requirements: GoalRequirementSet;
  capabilities: CapabilityAssessment;
}): GoalGapAssessment {
  const dimensions = Object.fromEntries(
    intelligenceDimensions.map((dimension) => {
      const requirement = input.requirements.requirements[dimension];
      const evidence = input.capabilities.capabilities[dimension];
      const capability = evidence?.value ?? null;

      if (capability === null) {
        return [
          dimension,
          {
            requirement,
            capability: null,
            gap: null,
            status: "missing_evidence",
            confidence: confidenceForDimension({
              capabilityConfidence: evidence?.confidence ?? input.capabilities.confidence,
              hasEvidence: false,
            }),
          },
        ];
      }

      const gap = Math.max(0, requirement - capability);
      return [
        dimension,
        {
          requirement,
          capability,
          gap,
          status: gap === 0 ? "met" : "gap",
          confidence: confidenceForDimension({
            capabilityConfidence: evidence.confidence,
            hasEvidence: true,
          }),
        },
      ];
    }),
  );

  const hasMissingEvidence = intelligenceDimensions.some(
    (dimension) => input.capabilities.capabilities[dimension]?.value == null,
  );
  const inputFingerprint = fingerprintCanonicalJson({
    requirements: input.requirements,
    capabilities: input.capabilities,
  });

  return goalGapAssessmentSchema.parse({
    version: ATHLETE_INTELLIGENCE_VERSION,
    goalId: input.requirements.goalId,
    dimensions,
    confidence: hasMissingEvidence
      ? {
          score: 0,
          level: "low",
          reasons: ["One or more capability dimensions have no evidence."],
        }
      : input.capabilities.confidence,
    provenance: {
      source: "gap_evaluation",
      asOf: input.capabilities.assessedAt,
      inputFingerprint,
      notes: hasMissingEvidence ? ["Missing evidence is represented as unknown, not zero."] : [],
    },
  });
}
