import { z } from "zod";

import {
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceConfidenceSchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
  durationPerformanceSourceEvidenceIdsSchema,
} from "../duration-performance/contracts";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

export const ATHLETE_CAPABILITY_PROFILE_VERSION = "athlete-capability-profile-v1";
export const CATEGORY_CAPABILITY_PROFILE_VERSION = "category-capability-profile-v1";
export const ATHLETE_CAPABILITY_COMPOSITION_VERSION = "athlete-capability-composition-v1";
export const CAPABILITY_PLANNING_SELECTION_VERSION = "capability-planning-selection-v1";
export const ATHLETE_CAPABILITY_PLANNING_PROJECTION_VERSION =
  "athlete-capability-planning-projection-v1";

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);

export const athleteCapabilityNameSchema = z.enum([
  "shortDurationCapacity",
  "anaerobicReserve",
  "thresholdCapacity",
  "longDurationCapacity",
  "durationRetention",
  "repeatedEffortRecovery",
]);

export const athleteCapabilityUnitSchema = z.enum([
  "watts",
  "joules",
  "meters",
  "meters_per_second",
  "ratio",
]);

/**
 * A basis is part of compatibility. Equal numbers or equal units do not make
 * different tests, models, durations, or protocols interchangeable.
 */
export const athleteCapabilityMeasurementBasisSchema = z.enum([
  "cycling_60_second_maximal_mean_power",
  "cycling_gradientpeak_reserve",
  "cycling_planning_threshold_power_anchor",
  "cycling_3600_second_maximal_mean_power",
  "cycling_1200_to_3600_duration_retention",
  "cycling_fixed_work_recovery_fraction",
  "running_60_second_maximal_mean_speed",
  "running_gradientpeak_distance_reserve",
  "running_planning_threshold_pace_anchor",
  "running_3600_second_maximal_mean_speed",
  "running_1200_to_3600_duration_retention",
  "swimming_pool_60_second_maximal_mean_speed",
  "swimming_1800_second_long_duration_speed",
  "swimming_fixed_distance_repeat_speed_retention",
  "strength_fixed_resistance_repetition_retention",
]);

export const athleteCapabilitySourceConceptSchema = z.enum([
  "cycling_short_duration_capacity",
  "cycling_gradientpeak_reserve",
  "cycling_threshold_capacity",
  "cycling_long_duration_capacity",
  "cycling_duration_retention",
  "cycling_repeated_effort_recovery",
  "running_speed_pace_curve",
  "running_distance_reserve",
  "running_planning_threshold_pace",
  "running_duration_retention",
  "swimming_sprint_capacity",
  "swimming_aerobic_capacity",
  "swimming_repeated_effort_decay",
  "strength_repeatability",
  "other_repeatability",
]);

export const athleteCapabilityReasonSchema = z.enum([
  "source_concept_partial",
  "source_concept_unavailable",
  "source_value_missing",
  "source_activity_identity_missing",
  "source_evidence_expired",
  "source_concept_not_produced",
  "unsupported_category_capability",
  "source_concept_not_semantically_compatible",
]);

const sourceReasonCodeSchema = z.string().trim().min(1).max(128);

export const athleteCapabilitySourceConceptReferenceSchema = z
  .object({
    concept: athleteCapabilitySourceConceptSchema,
    calculationVersion: calculationVersionSchema,
    status: z.enum(["available", "partial", "unavailable"]),
    reasonCodes: z.array(sourceReasonCodeSchema).max(32),
    confidence: durationPerformanceConfidenceSchema,
    evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
    expiresAt: dateTimeSchema.nullable(),
    recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.status === "available" && source.reasonCodes.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["reasonCodes"],
        message: "Available source concepts cannot carry source reasons",
      });
    }
    if (source.status !== "available" && source.reasonCodes.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["reasonCodes"],
        message: "Partial or unavailable source concepts require a source reason",
      });
    }
    if (
      source.status === "available" &&
      (source.confidence === "unavailable" ||
        source.evidenceCoverage.state !== "complete" ||
        source.expiresAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Available source concepts require complete, current evidence metadata",
      });
    }
    if (
      source.status === "partial" &&
      (source.confidence === "unavailable" ||
        source.evidenceCoverage.state !== "partial" ||
        source.expiresAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Partial source concepts require partial evidence metadata",
      });
    }
    if (source.status === "unavailable" && source.confidence !== "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Unavailable source concepts cannot claim confidence",
      });
    }
  });

const sourceActivityIdsSchema = z
  .array(opaqueIdSchema)
  .max(2_000)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Source activity IDs must be unique" });
    }
  });

export const athleteCapabilitySourcesSchema = z
  .object({
    concepts: z.array(athleteCapabilitySourceConceptReferenceSchema).max(8),
    evidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    activityIds: sourceActivityIdsSchema,
  })
  .strict()
  .superRefine((sources, context) => {
    const concepts = sources.concepts.map((source) => source.concept);
    if (new Set(concepts).size !== concepts.length) {
      context.addIssue({ code: "custom", message: "Source concepts must be unique" });
    }
  });

export const athleteCapabilityCalculationIdentitySchema = z
  .object({
    compositionVersion: z.literal(ATHLETE_CAPABILITY_COMPOSITION_VERSION),
    sourceModel: durationPerformanceCalculationIdentitySchema,
  })
  .strict();

export const athleteCapabilityFreshnessSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("current"),
      evaluatedAt: dateTimeSchema,
      expiresAt: dateTimeSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("expired"),
      evaluatedAt: dateTimeSchema,
      expiresAt: dateTimeSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("unknown"),
      evaluatedAt: dateTimeSchema,
      expiresAt: z.null(),
    })
    .strict(),
]);

const capabilityResultCommonShape = {
  capability: athleteCapabilityNameSchema,
  activityCategory: canonicalActivityCategorySchema,
  sources: athleteCapabilitySourcesSchema,
  calculationIdentity: athleteCapabilityCalculationIdentitySchema,
  freshness: athleteCapabilityFreshnessSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

export const availableAthleteCapabilityResultSchema = z
  .object({
    status: z.literal("available"),
    value: z.number().finite().nonnegative(),
    unit: athleteCapabilityUnitSchema,
    measurementBasis: athleteCapabilityMeasurementBasisSchema,
    confidence: durationPerformanceConfidenceSchema.exclude(["unavailable"]),
    reasons: z.array(athleteCapabilityReasonSchema).max(0),
    ...capabilityResultCommonShape,
  })
  .strict();

export const partialAthleteCapabilityResultSchema = z
  .object({
    status: z.literal("partial"),
    value: z.number().finite().nonnegative(),
    unit: athleteCapabilityUnitSchema,
    measurementBasis: athleteCapabilityMeasurementBasisSchema,
    confidence: durationPerformanceConfidenceSchema.exclude(["unavailable"]),
    reasons: z.array(athleteCapabilityReasonSchema).min(1),
    ...capabilityResultCommonShape,
  })
  .strict();

export const unavailableAthleteCapabilityResultSchema = z
  .object({
    status: z.literal("unavailable"),
    value: z.null(),
    unit: athleteCapabilityUnitSchema.nullable(),
    measurementBasis: athleteCapabilityMeasurementBasisSchema.nullable(),
    confidence: z.literal("unavailable"),
    reasons: z.array(athleteCapabilityReasonSchema).min(1),
    ...capabilityResultCommonShape,
  })
  .strict();

function measurementMatchesCapability(input: {
  activityCategory: z.infer<typeof canonicalActivityCategorySchema>;
  capability: z.infer<typeof athleteCapabilityNameSchema>;
  unit: z.infer<typeof athleteCapabilityUnitSchema>;
  measurementBasis: z.infer<typeof athleteCapabilityMeasurementBasisSchema>;
}): boolean {
  if (input.activityCategory === "bike") {
    if (input.capability === "shortDurationCapacity") {
      return (
        input.unit === "watts" && input.measurementBasis === "cycling_60_second_maximal_mean_power"
      );
    }
    if (input.capability === "anaerobicReserve") {
      return input.unit === "joules" && input.measurementBasis === "cycling_gradientpeak_reserve";
    }
    if (input.capability === "thresholdCapacity") {
      return (
        input.unit === "watts" &&
        input.measurementBasis === "cycling_planning_threshold_power_anchor"
      );
    }
    if (input.capability === "longDurationCapacity") {
      return (
        input.unit === "watts" &&
        input.measurementBasis === "cycling_3600_second_maximal_mean_power"
      );
    }
    if (input.capability === "durationRetention") {
      return (
        input.unit === "ratio" &&
        input.measurementBasis === "cycling_1200_to_3600_duration_retention"
      );
    }
    if (input.capability === "repeatedEffortRecovery") {
      return (
        input.unit === "ratio" && input.measurementBasis === "cycling_fixed_work_recovery_fraction"
      );
    }
    return false;
  }

  if (input.activityCategory === "run") {
    if (input.capability === "shortDurationCapacity") {
      return (
        input.unit === "meters_per_second" &&
        input.measurementBasis === "running_60_second_maximal_mean_speed"
      );
    }
    if (input.capability === "anaerobicReserve") {
      return (
        input.unit === "meters" &&
        input.measurementBasis === "running_gradientpeak_distance_reserve"
      );
    }
    if (input.capability === "thresholdCapacity") {
      return (
        input.unit === "meters_per_second" &&
        input.measurementBasis === "running_planning_threshold_pace_anchor"
      );
    }
    if (input.capability === "longDurationCapacity") {
      return (
        input.unit === "meters_per_second" &&
        input.measurementBasis === "running_3600_second_maximal_mean_speed"
      );
    }
    if (input.capability === "durationRetention") {
      return (
        input.unit === "ratio" &&
        input.measurementBasis === "running_1200_to_3600_duration_retention"
      );
    }
    return false;
  }

  if (input.activityCategory === "swim") {
    if (input.capability === "shortDurationCapacity") {
      return (
        input.unit === "meters_per_second" &&
        input.measurementBasis === "swimming_pool_60_second_maximal_mean_speed"
      );
    }
    if (input.capability === "longDurationCapacity") {
      return (
        input.unit === "meters_per_second" &&
        input.measurementBasis === "swimming_1800_second_long_duration_speed"
      );
    }
    if (input.capability === "repeatedEffortRecovery") {
      return (
        input.unit === "ratio" &&
        input.measurementBasis === "swimming_fixed_distance_repeat_speed_retention"
      );
    }
    return false;
  }

  return (
    input.activityCategory === "strength" &&
    input.capability === "repeatedEffortRecovery" &&
    input.unit === "ratio" &&
    input.measurementBasis === "strength_fixed_resistance_repetition_retention"
  );
}

export const athleteCapabilityResultSchema = z
  .discriminatedUnion("status", [
    availableAthleteCapabilityResultSchema,
    partialAthleteCapabilityResultSchema,
    unavailableAthleteCapabilityResultSchema,
  ])
  .superRefine((result, context) => {
    if (result.status !== "unavailable") {
      if (
        !measurementMatchesCapability({
          activityCategory: result.activityCategory,
          capability: result.capability,
          unit: result.unit,
          measurementBasis: result.measurementBasis,
        })
      ) {
        context.addIssue({
          code: "custom",
          path: ["measurementBasis"],
          message: "Numeric capability value is not compatible with its category, unit, and basis",
        });
      }
      if (
        result.sources.concepts.length === 0 ||
        result.sources.evidenceIds.length === 0 ||
        result.sources.activityIds.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: "Numeric capability values require concept, evidence, and activity identity",
        });
      }
      if (result.freshness.state !== "current") {
        context.addIssue({
          code: "custom",
          path: ["freshness"],
          message: "Numeric capability values require current evidence",
        });
      }
      const requiredCoverageState = result.status === "available" ? "complete" : "partial";
      if (result.evidenceCoverage.state !== requiredCoverageState) {
        context.addIssue({
          code: "custom",
          path: ["evidenceCoverage", "state"],
          message: `Capability ${result.status} status requires ${requiredCoverageState} coverage`,
        });
      }
      return;
    }

    if ((result.unit === null) !== (result.measurementBasis === null)) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Unavailable capability unit and measurement basis must both be present or absent",
      });
    }
    if (
      result.unit !== null &&
      result.measurementBasis !== null &&
      !measurementMatchesCapability({
        activityCategory: result.activityCategory,
        capability: result.capability,
        unit: result.unit,
        measurementBasis: result.measurementBasis,
      })
    ) {
      context.addIssue({
        code: "custom",
        path: ["measurementBasis"],
        message: "Unavailable capability metadata is not compatible with its category",
      });
    }
  });

export const categoryCapabilityProfileSchema = z
  .object({
    contractVersion: z.literal(CATEGORY_CAPABILITY_PROFILE_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: canonicalActivityCategorySchema,
    sourceModelIdentity: durationPerformanceCalculationIdentitySchema,
    shortDurationCapacity: athleteCapabilityResultSchema,
    anaerobicReserve: athleteCapabilityResultSchema,
    thresholdCapacity: athleteCapabilityResultSchema,
    longDurationCapacity: athleteCapabilityResultSchema,
    durationRetention: athleteCapabilityResultSchema,
    repeatedEffortRecovery: athleteCapabilityResultSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    const inspect = (
      capability: z.infer<typeof athleteCapabilityNameSchema>,
      result: z.infer<typeof athleteCapabilityResultSchema>,
    ): void => {
      if (result.capability !== capability) {
        context.addIssue({
          code: "custom",
          path: [capability, "capability"],
          message: "Capability result must retain its profile property identity",
        });
      }
      if (result.activityCategory !== profile.activityCategory) {
        context.addIssue({
          code: "custom",
          path: [capability, "activityCategory"],
          message: "Capability result category must match its category profile",
        });
      }
      const sourceModel = result.calculationIdentity.sourceModel;
      if (
        sourceModel.athleteId !== profile.athleteId ||
        sourceModel.activityCategory !== profile.activityCategory ||
        sourceModel.assessmentAsOf !== profile.assessmentAsOf ||
        sourceModel.calculationFingerprint !== profile.sourceModelIdentity.calculationFingerprint
      ) {
        context.addIssue({
          code: "custom",
          path: [capability, "calculationIdentity"],
          message: "Capability result must retain the category source-model identity",
        });
      }
      if (result.freshness.evaluatedAt !== profile.assessmentAsOf) {
        context.addIssue({
          code: "custom",
          path: [capability, "freshness", "evaluatedAt"],
          message: "Capability freshness must be evaluated at the profile assessment instant",
        });
      }
    };

    if (
      profile.sourceModelIdentity.athleteId !== profile.athleteId ||
      profile.sourceModelIdentity.activityCategory !== profile.activityCategory ||
      profile.sourceModelIdentity.assessmentAsOf !== profile.assessmentAsOf
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceModelIdentity"],
        message: "Category profile must preserve athlete, category, and assessment identity",
      });
    }

    inspect("shortDurationCapacity", profile.shortDurationCapacity);
    inspect("anaerobicReserve", profile.anaerobicReserve);
    inspect("thresholdCapacity", profile.thresholdCapacity);
    inspect("longDurationCapacity", profile.longDurationCapacity);
    inspect("durationRetention", profile.durationRetention);
    inspect("repeatedEffortRecovery", profile.repeatedEffortRecovery);
  });

const calculationFingerprintSchema = z.string().regex(/^fnv1a-32:[0-9a-f]{8}$/);

export const athleteCapabilityProfileSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_CAPABILITY_PROFILE_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    calculationIdentity: z
      .object({
        compositionVersion: z.literal(ATHLETE_CAPABILITY_COMPOSITION_VERSION),
        sourceCalculationFingerprints: z.array(calculationFingerprintSchema).max(5),
      })
      .strict(),
    categoryProfiles: z.array(categoryCapabilityProfileSchema).max(5),
  })
  .strict()
  .superRefine((profile, context) => {
    const categoryOrder = (category: z.infer<typeof canonicalActivityCategorySchema>): number => {
      if (category === "run") return 0;
      if (category === "bike") return 1;
      if (category === "swim") return 2;
      if (category === "strength") return 3;
      return 4;
    };
    const categories = profile.categoryProfiles.map((entry) => entry.activityCategory);
    if (new Set(categories).size !== categories.length) {
      context.addIssue({
        code: "custom",
        path: ["categoryProfiles"],
        message: "Athlete capability profile categories must be unique",
      });
    }
    for (let index = 1; index < profile.categoryProfiles.length; index += 1) {
      const previous = profile.categoryProfiles[index - 1];
      const current = profile.categoryProfiles[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        categoryOrder(previous.activityCategory) >= categoryOrder(current.activityCategory)
      ) {
        context.addIssue({
          code: "custom",
          path: ["categoryProfiles", index],
          message: "Category profiles must retain canonical deterministic order",
        });
      }
    }
    if (
      profile.categoryProfiles.some(
        (entry) =>
          entry.athleteId !== profile.athleteId || entry.assessmentAsOf !== profile.assessmentAsOf,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["categoryProfiles"],
        message: "Every category profile must share athlete and assessment identity",
      });
    }
    const expectedFingerprints = profile.categoryProfiles.map(
      (entry) => entry.sourceModelIdentity.calculationFingerprint,
    );
    if (
      expectedFingerprints.length !==
        profile.calculationIdentity.sourceCalculationFingerprints.length ||
      expectedFingerprints.some(
        (fingerprint, index) =>
          fingerprint !== profile.calculationIdentity.sourceCalculationFingerprints[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["calculationIdentity", "sourceCalculationFingerprints"],
        message: "Profile identity must retain every ordered source calculation fingerprint",
      });
    }
  });

export type AthleteCapabilityName = z.infer<typeof athleteCapabilityNameSchema>;
export type AthleteCapabilityUnit = z.infer<typeof athleteCapabilityUnitSchema>;
export type AthleteCapabilityMeasurementBasis = z.infer<
  typeof athleteCapabilityMeasurementBasisSchema
>;
export type AthleteCapabilitySourceConcept = z.infer<typeof athleteCapabilitySourceConceptSchema>;
export type AthleteCapabilityResult = z.infer<typeof athleteCapabilityResultSchema>;
export type AvailableAthleteCapabilityResult = z.infer<
  typeof availableAthleteCapabilityResultSchema
>;
export type PartialAthleteCapabilityResult = z.infer<typeof partialAthleteCapabilityResultSchema>;
export type CategoryCapabilityProfile = z.infer<typeof categoryCapabilityProfileSchema>;
export type AthleteCapabilityProfile = z.infer<typeof athleteCapabilityProfileSchema>;
