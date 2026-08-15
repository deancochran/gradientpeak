import { z } from "zod";

import { bestEffortMetricSchema } from "../calculations/best-efforts";
import {
  THRESHOLD_PLAUSIBILITY_VERSION,
  THRESHOLD_POLICY_SCHEMA_VERSION,
  THRESHOLD_POLICY_VERSION,
  type ThresholdActivityCategory,
  thresholdActivityCategorySchema,
  thresholdMethodSchema,
  thresholdMetricSchema,
  thresholdPlausibilityVersionSchema,
  thresholdPolicySchemaVersionSchema,
  thresholdPolicyVersionSchema,
  thresholdUnitSchema,
} from "./threshold-contracts";

export const thresholdActivityCategoryPolicySchema = z
  .object({
    schemaVersion: thresholdPolicySchemaVersionSchema,
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    method: thresholdMethodSchema,
    policyVersion: thresholdPolicyVersionSchema,
    plausibilityVersion: thresholdPlausibilityVersionSchema,
    seriesSelection: z
      .object({
        preferred: bestEffortMetricSchema,
        fallback: bestEffortMetricSchema.nullable(),
      })
      .strict(),
    exactWindowSeconds: z.number().int().positive(),
    conversionFactor: z.number().finite().positive(),
    requiredWindowCoverage: z.number().finite().min(0.9).max(1),
    maximumGapSeconds: z.number().finite().positive(),
    plausibleThreshold: z
      .object({ minimum: z.number().finite().positive(), maximum: z.number().finite().positive() })
      .strict(),
    consistencyRelativeTolerance: z.number().finite().positive().max(0.25),
    materialChangeRelativeThreshold: z.number().finite().positive().max(0.25),
    confirmationEvidenceCount: z.literal(2),
    confirmationWindowDays: z.number().int().positive(),
    decreaseEvidenceCount: z.literal(2),
    decreaseWindowDays: z.number().int().positive(),
    freshnessDays: z.number().int().positive(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.plausibleThreshold.minimum >= policy.plausibleThreshold.maximum) {
      context.addIssue({
        code: "custom",
        path: ["plausibleThreshold"],
        message: "Threshold plausibility minimum must be below its maximum",
      });
    }
    const expectedUnit = policy.metric === "power" ? "watts" : "meters_per_second";
    if (policy.unit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Threshold policy unit mismatch",
      });
    }
  });

export const thresholdActivityCategoryPoliciesSchema = z
  .array(thresholdActivityCategoryPolicySchema)
  .length(3)
  .superRefine((policies, context) => {
    if (
      new Set(policies.map(({ activityCategory }) => activityCategory)).size !== policies.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Threshold activity-category policies must be unique",
      });
    }
  });

export type ThresholdActivityCategoryPolicy = z.infer<typeof thresholdActivityCategoryPolicySchema>;

export const thresholdActivityCategoryPolicies: readonly ThresholdActivityCategoryPolicy[] =
  Object.freeze(
    thresholdActivityCategoryPoliciesSchema.parse([
      {
        schemaVersion: THRESHOLD_POLICY_SCHEMA_VERSION,
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        method: "bike_power_30m",
        policyVersion: THRESHOLD_POLICY_VERSION,
        plausibilityVersion: THRESHOLD_PLAUSIBILITY_VERSION,
        seriesSelection: { preferred: "power", fallback: null },
        exactWindowSeconds: 1_800,
        conversionFactor: 0.95,
        requiredWindowCoverage: 0.95,
        maximumGapSeconds: 10,
        plausibleThreshold: { minimum: 50, maximum: 2_000 },
        consistencyRelativeTolerance: 0.03,
        materialChangeRelativeThreshold: 0.03,
        confirmationEvidenceCount: 2,
        confirmationWindowDays: 42,
        decreaseEvidenceCount: 2,
        decreaseWindowDays: 56,
        freshnessDays: 90,
      },
      {
        schemaVersion: THRESHOLD_POLICY_SCHEMA_VERSION,
        activityCategory: "run",
        metric: "speed",
        unit: "meters_per_second",
        method: "run_speed_30m",
        policyVersion: THRESHOLD_POLICY_VERSION,
        plausibilityVersion: THRESHOLD_PLAUSIBILITY_VERSION,
        seriesSelection: { preferred: "grade_adjusted_speed", fallback: "speed" },
        exactWindowSeconds: 1_800,
        conversionFactor: 1,
        requiredWindowCoverage: 0.95,
        maximumGapSeconds: 10,
        plausibleThreshold: { minimum: 0.5, maximum: 12 },
        consistencyRelativeTolerance: 0.03,
        materialChangeRelativeThreshold: 0.03,
        confirmationEvidenceCount: 2,
        confirmationWindowDays: 42,
        decreaseEvidenceCount: 2,
        decreaseWindowDays: 56,
        freshnessDays: 90,
      },
      {
        schemaVersion: THRESHOLD_POLICY_SCHEMA_VERSION,
        activityCategory: "swim",
        metric: "speed",
        unit: "meters_per_second",
        method: "swim_speed_15m",
        policyVersion: THRESHOLD_POLICY_VERSION,
        plausibilityVersion: THRESHOLD_PLAUSIBILITY_VERSION,
        seriesSelection: { preferred: "speed", fallback: null },
        exactWindowSeconds: 900,
        conversionFactor: 1,
        requiredWindowCoverage: 0.95,
        maximumGapSeconds: 10,
        plausibleThreshold: { minimum: 0.25, maximum: 3 },
        consistencyRelativeTolerance: 0.03,
        materialChangeRelativeThreshold: 0.03,
        confirmationEvidenceCount: 2,
        confirmationWindowDays: 42,
        decreaseEvidenceCount: 2,
        decreaseWindowDays: 56,
        freshnessDays: 90,
      },
    ]),
  );

export function getThresholdActivityCategoryPolicy(
  activityCategory: ThresholdActivityCategory,
): ThresholdActivityCategoryPolicy {
  const policy = thresholdActivityCategoryPolicies.find(
    (candidate) => candidate.activityCategory === activityCategory,
  );
  if (policy === undefined) {
    throw new Error(`Threshold policy is unavailable for ${activityCategory}`);
  }
  return policy;
}
