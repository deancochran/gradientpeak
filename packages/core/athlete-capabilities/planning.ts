import { z } from "zod";

import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import {
  ATHLETE_CAPABILITY_PLANNING_PROJECTION_VERSION,
  type AthleteCapabilityName,
  type AthleteCapabilityProfile,
  type AthleteCapabilityResult,
  athleteCapabilityMeasurementBasisSchema,
  athleteCapabilityNameSchema,
  athleteCapabilityProfileSchema,
  athleteCapabilityResultSchema,
  athleteCapabilityUnitSchema,
  availableAthleteCapabilityResultSchema,
  CAPABILITY_PLANNING_SELECTION_VERSION,
  type CategoryCapabilityProfile,
  partialAthleteCapabilityResultSchema,
} from "./contracts";

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);

export const capabilityPlanningDemandSourceSchema = z
  .object({
    kind: z.enum(["goal", "planning"]),
    sourceId: opaqueIdSchema,
    calculationVersion: calculationVersionSchema,
  })
  .strict();

export const capabilityPlanningDemandSchema = z
  .object({
    requirementId: opaqueIdSchema,
    source: capabilityPlanningDemandSourceSchema,
    capability: athleteCapabilityNameSchema,
    eligibleActivityCategories: z.array(canonicalActivityCategorySchema).min(1).max(5),
    unit: athleteCapabilityUnitSchema,
    measurementBasis: athleteCapabilityMeasurementBasisSchema,
    requiredValue: z.number().finite().positive(),
  })
  .strict()
  .superRefine((demand, context) => {
    if (
      new Set(demand.eligibleActivityCategories).size !== demand.eligibleActivityCategories.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["eligibleActivityCategories"],
        message: "Demand activity categories must be unique",
      });
    }
  });

export const capabilityPlanningSelectionContextSchema = z
  .object({
    contractVersion: z.literal(CAPABILITY_PLANNING_SELECTION_VERSION),
    athleteId: opaqueIdSchema,
    planningAsOf: dateTimeSchema,
    categoryPriority: z.array(canonicalActivityCategorySchema).min(1).max(5),
    demands: z.array(capabilityPlanningDemandSchema).min(1).max(64),
  })
  .strict()
  .superRefine((selection, context) => {
    if (new Set(selection.categoryPriority).size !== selection.categoryPriority.length) {
      context.addIssue({
        code: "custom",
        path: ["categoryPriority"],
        message: "Planning category priority must be unique",
      });
    }
    const requirementIds = selection.demands.map((demand) => demand.requirementId);
    if (new Set(requirementIds).size !== requirementIds.length) {
      context.addIssue({
        code: "custom",
        path: ["demands"],
        message: "Planning capability requirement IDs must be unique",
      });
    }
    const priority = new Set(selection.categoryPriority);
    selection.demands.forEach((demand, demandIndex) => {
      if (demand.eligibleActivityCategories.some((category) => !priority.has(category))) {
        context.addIssue({
          code: "custom",
          path: ["demands", demandIndex, "eligibleActivityCategories"],
          message: "Every eligible demand category must occur in explicit category priority",
        });
      }
    });
  });

export const capabilityPlanningReasonSchema = z.enum([
  "category_profile_missing",
  "capability_unavailable",
  "capability_partial",
  "capability_evidence_expired",
  "capability_unit_mismatch",
  "capability_measurement_mismatch",
  "no_compatible_capability",
]);

export const capabilityCandidateDiagnosticSchema = z
  .object({
    activityCategory: canonicalActivityCategorySchema,
    state: z.enum([
      "missing_profile",
      "available",
      "partial",
      "unavailable",
      "expired",
      "unit_mismatch",
      "measurement_mismatch",
    ]),
    unit: athleteCapabilityUnitSchema.nullable(),
    measurementBasis: athleteCapabilityMeasurementBasisSchema.nullable(),
    reasonCodes: z.array(z.string().trim().min(1).max(128)).max(64),
  })
  .strict();

export const capabilityGapComparisonSchema = z
  .object({
    state: z.enum(["meets_demand", "gap"]),
    capabilityValue: z.number().finite().nonnegative(),
    requiredValue: z.number().finite().positive(),
    unit: athleteCapabilityUnitSchema,
    absoluteGap: z.number().finite().nonnegative(),
    relativeGap: z.number().finite().min(0).max(1),
  })
  .strict();

const planningRequirementCommonShape = {
  demand: capabilityPlanningDemandSchema,
  candidateDiagnostics: z.array(capabilityCandidateDiagnosticSchema).min(1).max(5),
};

export const availableCapabilityPlanningRequirementSchema = z
  .object({
    status: z.literal("available"),
    selectedCapability: availableAthleteCapabilityResultSchema,
    freshnessAtPlanning: z.literal("current"),
    comparison: capabilityGapComparisonSchema,
    reasons: z.array(capabilityPlanningReasonSchema).max(0),
    ...planningRequirementCommonShape,
  })
  .strict();

export const partialCapabilityPlanningRequirementSchema = z
  .object({
    status: z.literal("partial"),
    selectedCapability: partialAthleteCapabilityResultSchema,
    freshnessAtPlanning: z.literal("current"),
    comparison: z.null(),
    reasons: z.array(capabilityPlanningReasonSchema).min(1),
    ...planningRequirementCommonShape,
  })
  .strict();

export const unavailableCapabilityPlanningRequirementSchema = z
  .object({
    status: z.literal("unavailable"),
    selectedCapability: athleteCapabilityResultSchema.nullable(),
    freshnessAtPlanning: z.enum(["expired", "unavailable"]),
    comparison: z.null(),
    reasons: z.array(capabilityPlanningReasonSchema).min(1),
    ...planningRequirementCommonShape,
  })
  .strict();

export const capabilityPlanningRequirementProjectionSchema = z.discriminatedUnion("status", [
  availableCapabilityPlanningRequirementSchema,
  partialCapabilityPlanningRequirementSchema,
  unavailableCapabilityPlanningRequirementSchema,
]);

export const capabilityLimiterItemSchema = z
  .object({
    requirementId: opaqueIdSchema,
    source: capabilityPlanningDemandSourceSchema,
    capability: athleteCapabilityNameSchema,
    activityCategory: canonicalActivityCategorySchema,
    unit: athleteCapabilityUnitSchema,
    measurementBasis: athleteCapabilityMeasurementBasisSchema,
    capabilityValue: z.number().finite().nonnegative(),
    requiredValue: z.number().finite().positive(),
    absoluteGap: z.number().finite().positive(),
    relativeGap: z.number().finite().positive().max(1),
  })
  .strict();

export const capabilityLimiterRankGroupSchema = z
  .object({
    rank: z.number().int().positive(),
    relativeGap: z.number().finite().positive().max(1),
    isTie: z.boolean(),
    limiters: z.array(capabilityLimiterItemSchema).min(1).max(64),
  })
  .strict()
  .superRefine((group, context) => {
    if (group.isTie !== group.limiters.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["isTie"],
        message: "Limiter tie state must match the rank-group cardinality",
      });
    }
    if (group.limiters.some((limiter) => limiter.relativeGap !== group.relativeGap)) {
      context.addIssue({
        code: "custom",
        path: ["limiters"],
        message: "Every limiter in a rank group must have the same continuous gap",
      });
    }
  });

export const capabilityDominantLimiterSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none"), requirementIds: z.array(opaqueIdSchema).max(0) }).strict(),
  z
    .object({ status: z.literal("single"), requirementIds: z.array(opaqueIdSchema).length(1) })
    .strict(),
  z
    .object({ status: z.literal("tie"), requirementIds: z.array(opaqueIdSchema).min(2).max(64) })
    .strict(),
  z
    .object({
      status: z.literal("indeterminate"),
      requirementIds: z.array(opaqueIdSchema).max(0),
    })
    .strict(),
]);

export const capabilityLimiterAssessmentSchema = z
  .object({
    evidenceStatus: z.enum(["complete", "partial", "unavailable"]),
    rankGroups: z.array(capabilityLimiterRankGroupSchema).max(64),
    dominantLimiter: capabilityDominantLimiterSchema,
    metRequirementIds: z.array(opaqueIdSchema).max(64),
    unassessedRequirementIds: z.array(opaqueIdSchema).max(64),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (
      assessment.evidenceStatus !== "complete" &&
      assessment.dominantLimiter.status !== "indeterminate"
    ) {
      context.addIssue({
        code: "custom",
        path: ["dominantLimiter"],
        message: "Incomplete evidence cannot claim a dominant limiter",
      });
    }
    if (
      assessment.evidenceStatus === "complete" &&
      assessment.dominantLimiter.status === "indeterminate"
    ) {
      context.addIssue({
        code: "custom",
        path: ["dominantLimiter"],
        message: "Complete evidence requires an explicit none, single, or tie disposition",
      });
    }
  });

export const athleteCapabilityPlanningProjectionSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_CAPABILITY_PLANNING_PROJECTION_VERSION),
    athleteId: opaqueIdSchema,
    planningAsOf: dateTimeSchema,
    profileAssessmentAsOf: dateTimeSchema,
    profileSourceCalculationFingerprints: z
      .array(z.string().regex(/^fnv1a-32:[0-9a-f]{8}$/))
      .max(5),
    selectionContext: capabilityPlanningSelectionContextSchema,
    requirements: z.array(capabilityPlanningRequirementProjectionSchema).min(1).max(64),
    limiterAssessment: capabilityLimiterAssessmentSchema,
    diagnostics: z.array(capabilityPlanningReasonSchema).max(16),
  })
  .strict()
  .superRefine((projection, context) => {
    if (
      projection.athleteId !== projection.selectionContext.athleteId ||
      projection.planningAsOf !== projection.selectionContext.planningAsOf
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectionContext"],
        message: "Planning projection must retain its selection identity",
      });
    }
  });

export const athleteCapabilityPlanningProjectionInputSchema = z
  .object({
    profile: athleteCapabilityProfileSchema,
    selectionContext: capabilityPlanningSelectionContextSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.profile.athleteId !== input.selectionContext.athleteId) {
      context.addIssue({
        code: "custom",
        path: ["selectionContext", "athleteId"],
        message: "Planning selection must belong to the capability-profile athlete",
      });
    }
    if (
      Date.parse(input.selectionContext.planningAsOf) < Date.parse(input.profile.assessmentAsOf)
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectionContext", "planningAsOf"],
        message: "Planning cannot use a capability profile assessed in the future",
      });
    }
  });

export type CapabilityPlanningDemand = z.infer<typeof capabilityPlanningDemandSchema>;
export type CapabilityPlanningSelectionContext = z.infer<
  typeof capabilityPlanningSelectionContextSchema
>;
export type CapabilityPlanningRequirementProjection = z.infer<
  typeof capabilityPlanningRequirementProjectionSchema
>;
export type AthleteCapabilityPlanningProjection = z.infer<
  typeof athleteCapabilityPlanningProjectionSchema
>;
export type AthleteCapabilityPlanningProjectionInput = z.infer<
  typeof athleteCapabilityPlanningProjectionInputSchema
>;

function capabilityFor(
  profile: CategoryCapabilityProfile,
  capability: AthleteCapabilityName,
): AthleteCapabilityResult {
  if (capability === "shortDurationCapacity") return profile.shortDurationCapacity;
  if (capability === "anaerobicReserve") return profile.anaerobicReserve;
  if (capability === "thresholdCapacity") return profile.thresholdCapacity;
  if (capability === "longDurationCapacity") return profile.longDurationCapacity;
  if (capability === "durationRetention") return profile.durationRetention;
  return profile.repeatedEffortRecovery;
}

function sourceReasonCodes(result: AthleteCapabilityResult): string[] {
  return [
    ...new Set([
      ...result.reasons,
      ...result.sources.concepts.flatMap((concept) => concept.reasonCodes),
    ]),
  ];
}

function planningEvidenceExpired(result: AthleteCapabilityResult, planningAsOf: string): boolean {
  return (
    result.freshness.expiresAt !== null &&
    Date.parse(planningAsOf) > Date.parse(result.freshness.expiresAt)
  );
}

function roundGap(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

type Candidate = {
  result: AthleteCapabilityResult;
  activityCategory: z.infer<typeof canonicalActivityCategorySchema>;
};

function projectRequirement(input: {
  profile: AthleteCapabilityProfile;
  selection: CapabilityPlanningSelectionContext;
  demand: CapabilityPlanningDemand;
}): CapabilityPlanningRequirementProjection {
  const profileByCategory = new Map(
    input.profile.categoryProfiles.map((profile) => [profile.activityCategory, profile]),
  );
  const eligible = new Set(input.demand.eligibleActivityCategories);
  const orderedCategories = input.selection.categoryPriority.filter((category) =>
    eligible.has(category),
  );
  const diagnostics: z.infer<typeof capabilityCandidateDiagnosticSchema>[] = [];
  let selectedAvailable: Candidate | null = null;
  let selectedPartial: Candidate | null = null;
  let selectedUnavailable: Candidate | null = null;

  for (const activityCategory of orderedCategories) {
    const categoryProfile = profileByCategory.get(activityCategory);
    if (categoryProfile === undefined) {
      diagnostics.push({
        activityCategory,
        state: "missing_profile",
        unit: null,
        measurementBasis: null,
        reasonCodes: ["category_profile_missing"],
      });
      continue;
    }
    const result = capabilityFor(categoryProfile, input.demand.capability);
    const common = {
      activityCategory,
      unit: result.unit,
      measurementBasis: result.measurementBasis,
      reasonCodes: sourceReasonCodes(result),
    };
    if (result.status === "unavailable") {
      diagnostics.push({ ...common, state: "unavailable" });
      if (selectedUnavailable === null) selectedUnavailable = { result, activityCategory };
      continue;
    }
    if (planningEvidenceExpired(result, input.selection.planningAsOf)) {
      diagnostics.push({ ...common, state: "expired" });
      if (selectedUnavailable === null) selectedUnavailable = { result, activityCategory };
      continue;
    }
    if (result.unit !== input.demand.unit) {
      diagnostics.push({ ...common, state: "unit_mismatch" });
      continue;
    }
    if (result.measurementBasis !== input.demand.measurementBasis) {
      diagnostics.push({ ...common, state: "measurement_mismatch" });
      continue;
    }
    if (result.status === "partial") {
      diagnostics.push({ ...common, state: "partial" });
      if (selectedPartial === null) selectedPartial = { result, activityCategory };
      continue;
    }
    diagnostics.push({ ...common, state: "available" });
    if (selectedAvailable === null) selectedAvailable = { result, activityCategory };
  }

  if (selectedAvailable !== null && selectedAvailable.result.status === "available") {
    const result = selectedAvailable.result;
    const unroundedAbsoluteGap = Math.max(0, input.demand.requiredValue - result.value);
    const absoluteGap = roundGap(unroundedAbsoluteGap);
    const relativeGap = roundGap(unroundedAbsoluteGap / input.demand.requiredValue);
    return availableCapabilityPlanningRequirementSchema.parse({
      status: "available",
      demand: input.demand,
      selectedCapability: result,
      freshnessAtPlanning: "current",
      comparison: {
        state: absoluteGap > 0 && relativeGap > 0 ? "gap" : "meets_demand",
        capabilityValue: result.value,
        requiredValue: input.demand.requiredValue,
        unit: input.demand.unit,
        absoluteGap,
        relativeGap,
      },
      candidateDiagnostics: diagnostics,
      reasons: [],
    });
  }

  if (selectedPartial !== null && selectedPartial.result.status === "partial") {
    return partialCapabilityPlanningRequirementSchema.parse({
      status: "partial",
      demand: input.demand,
      selectedCapability: selectedPartial.result,
      freshnessAtPlanning: "current",
      comparison: null,
      candidateDiagnostics: diagnostics,
      reasons: ["capability_partial"],
    });
  }

  const states = new Set(diagnostics.map((diagnostic) => diagnostic.state));
  const reasons: z.infer<typeof capabilityPlanningReasonSchema>[] = [];
  if (states.has("expired")) reasons.push("capability_evidence_expired");
  if (states.has("unit_mismatch")) reasons.push("capability_unit_mismatch");
  if (states.has("measurement_mismatch")) reasons.push("capability_measurement_mismatch");
  if (states.has("unavailable")) reasons.push("capability_unavailable");
  if (states.has("missing_profile")) reasons.push("category_profile_missing");
  if (reasons.length === 0) reasons.push("no_compatible_capability");
  const selected = selectedUnavailable?.result ?? null;
  return unavailableCapabilityPlanningRequirementSchema.parse({
    status: "unavailable",
    demand: input.demand,
    selectedCapability: selected,
    freshnessAtPlanning: states.has("expired") ? "expired" : "unavailable",
    comparison: null,
    candidateDiagnostics: diagnostics,
    reasons,
  });
}

function limiterAssessment(requirements: readonly CapabilityPlanningRequirementProjection[]) {
  const available = requirements.filter((requirement) => requirement.status === "available");
  const unassessedRequirementIds = requirements
    .filter((requirement) => requirement.status !== "available")
    .map((requirement) => requirement.demand.requirementId)
    .sort((left, right) => left.localeCompare(right));
  const metRequirementIds = available
    .filter((requirement) => requirement.comparison.state === "meets_demand")
    .map((requirement) => requirement.demand.requirementId)
    .sort((left, right) => left.localeCompare(right));
  const limiters = available
    .filter((requirement) => requirement.comparison.state === "gap")
    .map((requirement) => ({
      requirementId: requirement.demand.requirementId,
      source: requirement.demand.source,
      capability: requirement.demand.capability,
      activityCategory: requirement.selectedCapability.activityCategory,
      unit: requirement.demand.unit,
      measurementBasis: requirement.demand.measurementBasis,
      capabilityValue: requirement.comparison.capabilityValue,
      requiredValue: requirement.comparison.requiredValue,
      absoluteGap: requirement.comparison.absoluteGap,
      relativeGap: requirement.comparison.relativeGap,
    }))
    .sort(
      (left, right) =>
        right.relativeGap - left.relativeGap ||
        left.requirementId.localeCompare(right.requirementId),
    );
  const rankGroups: z.infer<typeof capabilityLimiterRankGroupSchema>[] = [];
  for (const limiter of limiters) {
    const current = rankGroups.at(-1);
    if (current !== undefined && current.relativeGap === limiter.relativeGap) {
      current.limiters.push(limiter);
      current.isTie = true;
      continue;
    }
    rankGroups.push({
      rank: rankGroups.length + 1,
      relativeGap: limiter.relativeGap,
      isTie: false,
      limiters: [limiter],
    });
  }

  const evidenceStatus =
    available.length === 0
      ? "unavailable"
      : unassessedRequirementIds.length > 0
        ? "partial"
        : "complete";
  const firstRank = rankGroups[0];
  const dominantLimiter =
    evidenceStatus !== "complete"
      ? { status: "indeterminate", requirementIds: [] }
      : firstRank === undefined
        ? { status: "none", requirementIds: [] }
        : firstRank.limiters.length > 1
          ? {
              status: "tie",
              requirementIds: firstRank.limiters.map((limiter) => limiter.requirementId),
            }
          : {
              status: "single",
              requirementIds: firstRank.limiters.map((limiter) => limiter.requirementId),
            };

  return capabilityLimiterAssessmentSchema.parse({
    evidenceStatus,
    rankGroups,
    dominantLimiter,
    metRequirementIds,
    unassessedRequirementIds,
  });
}

/**
 * Selects, compares, and ranks only exact compatible current capabilities.
 * Partial, expired, missing, or unit-incompatible candidates never receive a
 * fabricated value and cannot become a planning limiter.
 */
export function projectAthleteCapabilitiesForPlanning(
  input: AthleteCapabilityPlanningProjectionInput,
): AthleteCapabilityPlanningProjection {
  const parsed = athleteCapabilityPlanningProjectionInputSchema.parse(input);
  const requirements = parsed.selectionContext.demands.map((demand) =>
    projectRequirement({
      profile: parsed.profile,
      selection: parsed.selectionContext,
      demand,
    }),
  );
  const diagnostics = [
    ...new Set(
      requirements.flatMap((requirement) =>
        requirement.status === "available" ? [] : requirement.reasons,
      ),
    ),
  ];
  return athleteCapabilityPlanningProjectionSchema.parse({
    contractVersion: ATHLETE_CAPABILITY_PLANNING_PROJECTION_VERSION,
    athleteId: parsed.profile.athleteId,
    planningAsOf: parsed.selectionContext.planningAsOf,
    profileAssessmentAsOf: parsed.profile.assessmentAsOf,
    profileSourceCalculationFingerprints:
      parsed.profile.calculationIdentity.sourceCalculationFingerprints,
    selectionContext: parsed.selectionContext,
    requirements,
    limiterAssessment: limiterAssessment(requirements),
    diagnostics,
  });
}
