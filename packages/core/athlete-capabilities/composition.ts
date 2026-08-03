import { z } from "zod";

import {
  type CyclingDurationPerformanceModel,
  cyclingDurationPerformanceModelSchema,
} from "../cycling-performance/contracts";
import {
  type DurationPerformanceCalculationIdentity,
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  type DurationPerformanceRecalculationTrigger,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
} from "../duration-performance/contracts";
import {
  type RunningDurationPerformanceModel,
  runningDurationPerformanceModelSchema,
} from "../duration-performance/running";
import {
  type StrengthOtherPerformanceModel,
  strengthOtherPerformanceModelSchema,
} from "../duration-performance/strength-other";
import {
  type SwimmingDurationPerformanceModel,
  swimmingDurationPerformanceModelSchema,
} from "../duration-performance/swimming";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import {
  ATHLETE_CAPABILITY_COMPOSITION_VERSION,
  ATHLETE_CAPABILITY_PROFILE_VERSION,
  type AthleteCapabilityMeasurementBasis,
  type AthleteCapabilityName,
  type AthleteCapabilityProfile,
  type AthleteCapabilityResult,
  type AthleteCapabilitySourceConcept,
  type AthleteCapabilityUnit,
  athleteCapabilityFreshnessSchema,
  athleteCapabilityProfileSchema,
  athleteCapabilityResultSchema,
  athleteCapabilitySourceConceptReferenceSchema,
  CATEGORY_CAPABILITY_PROFILE_VERSION,
  type CategoryCapabilityProfile,
  categoryCapabilityProfileSchema,
} from "./contracts";

export const ATHLETE_CAPABILITY_COMPOSITION_INPUT_VERSION =
  "athlete-capability-composition-input-v1";

const dateTimeSchema = z.string().datetime();
const opaqueIdSchema = z.string().trim().min(1).max(256);

const strengthPerformanceModelSchema = strengthOtherPerformanceModelSchema.refine(
  (model) => model.activityCategory === "strength",
  "Strength capability input must retain the strength category",
);
const otherPerformanceModelSchema = strengthOtherPerformanceModelSchema.refine(
  (model) => model.activityCategory === "other",
  "Other capability input must retain the other category",
);

export const athleteCapabilityCompositionInputSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_CAPABILITY_COMPOSITION_INPUT_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    cycling: cyclingDurationPerformanceModelSchema.optional(),
    running: runningDurationPerformanceModelSchema.optional(),
    swimming: swimmingDurationPerformanceModelSchema.optional(),
    strength: strengthPerformanceModelSchema.optional(),
    other: otherPerformanceModelSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const models = [
      input.cycling,
      input.running,
      input.swimming,
      input.strength,
      input.other,
    ].filter((model) => model !== undefined);
    models.forEach((model, index) => {
      if (model.athleteId !== input.athleteId) {
        context.addIssue({
          code: "custom",
          path: ["models", index, "athleteId"],
          message: "Every capability source model must belong to the composed athlete",
        });
      }
      if (
        model.assessmentAsOf !== input.assessmentAsOf ||
        model.calculationIdentity.assessmentAsOf !== input.assessmentAsOf
      ) {
        context.addIssue({
          code: "custom",
          path: ["models", index, "assessmentAsOf"],
          message: "Every capability source model must share the composition assessment instant",
        });
      }
    });
  });

export type AthleteCapabilityCompositionInput = z.infer<
  typeof athleteCapabilityCompositionInputSchema
>;

type SourceOutcome<T> = {
  status: "available" | "partial" | "unavailable";
  value: T | null;
  reasons: readonly string[];
  calculationVersion: string;
  sourceEvidenceIds: readonly string[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  confidence: DurationPerformanceConfidence;
  expiresAt: string | null;
  recalculationTriggers: readonly DurationPerformanceRecalculationTrigger[];
};

const DEFAULT_RECALCULATION_TRIGGERS = durationPerformanceRecalculationTriggerSchema
  .array()
  .parse([
    "new_canonical_best_effort",
    "source_evidence_corrected",
    "source_evidence_expired",
    "calculation_policy_changed",
  ]);

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function emptyCoverage(
  readCoverageState: "complete" | "truncated",
): DurationPerformanceEvidenceCoverage {
  return durationPerformanceEvidenceCoverageSchema.parse({
    state: "insufficient",
    readCoverageState,
    requiredExactDurationsSeconds: [],
    requiredDurationBands: [],
    minimumDistinctDurations: 0,
    minimumDistinctActivities: 0,
    observedDurationsSeconds: [],
    eligibleEffortCount: 0,
    selectedPointCount: 0,
    distinctActivityCount: 0,
    completeSourcePointCount: 0,
    partialSourcePointCount: 0,
  });
}

function freshness(evaluatedAt: string, expiresAt: string | null) {
  if (expiresAt === null) {
    return athleteCapabilityFreshnessSchema.parse({
      state: "unknown",
      evaluatedAt,
      expiresAt: null,
    });
  }
  return athleteCapabilityFreshnessSchema.parse({
    state: Date.parse(evaluatedAt) <= Date.parse(expiresAt) ? "current" : "expired",
    evaluatedAt,
    expiresAt,
  });
}

function sourceConceptReference<T>(
  concept: AthleteCapabilitySourceConcept,
  outcome: SourceOutcome<T>,
) {
  return athleteCapabilitySourceConceptReferenceSchema.parse({
    concept,
    calculationVersion: outcome.calculationVersion,
    status: outcome.status,
    reasonCodes: [...outcome.reasons],
    confidence: outcome.confidence,
    evidenceCoverage: outcome.evidenceCoverage,
    expiresAt: outcome.expiresAt,
    recalculationTriggers: [...outcome.recalculationTriggers],
  });
}

function capabilityFromSource<T>(input: {
  capability: AthleteCapabilityName;
  activityCategory: CanonicalActivityCategory;
  unit: AthleteCapabilityUnit;
  measurementBasis: AthleteCapabilityMeasurementBasis;
  concept: AthleteCapabilitySourceConcept;
  outcome: SourceOutcome<T>;
  sourceModelIdentity: DurationPerformanceCalculationIdentity;
  selectValue: (value: T) => number | null;
  sourceActivityIds: (sourceEvidenceIds: readonly string[]) => readonly string[];
}): AthleteCapabilityResult {
  const sourceEvidenceIds = sortedUnique(input.outcome.sourceEvidenceIds);
  const sourceActivityIds = sortedUnique(input.sourceActivityIds(sourceEvidenceIds));
  const capabilityFreshness = freshness(
    input.sourceModelIdentity.assessmentAsOf,
    input.outcome.expiresAt,
  );
  const common = {
    capability: input.capability,
    activityCategory: input.activityCategory,
    unit: input.unit,
    measurementBasis: input.measurementBasis,
    sources: {
      concepts: [sourceConceptReference(input.concept, input.outcome)],
      evidenceIds: sourceEvidenceIds,
      activityIds: sourceActivityIds,
    },
    calculationIdentity: {
      compositionVersion: ATHLETE_CAPABILITY_COMPOSITION_VERSION,
      sourceModel: input.sourceModelIdentity,
    },
    freshness: capabilityFreshness,
    evidenceCoverage: input.outcome.evidenceCoverage,
    recalculationTriggers: [...input.outcome.recalculationTriggers],
  };

  if (
    input.outcome.status === "unavailable" ||
    input.outcome.value === null ||
    input.outcome.confidence === "unavailable"
  ) {
    return athleteCapabilityResultSchema.parse({
      ...common,
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      reasons: ["source_concept_unavailable"],
    });
  }

  const value = input.selectValue(input.outcome.value);
  if (value === null) {
    return athleteCapabilityResultSchema.parse({
      ...common,
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      reasons: ["source_value_missing"],
    });
  }
  if (sourceActivityIds.length === 0) {
    return athleteCapabilityResultSchema.parse({
      ...common,
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      reasons: ["source_activity_identity_missing"],
    });
  }
  if (capabilityFreshness.state !== "current") {
    return athleteCapabilityResultSchema.parse({
      ...common,
      status: "unavailable",
      value: null,
      confidence: "unavailable",
      reasons: ["source_evidence_expired"],
    });
  }
  return athleteCapabilityResultSchema.parse({
    ...common,
    status: input.outcome.status,
    value,
    confidence: input.outcome.confidence,
    reasons: input.outcome.status === "available" ? [] : ["source_concept_partial"],
  });
}

function capabilityWithoutSourceConcept(input: {
  capability: AthleteCapabilityName;
  activityCategory: CanonicalActivityCategory;
  sourceModelIdentity: DurationPerformanceCalculationIdentity;
  readCoverageState: "complete" | "truncated";
  reason: "source_concept_not_produced" | "unsupported_category_capability";
}): AthleteCapabilityResult {
  return athleteCapabilityResultSchema.parse({
    status: "unavailable",
    capability: input.capability,
    activityCategory: input.activityCategory,
    value: null,
    unit: null,
    measurementBasis: null,
    sources: { concepts: [], evidenceIds: [], activityIds: [] },
    calculationIdentity: {
      compositionVersion: ATHLETE_CAPABILITY_COMPOSITION_VERSION,
      sourceModel: input.sourceModelIdentity,
    },
    freshness: {
      state: "unknown",
      evaluatedAt: input.sourceModelIdentity.assessmentAsOf,
      expiresAt: null,
    },
    confidence: "unavailable",
    evidenceCoverage: emptyCoverage(input.readCoverageState),
    reasons: [input.reason],
    recalculationTriggers: [...DEFAULT_RECALCULATION_TRIGGERS],
  });
}

function incompatibleSourceConcept<T>(input: {
  capability: AthleteCapabilityName;
  activityCategory: CanonicalActivityCategory;
  concept: AthleteCapabilitySourceConcept;
  outcome: SourceOutcome<T>;
  sourceModelIdentity: DurationPerformanceCalculationIdentity;
  sourceActivityIds: readonly string[];
}): AthleteCapabilityResult {
  return athleteCapabilityResultSchema.parse({
    status: "unavailable",
    capability: input.capability,
    activityCategory: input.activityCategory,
    value: null,
    unit: null,
    measurementBasis: null,
    sources: {
      concepts: [sourceConceptReference(input.concept, input.outcome)],
      evidenceIds: sortedUnique(input.outcome.sourceEvidenceIds),
      activityIds: sortedUnique(input.sourceActivityIds),
    },
    calculationIdentity: {
      compositionVersion: ATHLETE_CAPABILITY_COMPOSITION_VERSION,
      sourceModel: input.sourceModelIdentity,
    },
    freshness: freshness(input.sourceModelIdentity.assessmentAsOf, input.outcome.expiresAt),
    confidence: "unavailable",
    evidenceCoverage: input.outcome.evidenceCoverage,
    reasons: ["source_concept_not_semantically_compatible"],
    recalculationTriggers: [...input.outcome.recalculationTriggers],
  });
}

function cyclingSourceActivities(
  model: CyclingDurationPerformanceModel,
  sourceEvidenceIds: readonly string[],
): string[] {
  if (model.maximalMeanPowerCurve.status === "unavailable") return [];
  const sourceIds = new Set(sourceEvidenceIds);
  return model.maximalMeanPowerCurve.value.points.flatMap((point) =>
    sourceIds.has(point.sourceEvidenceId) ? [point.activityId] : [],
  );
}

function runningSourceActivities(
  model: RunningDurationPerformanceModel,
  sourceEvidenceIds: readonly string[],
): string[] {
  if (model.speedPaceCurve.status === "unavailable") return [];
  const sourceIds = new Set(sourceEvidenceIds);
  return model.speedPaceCurve.value.points.flatMap((point) =>
    sourceIds.has(point.sourceEvidenceId) ? [point.activityId] : [],
  );
}

function swimmingSourceActivities(
  model: SwimmingDurationPerformanceModel,
  sourceEvidenceIds: readonly string[],
): string[] {
  const sourceIds = new Set(sourceEvidenceIds);
  const curveActivities =
    model.paceDurationCurve.status === "unavailable"
      ? []
      : model.paceDurationCurve.value.points.flatMap((point) =>
          sourceIds.has(point.sourceEvidenceId) ? [point.activityId] : [],
        );
  const cssActivities =
    model.css.status !== "unavailable" &&
    model.css.sourceEvidenceIds.some((sourceId) => sourceIds.has(sourceId))
      ? [model.css.value.sourceActivityId]
      : [];
  const repeatActivities =
    model.capabilities.repeatedEffortDecay.status !== "unavailable" &&
    model.capabilities.repeatedEffortDecay.sourceEvidenceIds.some((sourceId) =>
      sourceIds.has(sourceId),
    )
      ? [model.capabilities.repeatedEffortDecay.value.sourceActivityId]
      : [];
  return [...curveActivities, ...cssActivities, ...repeatActivities];
}

function categoryProfile(input: {
  assessmentAsOf: string;
  athleteId: string;
  activityCategory: CanonicalActivityCategory;
  sourceModelIdentity: DurationPerformanceCalculationIdentity;
  shortDurationCapacity: AthleteCapabilityResult;
  anaerobicReserve: AthleteCapabilityResult;
  thresholdCapacity: AthleteCapabilityResult;
  longDurationCapacity: AthleteCapabilityResult;
  durationRetention: AthleteCapabilityResult;
  repeatedEffortRecovery: AthleteCapabilityResult;
}): CategoryCapabilityProfile {
  return categoryCapabilityProfileSchema.parse({
    contractVersion: CATEGORY_CAPABILITY_PROFILE_VERSION,
    ...input,
  });
}

/** Projects the canonical cycling concept model without re-fitting or re-extracting evidence. */
export function composeCyclingCategoryCapabilityProfile(
  model: CyclingDurationPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = cyclingDurationPerformanceModelSchema.parse(model);
  const activities = (sourceEvidenceIds: readonly string[]) =>
    cyclingSourceActivities(parsed, sourceEvidenceIds);
  const fromSource = <T>(input: {
    capability: AthleteCapabilityName;
    unit: AthleteCapabilityUnit;
    measurementBasis: AthleteCapabilityMeasurementBasis;
    concept: AthleteCapabilitySourceConcept;
    outcome: SourceOutcome<T>;
    selectValue: (value: T) => number | null;
  }) =>
    capabilityFromSource({
      ...input,
      activityCategory: "bike",
      sourceModelIdentity: parsed.calculationIdentity,
      sourceActivityIds: activities,
    });

  return categoryProfile({
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "bike",
    sourceModelIdentity: parsed.calculationIdentity,
    shortDurationCapacity: fromSource({
      capability: "shortDurationCapacity",
      unit: "watts",
      measurementBasis: "cycling_60_second_maximal_mean_power",
      concept: "cycling_short_duration_capacity",
      outcome: parsed.capabilityProfile.shortDurationCapacity,
      selectValue: (value) => value.sixtySecondPowerWatts,
    }),
    anaerobicReserve: fromSource({
      capability: "anaerobicReserve",
      unit: "joules",
      measurementBasis: "cycling_gradientpeak_reserve",
      concept: "cycling_gradientpeak_reserve",
      outcome: parsed.capabilityProfile.anaerobicReserve,
      selectValue: (value) => value.joules,
    }),
    thresholdCapacity: fromSource({
      capability: "thresholdCapacity",
      unit: "watts",
      measurementBasis: "cycling_planning_threshold_power_anchor",
      concept: "cycling_threshold_capacity",
      outcome: parsed.capabilityProfile.thresholdCapacity,
      selectValue: (value) => value.planningThresholdPowerWatts,
    }),
    longDurationCapacity: fromSource({
      capability: "longDurationCapacity",
      unit: "watts",
      measurementBasis: "cycling_3600_second_maximal_mean_power",
      concept: "cycling_long_duration_capacity",
      outcome: parsed.capabilityProfile.longDurationCapacity,
      selectValue: (value) => value.powerWatts,
    }),
    durationRetention: fromSource({
      capability: "durationRetention",
      unit: "ratio",
      measurementBasis: "cycling_1200_to_3600_duration_retention",
      concept: "cycling_duration_retention",
      outcome: parsed.capabilityProfile.durationRetention,
      selectValue: (value) => value.ratio,
    }),
    repeatedEffortRecovery: fromSource({
      capability: "repeatedEffortRecovery",
      unit: "ratio",
      measurementBasis: "cycling_fixed_work_recovery_fraction",
      concept: "cycling_repeated_effort_recovery",
      outcome: parsed.capabilityProfile.repeatedEffortRecovery,
      selectValue: (value) => value.recoveredFraction,
    }),
  });
}

/** Projects canonical running outputs; it never rebuilds a speed curve or model fit. */
export function composeRunningCategoryCapabilityProfile(
  model: RunningDurationPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = runningDurationPerformanceModelSchema.parse(model);
  const activities = (sourceEvidenceIds: readonly string[]) =>
    runningSourceActivities(parsed, sourceEvidenceIds);
  const fromSource = <T>(input: {
    capability: AthleteCapabilityName;
    unit: AthleteCapabilityUnit;
    measurementBasis: AthleteCapabilityMeasurementBasis;
    concept: AthleteCapabilitySourceConcept;
    outcome: SourceOutcome<T>;
    selectValue: (value: T) => number | null;
  }) =>
    capabilityFromSource({
      ...input,
      activityCategory: "run",
      sourceModelIdentity: parsed.calculationIdentity,
      sourceActivityIds: activities,
    });
  const curveValueAt = (durationSeconds: number) =>
    parsed.speedPaceCurve.status === "unavailable"
      ? null
      : (parsed.speedPaceCurve.value.points.find(
          (point) => point.durationSeconds === durationSeconds,
        )?.speedMetersPerSecond ?? null);

  return categoryProfile({
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "run",
    sourceModelIdentity: parsed.calculationIdentity,
    shortDurationCapacity: fromSource({
      capability: "shortDurationCapacity",
      unit: "meters_per_second",
      measurementBasis: "running_60_second_maximal_mean_speed",
      concept: "running_speed_pace_curve",
      outcome: parsed.speedPaceCurve,
      selectValue: () => curveValueAt(60),
    }),
    anaerobicReserve: fromSource({
      capability: "anaerobicReserve",
      unit: "meters",
      measurementBasis: "running_gradientpeak_distance_reserve",
      concept: "running_distance_reserve",
      outcome: parsed.parameters.distanceReserve,
      selectValue: (value) => value.meters,
    }),
    thresholdCapacity: fromSource({
      capability: "thresholdCapacity",
      unit: "meters_per_second",
      measurementBasis: "running_planning_threshold_pace_anchor",
      concept: "running_planning_threshold_pace",
      outcome: parsed.parameters.planningThresholdPace,
      selectValue: (value) => value.speedMetersPerSecond,
    }),
    longDurationCapacity: fromSource({
      capability: "longDurationCapacity",
      unit: "meters_per_second",
      measurementBasis: "running_3600_second_maximal_mean_speed",
      concept: "running_speed_pace_curve",
      outcome: parsed.speedPaceCurve,
      selectValue: () => curveValueAt(3_600),
    }),
    durationRetention: fromSource({
      capability: "durationRetention",
      unit: "ratio",
      measurementBasis: "running_1200_to_3600_duration_retention",
      concept: "running_duration_retention",
      outcome: parsed.parameters.durationRetention,
      selectValue: (value) => value.speedRetentionRatio,
    }),
    repeatedEffortRecovery: capabilityWithoutSourceConcept({
      capability: "repeatedEffortRecovery",
      activityCategory: "run",
      sourceModelIdentity: parsed.calculationIdentity,
      readCoverageState: parsed.speedPaceCurve.evidenceCoverage.readCoverageState,
      reason: "source_concept_not_produced",
    }),
  });
}

/** Projects canonical swim concepts while retaining pool/open-water identity. */
export function composeSwimmingCategoryCapabilityProfile(
  model: SwimmingDurationPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = swimmingDurationPerformanceModelSchema.parse(model);
  const activities = (sourceEvidenceIds: readonly string[]) =>
    swimmingSourceActivities(parsed, sourceEvidenceIds);
  const fromSource = <T>(input: {
    capability: AthleteCapabilityName;
    unit: AthleteCapabilityUnit;
    measurementBasis: AthleteCapabilityMeasurementBasis;
    concept: AthleteCapabilitySourceConcept;
    outcome: SourceOutcome<T>;
    selectValue: (value: T) => number | null;
  }) =>
    capabilityFromSource({
      ...input,
      activityCategory: "swim",
      sourceModelIdentity: parsed.calculationIdentity,
      sourceActivityIds: activities,
    });
  const missing = (capability: AthleteCapabilityName) =>
    capabilityWithoutSourceConcept({
      capability,
      activityCategory: "swim",
      sourceModelIdentity: parsed.calculationIdentity,
      readCoverageState: parsed.paceDurationCurve.evidenceCoverage.readCoverageState,
      reason: "source_concept_not_produced",
    });

  return categoryProfile({
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "swim",
    sourceModelIdentity: parsed.calculationIdentity,
    shortDurationCapacity: fromSource({
      capability: "shortDurationCapacity",
      unit: "meters_per_second",
      measurementBasis: "swimming_pool_60_second_maximal_mean_speed",
      concept: "swimming_sprint_capacity",
      outcome: parsed.capabilities.sprint,
      selectValue: (value) => value.sixtySecondSpeedMetersPerSecond,
    }),
    anaerobicReserve: missing("anaerobicReserve"),
    thresholdCapacity: fromSource({
      capability: "thresholdCapacity",
      unit: "meters_per_second",
      measurementBasis: "swimming_pool_css",
      concept: "swimming_css",
      outcome: parsed.css,
      selectValue: (value) => value.cssMetersPerSecond,
    }),
    longDurationCapacity: fromSource({
      capability: "longDurationCapacity",
      unit: "meters_per_second",
      measurementBasis: "swimming_1800_second_long_duration_speed",
      concept: "swimming_aerobic_capacity",
      outcome: parsed.capabilities.aerobic,
      selectValue: (value) =>
        value.basis === "pool_css_and_long_duration"
          ? value.longDurationSpeedMetersPerSecond
          : (value.speedsByDuration.find((point) => point.durationSeconds === 1_800)
              ?.speedMetersPerSecond ?? null),
    }),
    durationRetention: missing("durationRetention"),
    repeatedEffortRecovery: fromSource({
      capability: "repeatedEffortRecovery",
      unit: "ratio",
      measurementBasis: "swimming_fixed_distance_repeat_speed_retention",
      concept: "swimming_repeated_effort_decay",
      outcome: parsed.capabilities.repeatedEffortDecay,
      selectValue: (value) => value.finalSpeedRetentionRatio,
    }),
  });
}

function composeSessionCategoryCapabilityProfile(
  model: StrengthOtherPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = strengthOtherPerformanceModelSchema.parse(model);
  const readCoverageState = parsed.metrics.repeatability.evidenceCoverage.readCoverageState;
  const missing = (capability: AthleteCapabilityName) =>
    capabilityWithoutSourceConcept({
      capability,
      activityCategory: parsed.activityCategory,
      sourceModelIdentity: parsed.calculationIdentity,
      readCoverageState,
      reason: "unsupported_category_capability",
    });
  const common = {
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: parsed.activityCategory,
    sourceModelIdentity: parsed.calculationIdentity,
    shortDurationCapacity: missing("shortDurationCapacity"),
    anaerobicReserve: missing("anaerobicReserve"),
    thresholdCapacity: missing("thresholdCapacity"),
    longDurationCapacity: missing("longDurationCapacity"),
    durationRetention: missing("durationRetention"),
  };

  if (parsed.activityCategory === "strength") {
    const repeatability = parsed.metrics.repeatability;
    const repeatedEffortRecovery =
      repeatability.status !== "unavailable" &&
      repeatability.value.basis !== "fixed_resistance_repetitions"
        ? incompatibleSourceConcept({
            capability: "repeatedEffortRecovery",
            activityCategory: "strength",
            concept: "strength_repeatability",
            outcome: repeatability,
            sourceModelIdentity: parsed.calculationIdentity,
            sourceActivityIds: [],
          })
        : capabilityFromSource({
            capability: "repeatedEffortRecovery",
            activityCategory: "strength",
            unit: "ratio",
            measurementBasis: "strength_fixed_resistance_repetition_retention",
            concept: "strength_repeatability",
            outcome: repeatability,
            sourceModelIdentity: parsed.calculationIdentity,
            selectValue: (value) =>
              value.basis === "fixed_resistance_repetitions"
                ? value.finalRepetitionRetentionRatio
                : null,
            sourceActivityIds: (sourceEvidenceIds) =>
              repeatability.status !== "unavailable" &&
              repeatability.value.basis === "fixed_resistance_repetitions" &&
              repeatability.sourceEvidenceIds.some((sourceId) =>
                sourceEvidenceIds.includes(sourceId),
              )
                ? [repeatability.value.sourceActivityId]
                : [],
          });
    return categoryProfile({ ...common, repeatedEffortRecovery });
  }

  const repeatability = parsed.metrics.repeatability;
  const sourceActivityIds =
    repeatability.status !== "unavailable" &&
    repeatability.value.basis === "fixed_duration_rpe_drift"
      ? [repeatability.value.sourceActivityId]
      : [];
  return categoryProfile({
    ...common,
    repeatedEffortRecovery: incompatibleSourceConcept({
      capability: "repeatedEffortRecovery",
      activityCategory: "other",
      concept: "other_repeatability",
      outcome: repeatability,
      sourceModelIdentity: parsed.calculationIdentity,
      sourceActivityIds,
    }),
  });
}

/** Projects qualified strength protocol evidence only where its semantics match. */
export function composeStrengthCategoryCapabilityProfile(
  model: StrengthOtherPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = strengthOtherPerformanceModelSchema.parse(model);
  if (parsed.activityCategory !== "strength") {
    throw new Error("Strength category capability composition requires a strength source model");
  }
  return composeSessionCategoryCapabilityProfile(parsed);
}

/** Keeps general-session RPE drift explicit and does not coerce it into a capability value. */
export function composeOtherCategoryCapabilityProfile(
  model: StrengthOtherPerformanceModel,
): CategoryCapabilityProfile {
  const parsed = strengthOtherPerformanceModelSchema.parse(model);
  if (parsed.activityCategory !== "other") {
    throw new Error("Other category capability composition requires an other source model");
  }
  return composeSessionCategoryCapabilityProfile(parsed);
}

/**
 * Composes a same-instant athlete profile from explicit current category models.
 * Missing categories remain absent; the function never creates fallback state.
 */
export function composeAthleteCapabilityProfile(
  input: AthleteCapabilityCompositionInput,
): AthleteCapabilityProfile {
  const parsed = athleteCapabilityCompositionInputSchema.parse(input);
  const categoryProfiles: CategoryCapabilityProfile[] = [];
  if (parsed.running !== undefined) {
    categoryProfiles.push(composeRunningCategoryCapabilityProfile(parsed.running));
  }
  if (parsed.cycling !== undefined) {
    categoryProfiles.push(composeCyclingCategoryCapabilityProfile(parsed.cycling));
  }
  if (parsed.swimming !== undefined) {
    categoryProfiles.push(composeSwimmingCategoryCapabilityProfile(parsed.swimming));
  }
  if (parsed.strength !== undefined) {
    categoryProfiles.push(composeStrengthCategoryCapabilityProfile(parsed.strength));
  }
  if (parsed.other !== undefined) {
    categoryProfiles.push(composeOtherCategoryCapabilityProfile(parsed.other));
  }

  return athleteCapabilityProfileSchema.parse({
    contractVersion: ATHLETE_CAPABILITY_PROFILE_VERSION,
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    calculationIdentity: {
      compositionVersion: ATHLETE_CAPABILITY_COMPOSITION_VERSION,
      sourceCalculationFingerprints: categoryProfiles.map(
        (profile) => profile.sourceModelIdentity.calculationFingerprint,
      ),
    },
    categoryProfiles,
  });
}
