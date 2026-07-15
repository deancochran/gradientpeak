import { z } from "zod";

import {
  calculationReasonCodeSchema,
  calculationResultSchema,
} from "./calculation-result-contracts";
import { goalDemandPolicyV1ResultSchema } from "./policies/goal-demand";
import { trainingFeasibilityResultsSchema } from "./policies/training-feasibility";

export const ATHLETE_INTELLIGENCE_PROJECTION_VERSION =
  "athlete-intelligence-projection-v1" as const;

const boundedResultSchema = calculationResultSchema.superRefine((result, context) => {
  if (result.reasonCodes.length > 32)
    context.addIssue({ code: "custom", message: "Projection reasons exceed the maximum" });
  if (result.contributingSourceIds.length > 64)
    context.addIssue({ code: "custom", message: "Projection sources exceed the maximum" });
  if (result.reasonCodes.some((reason) => reason.length > 64))
    context.addIssue({ code: "custom", message: "Projection reason is too long" });
  if (result.contributingSourceIds.some((sourceId) => sourceId.length > 256))
    context.addIssue({ code: "custom", message: "Projection source ID is too long" });
});

const unavailableCapabilityDefault = {
  state: "insufficient_evidence" as const,
  estimate: null,
  unit: null,
  uncertainty: 1,
  missingDataState: "required_data_missing" as const,
  reasonCodes: ["capability_evidence_missing"],
  contributingSourceIds: [],
};

const effortCapabilitySchema = z
  .object({
    goalSourceId: z.string().min(1).max(256),
    threshold: boundedResultSchema,
    highIntensity: boundedResultSchema,
  })
  .strict();

export const capabilityProjectionSchema = z
  .object({
    ftp: boundedResultSchema,
    runningThresholdPace: boundedResultSchema.default(unavailableCapabilityDefault),
    swimmingCss: boundedResultSchema.default(unavailableCapabilityDefault),
    criticalPowerWatts: boundedResultSchema.default(unavailableCapabilityDefault),
    wPrimeJoules: boundedResultSchema.default(unavailableCapabilityDefault),
    wattsPerKilogram: boundedResultSchema,
    heartRateReserve: boundedResultSchema,
    effortCurves: z.array(effortCapabilitySchema).max(32),
    enduranceRecencyWeightedMinutes: boundedResultSchema,
    durabilityBaselineRatio: boundedResultSchema,
    sportSpecificity: boundedResultSchema,
  })
  .strict();

export const readinessProjectionSchema = z
  .object({
    volumeTrend: boundedResultSchema,
    frequencyTrend: boundedResultSchema,
    recoveryContext: boundedResultSchema,
  })
  .strict();

export const coverageDimensionSchema = z
  .object({
    dimension: z.enum(["threshold", "speed", "distance", "duration", "frequency"]),
    requirement: boundedResultSchema,
    capability: boundedResultSchema,
    coverage: boundedResultSchema,
    physicalGap: boundedResultSchema,
  })
  .strict();

export const goalCoverageProjectionSchema = z
  .object({
    goalSourceId: z.string().min(1).max(256),
    demand: goalDemandPolicyV1ResultSchema,
    dimensions: z.array(coverageDimensionSchema).max(8),
  })
  .strict();

export const trainingOpportunitySchema = z
  .object({
    goalSourceId: z.string().min(1).max(256),
    dimension: coverageDimensionSchema.shape.dimension,
    physicalGap: boundedResultSchema,
  })
  .strict();

export const evidenceOpportunitySchema = z
  .object({
    goalSourceId: z.string().min(1).max(256),
    dimension: coverageDimensionSchema.shape.dimension.nullable(),
    reasonCodes: z.array(calculationReasonCodeSchema).min(1).max(32),
  })
  .strict();

export const opportunityProjectionSchema = z
  .object({
    training: z.array(trainingOpportunitySchema).max(256),
    evidence: z.array(evidenceOpportunitySchema).max(256),
  })
  .strict();

export const decisionGuidanceSchema = z
  .object({
    state: z.enum(["proceed", "adjust", "unknown"]),
    reasonCodes: z.array(calculationReasonCodeSchema).max(32),
    recommendedActions: z.array(z.string().min(1).max(160)).max(16),
    cautions: z.array(z.string().min(1).max(160)).max(16),
  })
  .strict();

export const athleteIntelligenceProjectionSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_INTELLIGENCE_PROJECTION_VERSION),
    assessmentAsOf: z.string().datetime(),
    athleteId: z.string().min(1).max(128),
    capability: capabilityProjectionSchema,
    readiness: readinessProjectionSchema,
    feasibility: trainingFeasibilityResultsSchema,
    goalCoverage: z.array(goalCoverageProjectionSchema).max(32),
    opportunities: opportunityProjectionSchema,
    decisionGuidance: decisionGuidanceSchema,
  })
  .strict();

export type CapabilityProjection = z.infer<typeof capabilityProjectionSchema>;
export type ReadinessProjection = z.infer<typeof readinessProjectionSchema>;
export type FeasibilityProjection = z.infer<typeof trainingFeasibilityResultsSchema>;
export type GoalCoverageProjection = z.infer<typeof goalCoverageProjectionSchema>;
export type OpportunityProjection = z.infer<typeof opportunityProjectionSchema>;
export type DecisionGuidance = z.infer<typeof decisionGuidanceSchema>;
export type AthleteIntelligenceProjection = z.infer<typeof athleteIntelligenceProjectionSchema>;
