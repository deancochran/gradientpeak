import { z } from "zod";

import { activityCalibrationQualitySchema } from "../activity-analysis/calibration-quality";
import { type CanonicalSport, canonicalSportSchema } from "../schemas/sport";

export const COMMON_RELATIVE_LOAD_MODEL = "gradientpeak_relative_load" as const;
export const COMMON_RELATIVE_LOAD_VERSION = "1" as const;

export const commonLoadMethodSchema = z.enum([
  "power_threshold",
  "critical_power_threshold",
  "run_pace_threshold",
  "swim_pace_threshold",
  "heart_rate_zones",
]);

const thresholdEvidenceBaseShape = {
  source: z.enum([
    "manual",
    "validated_test",
    "observed_effort",
    "provider",
    "modeled",
    "estimated",
    "unknown",
  ]),
  observedAt: z.string().datetime({ offset: true }),
  validAt: z.string().datetime({ offset: true }),
  freshness: z.enum(["current", "stale", "unknown"]),
  calculationVersion: z.string().trim().min(1).nullable(),
  sourceFingerprint: z.string().trim().min(1),
};

export const commonThresholdEvidenceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ftp_watts"),
      value: z.number().finite().positive(),
      unit: z.literal("watts"),
      ...thresholdEvidenceBaseShape,
    })
    .strict(),
  z
    .object({
      type: z.literal("critical_power_watts"),
      value: z.number().finite().positive(),
      unit: z.literal("watts"),
      ...thresholdEvidenceBaseShape,
    })
    .strict(),
  z
    .object({
      type: z.literal("threshold_speed_mps"),
      value: z.number().finite().positive(),
      unit: z.literal("meters_per_second"),
      ...thresholdEvidenceBaseShape,
    })
    .strict(),
  z
    .object({
      type: z.literal("swim_threshold_speed_mps"),
      value: z.number().finite().positive(),
      unit: z.literal("meters_per_second"),
      ...thresholdEvidenceBaseShape,
    })
    .strict(),
  z
    .object({
      type: z.literal("lthr_bpm"),
      value: z.number().finite().positive(),
      unit: z.literal("beats_per_minute"),
      ...thresholdEvidenceBaseShape,
    })
    .strict(),
]);

const commonLoadIdentityShape = {
  model: z.literal(COMMON_RELATIVE_LOAD_MODEL),
  version: z.literal(COMMON_RELATIVE_LOAD_VERSION),
};

const commonLoadProvenanceShape = {
  ...commonLoadIdentityShape,
  sport: canonicalSportSchema,
  method: commonLoadMethodSchema.nullable(),
  quality: activityCalibrationQualitySchema.nullable(),
  thresholdEvidence: commonThresholdEvidenceSchema.nullable(),
  evidenceFingerprint: z.string().trim().min(1).nullable(),
  computedAsOf: z.string().datetime({ offset: true }),
};

const commonLoadAvailableSchema = z
  .object({
    status: z.literal("available"),
    ...commonLoadProvenanceShape,
    method: commonLoadMethodSchema,
    load: z.number().finite().nonnegative(),
    intensity: z.number().finite().min(0).max(1.5),
    contributingDurationSeconds: z.number().finite().positive(),
    quality: activityCalibrationQualitySchema,
    thresholdEvidence: commonThresholdEvidenceSchema,
    evidenceFingerprint: z.string().trim().min(1),
    estimated: z.boolean(),
  })
  .strict();

const commonLoadPartialSchema = z
  .object({
    status: z.literal("partial"),
    ...commonLoadProvenanceShape,
    load: z.number().finite().nonnegative().nullable(),
    intensity: z.number().finite().min(0).max(1.5).nullable(),
    contributingDurationSeconds: z.number().finite().nonnegative(),
    eligibleDurationSeconds: z.number().finite().positive(),
    sourceTimeCoverage: z.number().finite().min(0).max(1),
    reason: z.enum(["insufficient_coverage", "duration_partial", "activity_data_partial"]),
  })
  .strict()
  .superRefine((result, context) => {
    const hasNumericResult = result.load !== null && result.intensity !== null;
    const hasAnyNumericResult = result.load !== null || result.intensity !== null;
    const provenancePresence = [
      result.method,
      result.quality,
      result.thresholdEvidence,
      result.evidenceFingerprint,
    ].map((value) => value !== null);
    const hasCompleteProvenance = provenancePresence.every(Boolean);
    const hasAnyProvenance = provenancePresence.some(Boolean);

    if (hasAnyNumericResult !== hasNumericResult) {
      context.addIssue({
        code: "custom",
        message: "Partial Load and Intensity must both be known or both be unavailable",
      });
    }
    if (hasAnyProvenance !== hasCompleteProvenance) {
      context.addIssue({
        code: "custom",
        message: "Partial provenance must be complete or wholly unavailable",
      });
    }
    if (hasNumericResult && !hasCompleteProvenance) {
      context.addIssue({
        code: "custom",
        message: "Known partial Load requires complete method and evidence provenance",
      });
    }
    const expectedCoverage = result.contributingDurationSeconds / result.eligibleDurationSeconds;
    const coverageTolerance = Number.EPSILON * Math.max(1, Math.abs(result.sourceTimeCoverage)) * 8;
    if (Math.abs(result.sourceTimeCoverage - expectedCoverage) > coverageTolerance) {
      context.addIssue({
        code: "custom",
        message: "Partial source coverage must use known eligible duration as its denominator",
      });
    }
    if (
      result.sourceTimeCoverage === 0 &&
      (result.contributingDurationSeconds !== 0 || hasAnyNumericResult)
    ) {
      context.addIssue({
        code: "custom",
        message: "Zero source coverage requires zero contributing duration and no numeric result",
      });
    }
  });

const commonLoadUnavailableSchema = z
  .object({
    status: z.literal("unavailable"),
    ...commonLoadProvenanceShape,
    contributingDurationSeconds: z.number().finite().positive().nullable(),
    reason: z.enum([
      "threshold_missing",
      "activity_data_missing",
      "duration_missing",
      "invalid_data",
      "private_data",
      "unsupported_modality",
      "insufficient_coverage",
      "stale_threshold",
      "intensity_out_of_range",
    ]),
  })
  .strict()
  .superRefine((result, context) => {
    const provenancePresence = [
      result.method,
      result.quality,
      result.thresholdEvidence,
      result.evidenceFingerprint,
    ].map((value) => value !== null);
    const hasCompleteProvenance = provenancePresence.every(Boolean);
    const hasNoProvenance = provenancePresence.every((present) => !present);
    const hasMethodOnly =
      result.method !== null &&
      result.quality === null &&
      result.thresholdEvidence === null &&
      result.evidenceFingerprint === null;
    const issue = (message: string): void => {
      context.addIssue({ code: "custom", message });
    };

    if (result.reason === "threshold_missing") {
      if (result.thresholdEvidence !== null)
        issue("Missing threshold cannot carry threshold evidence");
      if (!hasNoProvenance && !hasMethodOnly) {
        issue("Missing threshold permits only an attempted method without evidence provenance");
      }
      return;
    }
    if (result.reason === "stale_threshold") {
      if (
        !hasCompleteProvenance ||
        result.thresholdEvidence?.freshness !== "stale" ||
        result.quality?.stale !== true
      ) {
        issue("Stale threshold requires complete matching stale threshold provenance");
      }
      return;
    }
    if (result.reason === "intensity_out_of_range") {
      if (!hasCompleteProvenance) {
        issue("Out-of-range Intensity requires complete method and evidence provenance");
      }
      return;
    }
    if (result.reason === "unsupported_modality") {
      if (!hasNoProvenance)
        issue("Unsupported modality cannot claim method or evidence provenance");
      return;
    }
    if (!hasCompleteProvenance && !hasNoProvenance) {
      issue("Unavailable provenance must be complete or wholly unavailable");
    }
  });

const expectedThresholdTypeByMethod = {
  power_threshold: "ftp_watts",
  critical_power_threshold: "critical_power_watts",
  run_pace_threshold: "threshold_speed_mps",
  swim_pace_threshold: "swim_threshold_speed_mps",
  heart_rate_zones: "lthr_bpm",
} as const;

const allowedSportsByMethod = {
  power_threshold: ["bike"],
  critical_power_threshold: ["bike"],
  run_pace_threshold: ["run"],
  swim_pace_threshold: ["swim"],
  heart_rate_zones: ["run", "bike", "swim"],
} as const satisfies Record<z.infer<typeof commonLoadMethodSchema>, readonly CanonicalSport[]>;

export const commonLoadResultSchema = z
  .discriminatedUnion("status", [
    commonLoadAvailableSchema,
    commonLoadPartialSchema,
    commonLoadUnavailableSchema,
  ])
  .superRefine((result, context) => {
    if (result.status !== "unavailable" && result.load !== null && result.intensity !== null) {
      const expectedLoad =
        (result.contributingDurationSeconds / 3600) * result.intensity ** 2 * 100;
      const tolerance =
        Number.EPSILON * Math.max(1, Math.abs(result.load), Math.abs(expectedLoad)) * 8;
      if (Math.abs(result.load - expectedLoad) > tolerance) {
        context.addIssue({
          code: "custom",
          path: ["load"],
          message: "Load must match contributing duration and full-precision Intensity",
        });
      }
    }
    if (
      result.method !== null &&
      !allowedSportsByMethod[result.method].some((sport) => sport === result.sport)
    ) {
      context.addIssue({
        code: "custom",
        path: ["method"],
        message: "Common Load method is not compatible with the activity sport",
      });
    }
    if (
      result.thresholdEvidence !== null &&
      (result.method === null ||
        result.thresholdEvidence.type !== expectedThresholdTypeByMethod[result.method])
    ) {
      context.addIssue({
        code: "custom",
        path: ["thresholdEvidence"],
        message: "Threshold evidence must match the common Load method",
      });
    }
    if (result.thresholdEvidence !== null && result.quality !== null) {
      if (result.thresholdEvidence.source !== result.quality.source) {
        context.addIssue({
          code: "custom",
          path: ["quality", "source"],
          message: "Threshold evidence and calibration quality must retain the same source",
        });
      }
      if (
        (result.thresholdEvidence.freshness === "stale" && !result.quality.stale) ||
        (result.thresholdEvidence.freshness === "current" && result.quality.stale)
      ) {
        context.addIssue({
          code: "custom",
          path: ["quality", "stale"],
          message: "Threshold freshness and calibration quality must agree",
        });
      }
    }
  });

export const availableCommonLoadCalculationInputSchema = commonLoadAvailableSchema
  .omit({ status: true, load: true, model: true, version: true })
  .strict();

const aggregateCoverageShape = {
  ...commonLoadIdentityShape,
  contributingDurationSeconds: z.number().finite().nonnegative(),
  knownDurationSeconds: z.number().finite().positive().nullable(),
  contributingActivityCount: z.number().int().nonnegative(),
  partialActivityCount: z.number().int().nonnegative(),
  unavailableActivityCount: z.number().int().nonnegative(),
  totalActivityCount: z.number().int().nonnegative(),
  activityCountCoverage: z.number().finite().min(0).max(1),
  knownDurationCoverage: z.number().finite().min(0).max(1).nullable(),
  unknownDurationActivityCount: z.number().int().nonnegative(),
};

function nearlyEqual(left: number, right: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16;
  return Math.abs(left - right) <= tolerance;
}

export const commonLoadAggregateSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.enum(["complete", "partial"]),
        ...aggregateCoverageShape,
        load: z.number().finite().nonnegative(),
        intensity: z.number().finite().min(0).max(1.5),
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        ...aggregateCoverageShape,
        reason: z.enum(["no_load_data", "incompatible_version", "duration_missing"]),
      })
      .strict(),
  ])
  .superRefine((aggregate, context) => {
    const issue = (message: string, path?: PropertyKey[]): void => {
      context.addIssue({ code: "custom", message, path });
    };
    const expectedActivityCoverage =
      aggregate.totalActivityCount === 0
        ? 0
        : aggregate.contributingActivityCount / aggregate.totalActivityCount;

    if (
      aggregate.contributingActivityCount > aggregate.totalActivityCount ||
      aggregate.partialActivityCount > aggregate.totalActivityCount ||
      aggregate.unavailableActivityCount > aggregate.totalActivityCount ||
      aggregate.unknownDurationActivityCount > aggregate.totalActivityCount ||
      aggregate.partialActivityCount + aggregate.unavailableActivityCount >
        aggregate.totalActivityCount ||
      aggregate.contributingActivityCount + aggregate.unavailableActivityCount >
        aggregate.totalActivityCount ||
      aggregate.contributingActivityCount <
        aggregate.totalActivityCount -
          aggregate.partialActivityCount -
          aggregate.unavailableActivityCount
    ) {
      issue("Aggregate counts cannot exceed total activity count");
    }
    if (!nearlyEqual(aggregate.activityCountCoverage, expectedActivityCoverage)) {
      issue("Activity count coverage must use total activity count as its denominator", [
        "activityCountCoverage",
      ]);
    }
    if (aggregate.knownDurationSeconds === null) {
      if (aggregate.knownDurationCoverage !== null) {
        issue("Duration coverage requires a known duration denominator", ["knownDurationCoverage"]);
      }
      if (
        aggregate.totalActivityCount > 0 &&
        aggregate.unknownDurationActivityCount !== aggregate.totalActivityCount
      ) {
        issue("A missing duration denominator requires every activity duration to be unknown");
      }
    } else {
      if (aggregate.unknownDurationActivityCount === aggregate.totalActivityCount) {
        issue("Known duration requires at least one activity with known duration");
      }
      if (aggregate.contributingDurationSeconds > aggregate.knownDurationSeconds) {
        issue("Contributing duration cannot exceed known eligible duration");
      }
      const expectedDurationCoverage =
        aggregate.contributingDurationSeconds / aggregate.knownDurationSeconds;
      if (
        aggregate.knownDurationCoverage === null ||
        !nearlyEqual(aggregate.knownDurationCoverage, expectedDurationCoverage)
      ) {
        issue("Known duration coverage must use known eligible duration as its denominator", [
          "knownDurationCoverage",
        ]);
      }
    }
    if (aggregate.totalActivityCount === 0) {
      if (
        aggregate.contributingActivityCount !== 0 ||
        aggregate.partialActivityCount !== 0 ||
        aggregate.unavailableActivityCount !== 0 ||
        aggregate.unknownDurationActivityCount !== 0 ||
        aggregate.contributingDurationSeconds !== 0 ||
        aggregate.knownDurationSeconds !== null
      ) {
        issue("An empty aggregate cannot carry activity or duration facts");
      }
    }

    if (aggregate.status === "complete" || aggregate.status === "partial") {
      const expectedLoad =
        (aggregate.contributingDurationSeconds / 3600) * aggregate.intensity ** 2 * 100;
      if (
        aggregate.contributingDurationSeconds <= 0 ||
        !nearlyEqual(aggregate.load, expectedLoad)
      ) {
        issue("Aggregate Load and Intensity must match positive contributing duration");
      }
    }
    if (aggregate.status === "complete") {
      if (
        aggregate.totalActivityCount === 0 ||
        aggregate.contributingActivityCount !== aggregate.totalActivityCount ||
        aggregate.partialActivityCount !== 0 ||
        aggregate.unavailableActivityCount !== 0 ||
        aggregate.unknownDurationActivityCount !== 0 ||
        aggregate.knownDurationSeconds === null ||
        !nearlyEqual(aggregate.contributingDurationSeconds, aggregate.knownDurationSeconds) ||
        !nearlyEqual(aggregate.activityCountCoverage, 1) ||
        aggregate.knownDurationCoverage === null ||
        !nearlyEqual(aggregate.knownDurationCoverage, 1)
      ) {
        issue("Complete aggregates require every activity and duration to contribute");
      }
    }
    if (
      aggregate.status === "partial" &&
      (aggregate.contributingActivityCount === 0 ||
        (aggregate.contributingActivityCount === aggregate.totalActivityCount &&
          aggregate.partialActivityCount === 0 &&
          aggregate.unavailableActivityCount === 0 &&
          aggregate.unknownDurationActivityCount === 0 &&
          aggregate.knownDurationCoverage !== null &&
          nearlyEqual(aggregate.knownDurationCoverage, 1)))
    ) {
      issue("A fully contributing aggregate must use complete status");
    }
    if (
      aggregate.status === "unavailable" &&
      aggregate.reason !== "duration_missing" &&
      (aggregate.contributingActivityCount !== 0 || aggregate.contributingDurationSeconds !== 0)
    ) {
      issue("Unavailable aggregates cannot claim contributing Load observations");
    }
  });

export type CommonLoadMethod = z.infer<typeof commonLoadMethodSchema>;
export type CommonThresholdEvidence = z.infer<typeof commonThresholdEvidenceSchema>;
export type CommonLoadResult = z.infer<typeof commonLoadResultSchema>;
export type AvailableCommonLoadCalculationInput = z.infer<
  typeof availableCommonLoadCalculationInputSchema
>;
export type CommonLoadAggregate = z.infer<typeof commonLoadAggregateSchema>;

export const incompatibleCommonLoadAggregateObservationSchema = z
  .object({
    model: z.string().trim().min(1),
    version: z.string().trim().min(1),
    knownEligibleDurationSeconds: z.number().finite().positive().nullable(),
  })
  .strict()
  .refine(
    (observation) =>
      observation.model !== COMMON_RELATIVE_LOAD_MODEL ||
      observation.version !== COMMON_RELATIVE_LOAD_VERSION,
    { message: "Incompatible observation identity must differ from the current common model" },
  );
export type IncompatibleCommonLoadAggregateObservation = z.infer<
  typeof incompatibleCommonLoadAggregateObservationSchema
>;
export type CommonLoadAggregateObservation =
  | CommonLoadResult
  | IncompatibleCommonLoadAggregateObservation;

/** Calculates one fully evidenced v1 activity result without rounding or clamping. */
export function calculateAvailableCommonLoad(
  input: AvailableCommonLoadCalculationInput,
): CommonLoadResult {
  const parsed = availableCommonLoadCalculationInputSchema.parse(input);
  const load = (parsed.contributingDurationSeconds / 3600) * parsed.intensity ** 2 * 100;

  return commonLoadResultSchema.parse({
    status: "available",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    ...parsed,
    load,
  });
}

function stableFiniteSum(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right).reduce((sum, value) => sum + value, 0);
}

function knownEligibleDurationSeconds(observation: CommonLoadResult): number | null {
  if (observation.status === "partial") return observation.eligibleDurationSeconds;
  return observation.contributingDurationSeconds;
}

function unavailableAggregate(
  reason: "no_load_data" | "incompatible_version" | "duration_missing",
  coverage: Omit<
    z.infer<typeof commonLoadAggregateSchema>,
    "status" | "reason" | "load" | "intensity"
  >,
): CommonLoadAggregate {
  return commonLoadAggregateSchema.parse({ status: "unavailable", reason, ...coverage });
}

/** Adds only compatible common-model observations and derives duration-weighted RMS Intensity. */
export function aggregateCommonLoad(
  observations: readonly CommonLoadAggregateObservation[],
): CommonLoadAggregate {
  const totalActivityCount = observations.length;
  const identity = {
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
  } as const;

  const currentObservations: CommonLoadResult[] = [];
  const incompatibleObservations: IncompatibleCommonLoadAggregateObservation[] = [];
  for (const observation of observations) {
    if (
      observation.model === COMMON_RELATIVE_LOAD_MODEL &&
      observation.version === COMMON_RELATIVE_LOAD_VERSION
    ) {
      currentObservations.push(commonLoadResultSchema.parse(observation));
    } else {
      incompatibleObservations.push(
        incompatibleCommonLoadAggregateObservationSchema.parse(observation),
      );
    }
  }

  const knownDurations = [
    ...currentObservations.flatMap((observation) => {
      const duration = knownEligibleDurationSeconds(observation);
      return duration === null ? [] : [duration];
    }),
    ...incompatibleObservations.flatMap((observation) =>
      observation.knownEligibleDurationSeconds === null
        ? []
        : [observation.knownEligibleDurationSeconds],
    ),
  ];
  const knownDurationSeconds = knownDurations.length === 0 ? null : stableFiniteSum(knownDurations);
  const unknownDurationActivityCount =
    currentObservations.filter((observation) => knownEligibleDurationSeconds(observation) === null)
      .length +
    incompatibleObservations.filter(
      (observation) => observation.knownEligibleDurationSeconds === null,
    ).length;
  const partialActivityCount = currentObservations.filter(
    (observation) => observation.status === "partial",
  ).length;
  const unavailableActivityCount =
    currentObservations.filter((observation) => observation.status === "unavailable").length +
    incompatibleObservations.length;

  if (incompatibleObservations.length > 0) {
    return unavailableAggregate("incompatible_version", {
      ...identity,
      contributingDurationSeconds: 0,
      knownDurationSeconds,
      contributingActivityCount: 0,
      partialActivityCount: 0,
      unavailableActivityCount: totalActivityCount,
      totalActivityCount,
      activityCountCoverage: 0,
      knownDurationCoverage: knownDurationSeconds === null ? null : 0,
      unknownDurationActivityCount,
    });
  }

  const contributors = currentObservations.flatMap((observation) => {
    if (
      (observation.status !== "available" && observation.status !== "partial") ||
      observation.load === null ||
      observation.intensity === null
    ) {
      return [];
    }
    return [
      {
        durationSeconds: observation.contributingDurationSeconds,
        load: observation.load,
      },
    ];
  });
  const contributingDurationSeconds = stableFiniteSum(
    contributors.map((observation) => observation.durationSeconds),
  );
  const contributingActivityCount = contributors.length;
  const coverage = {
    ...identity,
    contributingDurationSeconds,
    knownDurationSeconds,
    contributingActivityCount,
    partialActivityCount,
    unavailableActivityCount,
    totalActivityCount,
    activityCountCoverage:
      totalActivityCount === 0 ? 0 : contributingActivityCount / totalActivityCount,
    knownDurationCoverage:
      knownDurationSeconds === null ? null : contributingDurationSeconds / knownDurationSeconds,
    unknownDurationActivityCount,
  };

  if (contributors.length === 0) return unavailableAggregate("no_load_data", coverage);
  if (contributingDurationSeconds <= 0) {
    return unavailableAggregate("duration_missing", coverage);
  }

  const load = stableFiniteSum(contributors.map((observation) => observation.load));
  const calculatedIntensity = Math.sqrt(load / (100 * (contributingDurationSeconds / 3600)));
  const upperBoundTolerance = Number.EPSILON * 1.5 * 16;
  const intensity =
    calculatedIntensity > 1.5 && calculatedIntensity <= 1.5 + upperBoundTolerance
      ? 1.5
      : calculatedIntensity;
  const complete =
    contributors.length === currentObservations.length &&
    currentObservations.every((observation) => observation.status === "available");

  return commonLoadAggregateSchema.parse({
    status: complete ? "complete" : "partial",
    ...coverage,
    load,
    intensity,
  });
}

/** Combines already-adapted activity or parent envelopes without reintroducing source metrics. */
export function aggregateCommonLoadEnvelopes(
  envelopes: readonly (CommonLoadResult | CommonLoadAggregate)[],
): CommonLoadAggregate {
  const normalized = envelopes.map((envelope) => {
    if (!("sport" in envelope)) return envelope;
    return aggregateCommonLoad([envelope]);
  });
  // Each envelope is one activity, even when that activity is itself a
  // multisport aggregate of segments. Do not leak segment counts into a
  // parent-level history coverage denominator.
  const totalActivityCount = normalized.length;
  const contributingActivityCount = normalized.filter(
    (item) => item.status !== "unavailable",
  ).length;
  const partialActivityCount = normalized.filter((item) => item.status === "partial").length;
  const unavailableActivityCount = normalized.filter(
    (item) => item.status === "unavailable",
  ).length;
  const unknownDurationActivityCount = normalized.filter(
    (item) => item.knownDurationSeconds === null,
  ).length;
  const knownDurations = normalized.flatMap((item) =>
    item.knownDurationSeconds === null ? [] : [item.knownDurationSeconds],
  );
  const knownDurationSeconds = knownDurations.length === 0 ? null : stableFiniteSum(knownDurations);
  const contributors = normalized.filter(
    (item): item is Extract<CommonLoadAggregate, { status: "complete" | "partial" }> =>
      item.status !== "unavailable",
  );
  const contributingDurationSeconds = stableFiniteSum(
    contributors.map((item) => item.contributingDurationSeconds),
  );
  const coverage = {
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    contributingDurationSeconds,
    knownDurationSeconds,
    contributingActivityCount,
    partialActivityCount,
    unavailableActivityCount,
    totalActivityCount,
    activityCountCoverage:
      totalActivityCount === 0 ? 0 : contributingActivityCount / totalActivityCount,
    knownDurationCoverage:
      knownDurationSeconds === null ? null : contributingDurationSeconds / knownDurationSeconds,
    unknownDurationActivityCount,
  } as const;
  if (contributors.length === 0) return unavailableAggregate("no_load_data", coverage);
  const load = stableFiniteSum(contributors.map((item) => item.load));
  const intensity = Math.sqrt(load / (100 * (contributingDurationSeconds / 3600)));
  const complete = normalized.every((item) => item.status === "complete");
  return commonLoadAggregateSchema.parse({
    status: complete ? "complete" : "partial",
    ...coverage,
    load,
    intensity,
  });
}
