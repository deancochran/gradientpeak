import { z } from "zod";

import {
  calculationReasonCodeSchema,
  calculationResultSchema,
} from "./calculation-result-contracts";

const MAX_PROJECTION_REASONS = 32;
const MAX_PROJECTION_SOURCES = 64;
const MAX_REASON_CODE_LENGTH = 64;
const MAX_SOURCE_ID_LENGTH = 256;

const resultWithUnit = (unit: string, range?: readonly [number, number]) =>
  calculationResultSchema.superRefine((result, context) => {
    if (result.reasonCodes.length > MAX_PROJECTION_REASONS)
      context.addIssue({ code: "custom", message: "Projection reasons exceed the maximum" });
    if (result.contributingSourceIds.length > MAX_PROJECTION_SOURCES)
      context.addIssue({ code: "custom", message: "Projection sources exceed the maximum" });
    if (result.reasonCodes.some((reason) => reason.length > MAX_REASON_CODE_LENGTH))
      context.addIssue({ code: "custom", message: "Projection reason is too long" });
    if (result.contributingSourceIds.some((sourceId) => sourceId.length > MAX_SOURCE_ID_LENGTH))
      context.addIssue({ code: "custom", message: "Projection source ID is too long" });
    if (result.estimate === null) return;
    if (result.unit !== unit)
      context.addIssue({ code: "custom", message: `Projection unit must be ${unit}` });
    if (range && (result.estimate < range[0] || result.estimate > range[1]))
      context.addIssue({
        code: "custom",
        message: `Projection value must be between ${range[0]} and ${range[1]}`,
      });
  });
const ratio = resultWithUnit("ratio", [0, 1]);
const dimensionMap = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const capabilityProjectionSchema = dimensionMap({
  aerobicCapacity: ratio,
  thresholdCapacity: ratio,
  enduranceCapacity: ratio,
  powerToWeightCapacity: ratio,
  movementEfficiency: ratio,
});
export const readinessProjectionSchema = dimensionMap({
  acuteReadiness: ratio,
  recoveryBalance: ratio,
  recentLoadTolerance: ratio,
});
export const feasibilityProjectionSchema = dimensionMap({
  availableTrainingTime: resultWithUnit("minutes", [0, Number.MAX_SAFE_INTEGER]),
  requiredTrainingLoad: resultWithUnit("training_load", [0, Number.MAX_SAFE_INTEGER]),
  sustainableLoadProgression: ratio,
  scheduleFit: ratio,
  routeDemandFit: ratio,
});
export const goalCoverageProjectionSchema = dimensionMap({
  distanceCoverage: ratio,
  durationCoverage: ratio,
  elevationCoverage: ratio,
  intensityCoverage: ratio,
});
export const opportunityProjectionSchema = dimensionMap({
  trainingOpportunity: ratio,
  evidenceOpportunity: ratio,
});

export const decisionGuidanceSchema = z
  .object({
    state: z.enum(["proceed", "adjust", "defer", "unknown"]),
    reasonCodes: z.array(calculationReasonCodeSchema).max(32),
    recommendedActions: z.array(z.string().min(1).max(160)).max(16),
    cautions: z.array(z.string().min(1).max(160)).max(16),
  })
  .strict();
export const athleteIntelligenceProjectionSchema = z
  .object({
    contractVersion: z.string().min(1).max(32),
    assessmentAsOf: z.string().datetime(),
    athleteId: z.string().min(1).max(128),
    capability: capabilityProjectionSchema,
    readiness: readinessProjectionSchema,
    feasibility: feasibilityProjectionSchema,
    goalCoverage: goalCoverageProjectionSchema,
    opportunities: opportunityProjectionSchema,
    decisionGuidance: decisionGuidanceSchema,
  })
  .strict();

export type CapabilityProjection = z.infer<typeof capabilityProjectionSchema>;
export type ReadinessProjection = z.infer<typeof readinessProjectionSchema>;
export type FeasibilityProjection = z.infer<typeof feasibilityProjectionSchema>;
export type GoalCoverageProjection = z.infer<typeof goalCoverageProjectionSchema>;
export type OpportunityProjection = z.infer<typeof opportunityProjectionSchema>;
export type DecisionGuidance = z.infer<typeof decisionGuidanceSchema>;
export type AthleteIntelligenceProjection = z.infer<typeof athleteIntelligenceProjectionSchema>;
