import { z } from "zod";

export const ATHLETE_INTELLIGENCE_VERSION = "1" as const;

export const intelligenceDimensionSchema = z.enum([
  "endurance",
  "threshold",
  "high_intensity",
  "durability",
  "technical",
  "specificity",
]);

export type IntelligenceDimension = z.infer<typeof intelligenceDimensionSchema>;

export const intelligenceDimensions = [
  "endurance",
  "threshold",
  "high_intensity",
  "durability",
  "technical",
  "specificity",
] as const satisfies readonly IntelligenceDimension[];

export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);

export const confidenceSchema = z
  .object({
    score: z.number().min(0).max(1),
    level: confidenceLevelSchema,
    reasons: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type Confidence = z.infer<typeof confidenceSchema>;

export const provenanceSourceSchema = z.enum([
  "athlete_input",
  "goal_demand_profile",
  "capability_assessment",
  "gap_evaluation",
]);

export const provenanceSchema = z
  .object({
    source: provenanceSourceSchema,
    asOf: z.string().datetime(),
    inputFingerprint: z.string().min(1),
    notes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type Provenance = z.infer<typeof provenanceSchema>;

export const intelligenceDimensionValuesSchema = z
  .object({
    endurance: z.number().min(0).max(1),
    threshold: z.number().min(0).max(1),
    high_intensity: z.number().min(0).max(1),
    durability: z.number().min(0).max(1),
    technical: z.number().min(0).max(1),
    specificity: z.number().min(0).max(1),
  })
  .strict();

export type IntelligenceDimensionValues = z.infer<typeof intelligenceDimensionValuesSchema>;

export const capabilityEvidenceSchema = z
  .object({
    value: z.number().min(0).max(1).nullable(),
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;

export const athleteStateSnapshotSchema = z
  .object({
    version: z.literal(ATHLETE_INTELLIGENCE_VERSION),
    athleteId: z.string().min(1),
    asOf: z.string().datetime(),
    capabilities: z.record(intelligenceDimensionSchema, capabilityEvidenceSchema),
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type AthleteStateSnapshot = z.infer<typeof athleteStateSnapshotSchema>;

export const goalRequirementSetSchema = z
  .object({
    version: z.literal(ATHLETE_INTELLIGENCE_VERSION),
    goalId: z.string().uuid(),
    activityCategory: z.string().min(1),
    requirements: intelligenceDimensionValuesSchema,
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type GoalRequirementSet = z.infer<typeof goalRequirementSetSchema>;

export const capabilityAssessmentSchema = z
  .object({
    version: z.literal(ATHLETE_INTELLIGENCE_VERSION),
    athleteId: z.string().min(1),
    assessedAt: z.string().datetime(),
    capabilities: z.record(intelligenceDimensionSchema, capabilityEvidenceSchema),
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type CapabilityAssessment = z.infer<typeof capabilityAssessmentSchema>;

export const goalGapStatusSchema = z.enum(["met", "gap", "missing_evidence"]);

export const goalGapDimensionSchema = z
  .object({
    requirement: z.number().min(0).max(1),
    capability: z.number().min(0).max(1).nullable(),
    gap: z.number().min(0).max(1).nullable(),
    status: goalGapStatusSchema,
    confidence: confidenceSchema,
  })
  .strict()
  .superRefine((dimension, ctx) => {
    if (dimension.capability === null) {
      if (dimension.gap !== null || dimension.status !== "missing_evidence") {
        ctx.addIssue({
          code: "custom",
          message: "Missing capability evidence must have null gap and missing_evidence status",
        });
      }

      return;
    }

    const expectedGap = Math.max(0, dimension.requirement - dimension.capability);
    if (dimension.gap !== expectedGap) {
      ctx.addIssue({
        code: "custom",
        message: "Gap must equal max(0, requirement - capability)",
      });
    }

    const expectedStatus = expectedGap === 0 ? "met" : "gap";
    if (dimension.status !== expectedStatus) {
      ctx.addIssue({
        code: "custom",
        message: `Status must be ${expectedStatus} for the calculated gap`,
      });
    }
  });

export const goalGapAssessmentSchema = z
  .object({
    version: z.literal(ATHLETE_INTELLIGENCE_VERSION),
    goalId: z.string().uuid(),
    dimensions: z.record(intelligenceDimensionSchema, goalGapDimensionSchema),
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type GoalGapAssessment = z.infer<typeof goalGapAssessmentSchema>;

export const predictionEnvelopeSchema = z
  .object({
    version: z.literal(ATHLETE_INTELLIGENCE_VERSION),
    inputFingerprint: z.string().min(1),
    generatedAt: z.string().datetime(),
    athleteState: athleteStateSnapshotSchema,
    goalRequirements: goalRequirementSetSchema,
    capabilityAssessment: capabilityAssessmentSchema,
    goalGapAssessment: goalGapAssessmentSchema,
    confidence: confidenceSchema,
    provenance: provenanceSchema,
  })
  .strict();

export type PredictionEnvelope = z.infer<typeof predictionEnvelopeSchema>;
