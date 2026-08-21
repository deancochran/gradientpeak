import { z } from "zod";

import { commonLoadAggregateSchema, commonLoadResultSchema } from "../load/common-relative-load";
import {
  canonicalActivityCategorySchema,
  canonicalActivityCategoryValues,
} from "../schemas/activity-category";
import {
  activityQuantificationCalculationIdentitySchema,
  activityQuantificationEvidenceIdentitySchema,
  activityQuantificationSubjectIdentitySchema,
} from "./identity";

const finiteNonnegativeNumberSchema = z.number().finite().nonnegative();

export const activityQuantificationEvidenceRoleSchema = z.enum([
  "prescribed",
  "measured",
  "estimated",
  "derived",
]);

export const activityDurationUnavailableReasonSchema = z.enum([
  "not_applicable",
  "not_prescribed",
  "ambiguous_target",
  "not_observed",
  "open_ended",
  "source_missing",
  "private_data",
  "unsupported",
  "invalid_data",
  "evidence_truncated",
]);

export const activityDurationPartialReasonSchema = z.enum([
  "open_ended",
  "source_incomplete",
  "recording_interrupted",
  "mixed_evidence",
  "evidence_truncated",
]);

export const activityDurationValueSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: finiteNonnegativeNumberSchema,
      unit: z.literal("seconds"),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: finiteNonnegativeNumberSchema,
      unit: z.literal("seconds"),
      reason: activityDurationPartialReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: z.null(),
      unit: z.literal("seconds"),
      reason: activityDurationUnavailableReasonSchema,
    })
    .strict(),
]);

export type ActivityDurationValue = z.infer<typeof activityDurationValueSchema>;

function availableDurationValue(value: ActivityDurationValue): number | null {
  return value.status === "unavailable" ? null : value.value;
}

/** Elapsed, active, and moving time remain independent evidence claims. */
export const activityDurationSchema = z
  .object({
    elapsed: activityDurationValueSchema,
    active: activityDurationValueSchema,
    moving: activityDurationValueSchema,
  })
  .strict()
  .superRefine((duration, context) => {
    const elapsed = availableDurationValue(duration.elapsed);
    const active = availableDurationValue(duration.active);
    const moving = availableDurationValue(duration.moving);
    if (elapsed !== null && active !== null && active > elapsed) {
      context.addIssue({
        code: "custom",
        path: ["active", "value"],
        message: "Active duration cannot exceed elapsed duration",
      });
    }
    if (elapsed !== null && moving !== null && moving > elapsed) {
      context.addIssue({
        code: "custom",
        path: ["moving", "value"],
        message: "Moving duration cannot exceed elapsed duration",
      });
    }
    if (active !== null && moving !== null && moving > active) {
      context.addIssue({
        code: "custom",
        path: ["moving", "value"],
        message: "Moving duration cannot exceed active duration",
      });
    }
  });

export const activityDistanceUnavailableReasonSchema = z.enum([
  "not_applicable",
  "not_prescribed",
  "ambiguous_target",
  "not_observed",
  "route_missing",
  "gps_unavailable",
  "source_missing",
  "private_data",
  "unsupported",
  "invalid_data",
  "evidence_truncated",
]);

export const activityDistancePartialReasonSchema = z.enum([
  "source_incomplete",
  "recording_interrupted",
  "route_incomplete",
  "gps_interrupted",
  "mixed_evidence",
  "evidence_truncated",
]);

export const activityDistanceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: finiteNonnegativeNumberSchema,
      unit: z.literal("meters"),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: finiteNonnegativeNumberSchema,
      unit: z.literal("meters"),
      reason: activityDistancePartialReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      value: z.null(),
      unit: z.literal("meters"),
      reason: activityDistanceUnavailableReasonSchema,
    })
    .strict(),
]);

const activityIntensityMagnitudeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("point"),
      value: finiteNonnegativeNumberSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("range"),
      lower: finiteNonnegativeNumberSchema,
      upper: finiteNonnegativeNumberSchema,
    })
    .strict()
    .refine((range) => range.upper >= range.lower, {
      message: "Intensity range upper bound must not be below its lower bound",
      path: ["upper"],
    }),
]);

type ActivityIntensityMagnitude = z.infer<typeof activityIntensityMagnitudeSchema>;

function intensityMagnitudeBounds(magnitude: ActivityIntensityMagnitude): [number, number] {
  return magnitude.kind === "point"
    ? [magnitude.value, magnitude.value]
    : [magnitude.lower, magnitude.upper];
}

export const activityNativeIntensityValueSchema = z
  .discriminatedUnion("metric", [
    z
      .object({
        metric: z.literal("relative_threshold"),
        reference: z.enum([
          "ftp",
          "critical_power",
          "threshold_speed",
          "lthr",
          "provider_threshold",
          "unspecified_threshold",
        ]),
        unit: z.enum(["ratio", "percent"]),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("power"),
        unit: z.literal("watts"),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("speed"),
        unit: z.enum(["meters_per_second", "kilometers_per_hour", "miles_per_hour"]),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("pace"),
        unit: z.enum(["seconds_per_kilometer", "seconds_per_mile", "seconds_per_100_meters"]),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("heart_rate"),
        unit: z.literal("beats_per_minute"),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("perceived_exertion"),
        unit: z.literal("rpe_0_10"),
        magnitude: activityIntensityMagnitudeSchema,
      })
      .strict(),
    z
      .object({
        metric: z.literal("zone"),
        scale: z.enum(["power", "heart_rate", "pace", "provider"]),
        value: z.number().int().positive(),
      })
      .strict(),
  ])
  .superRefine((intensity, context) => {
    if (intensity.metric === "zone") return;
    const [lower, upper] = intensityMagnitudeBounds(intensity.magnitude);
    if ((intensity.metric === "pace" || intensity.metric === "heart_rate") && lower <= 0) {
      context.addIssue({
        code: "custom",
        path: ["magnitude"],
        message: "Pace and heart-rate intensity values must be positive",
      });
    }
    if (intensity.metric === "perceived_exertion" && upper > 10) {
      context.addIssue({
        code: "custom",
        path: ["magnitude"],
        message: "Perceived exertion must remain within its authored 0-10 scale",
      });
    }
  });

const nativeActivityIntensityUnavailableReasonSchema = z.enum([
  "not_applicable",
  "not_authored",
  "not_observed",
  "source_missing",
  "private_data",
  "unsupported",
  "invalid_data",
  "evidence_truncated",
]);

const nativeActivityIntensityPartialReasonSchema = z.enum([
  "source_incomplete",
  "recording_interrupted",
  "mixed_evidence",
  "evidence_truncated",
]);

const nativeActivityIntensitySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      values: z.array(activityNativeIntensityValueSchema).min(1).max(512),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      values: z.array(activityNativeIntensityValueSchema).min(1).max(512),
      reason: nativeActivityIntensityPartialReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      evidenceRole: activityQuantificationEvidenceRoleSchema,
      values: z.tuple([]),
      reason: nativeActivityIntensityUnavailableReasonSchema,
    })
    .strict(),
]);

/** Native intensity authored by a prescription. */
export const prescribedActivityIntensitySchema = nativeActivityIntensitySchema;
/** Native intensity measured on a completed observation. */
export const observedActivityIntensitySchema = nativeActivityIntensitySchema;

export const activityPrescriptionIntensitySchema = z
  .object({ prescribed: prescribedActivityIntensitySchema })
  .strict();

export const activityObservationIntensitySchema = z
  .object({ observed: observedActivityIntensitySchema })
  .strict();

export const activityPrescriptionStageSchema = z.enum(["template", "plan", "scheduled"]);
/** Canonical activity observations are finalized; live recording owns a separate provisional contract. */
export const activityObservationStageSchema = z.literal("final");

export const completedActivityQuantificationProvenanceSchema = z
  .object({
    activityId: z.string().trim().min(1),
    segmentId: z.string().trim().min(1),
    source: z.enum(["activity_file", "provider_summary", "recording", "unknown"]),
    artifactIdentity: z.string().trim().min(1).nullable(),
    providerIdentity: z
      .object({
        provider: z.string().trim().min(1),
        externalId: z.string().trim().min(1).nullable(),
      })
      .strict()
      .nullable(),
    segmentRevision: z.number().int().positive().nullable(),
    observedAt: z.string().datetime({ offset: true }),
    computedAt: z.string().datetime({ offset: true }),
    calculationVersion: z.string().trim().min(1),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (provenance.source === "activity_file" && provenance.artifactIdentity === null) {
      context.addIssue({
        code: "custom",
        path: ["artifactIdentity"],
        message: "Activity-file provenance requires an artifact identity",
      });
    }
    if (provenance.source === "provider_summary" && provenance.providerIdentity === null) {
      context.addIssue({
        code: "custom",
        path: ["providerIdentity"],
        message: "Provider-summary provenance requires provider identity",
      });
    }
  });

const quantificationIdentityShape = {
  subjectIdentity: activityQuantificationSubjectIdentitySchema,
  evidenceIdentity: activityQuantificationEvidenceIdentitySchema,
  calculationIdentity: activityQuantificationCalculationIdentitySchema,
};

const quantificationQuantityShape = {
  activity_category: canonicalActivityCategorySchema,
  duration: activityDurationSchema,
  distance: activityDistanceSchema,
  /** The intact result retains method, calibration, evidence, coverage, model, and version. */
  commonLoad: commonLoadResultSchema,
};

const canonicalActivityPrescriptionQuantificationSchema = z
  .object({
    kind: z.literal("prescription"),
    stage: activityPrescriptionStageSchema,
    ...quantificationIdentityShape,
    ...quantificationQuantityShape,
    intensity: activityPrescriptionIntensitySchema,
  })
  .strict();

const canonicalActivityObservationQuantificationSchema = z
  .object({
    kind: z.literal("observation"),
    stage: activityObservationStageSchema,
    ...quantificationIdentityShape,
    ...quantificationQuantityShape,
    intensity: activityObservationIntensitySchema,
    completedProvenance: completedActivityQuantificationProvenanceSchema,
  })
  .strict();

type CanonicalActivityQuantification =
  | z.infer<typeof canonicalActivityPrescriptionQuantificationSchema>
  | z.infer<typeof canonicalActivityObservationQuantificationSchema>;

function addActivityQuantificationIssues(
  quantification: CanonicalActivityQuantification,
  context: z.RefinementCtx,
): void {
  if (
    quantification.calculationIdentity.model !== quantification.commonLoad.model ||
    quantification.calculationIdentity.version !== quantification.commonLoad.version ||
    quantification.calculationIdentity.computedAt !== quantification.commonLoad.computedAsOf ||
    quantification.calculationIdentity.calibrationEvidenceFingerprint !==
      quantification.commonLoad.evidenceFingerprint ||
    quantification.calculationIdentity.memberCalculationFingerprints.length !== 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["calculationIdentity"],
      message: "Calculation identity must cover the canonical Common Load calculation",
    });
  }
  if (quantification.commonLoad.activity_category !== quantification.activity_category) {
    context.addIssue({
      code: "custom",
      path: ["commonLoad", "activity_category"],
      message: "Common Load activity category must match the quantified activity",
    });
  }
  if (quantification.kind === "observation") {
    if (quantification.completedProvenance.computedAt !== quantification.commonLoad.computedAsOf) {
      context.addIssue({
        code: "custom",
        path: ["completedProvenance", "computedAt"],
        message: "Readable provenance and Common Load computed time must agree",
      });
    }
    const subject = quantification.subjectIdentity;
    const activityId =
      subject.subjectType === "activity"
        ? subject.activityId
        : subject.subjectType === "segment" &&
            subject.parentSubjectIdentity.subjectType === "activity"
          ? subject.parentSubjectIdentity.activityId
          : null;
    if (activityId === null) {
      context.addIssue({
        code: "custom",
        path: ["subjectIdentity"],
        message: "A final observation requires an activity or activity-segment subject",
      });
    }
    if (activityId !== null && activityId !== quantification.completedProvenance.activityId) {
      context.addIssue({
        code: "custom",
        path: ["completedProvenance", "activityId"],
        message: "Readable provenance activity ID must match the observation subject",
      });
    }
    if (
      subject.subjectType === "segment" &&
      subject.segmentId !== quantification.completedProvenance.segmentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["completedProvenance", "segmentId"],
        message: "Readable provenance segment ID must match the observation subject",
      });
    }
    const expectedEvidenceType =
      quantification.completedProvenance.source === "activity_file"
        ? "activity_artifact"
        : quantification.completedProvenance.source === "provider_summary"
          ? "provider_summary"
          : "segment_facts";
    if (quantification.evidenceIdentity.evidenceType !== expectedEvidenceType) {
      context.addIssue({
        code: "custom",
        path: ["evidenceIdentity", "evidenceType"],
        message: "Completed provenance source must match its evidence identity type",
      });
    }
    const requiredSourceIds = [
      quantification.completedProvenance.activityId,
      quantification.completedProvenance.segmentId,
      quantification.completedProvenance.artifactIdentity,
      quantification.completedProvenance.providerIdentity?.provider,
      quantification.completedProvenance.providerIdentity?.externalId,
    ].filter((value): value is string => value !== null && value !== undefined);
    if (
      requiredSourceIds.some(
        (sourceId) => !quantification.evidenceIdentity.sourceIds.includes(sourceId),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceIdentity", "sourceIds"],
        message: "Completed evidence identity must retain every readable provenance source ID",
      });
    }
  }
}

export const activityPrescriptionQuantificationSchema =
  canonicalActivityPrescriptionQuantificationSchema.superRefine(addActivityQuantificationIssues);

export const activityObservationQuantificationSchema =
  canonicalActivityObservationQuantificationSchema.superRefine(addActivityQuantificationIssues);

export const activityQuantificationSchema = z
  .discriminatedUnion("kind", [
    canonicalActivityPrescriptionQuantificationSchema,
    canonicalActivityObservationQuantificationSchema,
  ])
  .superRefine(addActivityQuantificationIssues);

const aggregateCountShape = {
  evidenceRole: z.literal("derived"),
  totalCount: z.number().int().nonnegative(),
  availableCount: z.number().int().nonnegative(),
  partialCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
};

export const aggregateActivityQuantityUnavailableReasonSchema = z.enum([
  "empty_input",
  "no_available_values",
]);

function addAggregateCountIssues(
  aggregate: {
    status: "complete" | "partial" | "unavailable";
    totalCount: number;
    availableCount: number;
    partialCount: number;
    unavailableCount: number;
    reason?: "empty_input" | "no_available_values" | "incomplete_members";
  },
  context: z.RefinementCtx,
): void {
  const contributorCount = aggregate.availableCount + aggregate.partialCount;
  if (
    aggregate.availableCount + aggregate.partialCount + aggregate.unavailableCount !==
    aggregate.totalCount
  ) {
    context.addIssue({ code: "custom", message: "Aggregate member counts must equal total count" });
  }
  if (
    aggregate.status === "complete" &&
    (aggregate.totalCount === 0 ||
      aggregate.availableCount !== aggregate.totalCount ||
      aggregate.partialCount !== 0 ||
      aggregate.unavailableCount !== 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "Complete quantities require every member to be available",
    });
  }
  if (
    aggregate.status === "partial" &&
    (contributorCount === 0 || aggregate.availableCount === aggregate.totalCount)
  ) {
    context.addIssue({
      code: "custom",
      message: "Partial quantities require a contributor and at least one incomplete member",
    });
  }
  if (aggregate.status === "unavailable") {
    if (contributorCount !== 0) {
      context.addIssue({
        code: "custom",
        message: "Unavailable quantities cannot contain contributing members",
      });
    }
    if (
      (aggregate.totalCount === 0 && aggregate.reason !== "empty_input") ||
      (aggregate.totalCount > 0 && aggregate.reason !== "no_available_values")
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Unavailable quantity reason must distinguish empty from unavailable members",
      });
    }
  }
}

export const aggregateActivityDurationValueSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("complete"),
        ...aggregateCountShape,
        value: finiteNonnegativeNumberSchema,
        unit: z.literal("seconds"),
      })
      .strict(),
    z
      .object({
        status: z.literal("partial"),
        ...aggregateCountShape,
        value: finiteNonnegativeNumberSchema,
        unit: z.literal("seconds"),
        reason: z.literal("incomplete_members"),
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        ...aggregateCountShape,
        value: z.null(),
        unit: z.literal("seconds"),
        reason: aggregateActivityQuantityUnavailableReasonSchema,
      })
      .strict(),
  ])
  .superRefine(addAggregateCountIssues);

export type AggregateActivityDurationValue = z.infer<typeof aggregateActivityDurationValueSchema>;

function availableAggregateDurationValue(value: AggregateActivityDurationValue): number | null {
  return value.status === "unavailable" ? null : value.value;
}

export const aggregateActivityDurationSchema = z
  .object({
    elapsed: aggregateActivityDurationValueSchema,
    active: aggregateActivityDurationValueSchema,
    moving: aggregateActivityDurationValueSchema,
  })
  .strict()
  .superRefine((duration, context) => {
    const elapsed = availableAggregateDurationValue(duration.elapsed);
    const active = availableAggregateDurationValue(duration.active);
    const moving = availableAggregateDurationValue(duration.moving);
    if (elapsed !== null && active !== null && active > elapsed) {
      context.addIssue({
        code: "custom",
        path: ["active", "value"],
        message: "Aggregate active duration cannot exceed aggregate elapsed duration",
      });
    }
    if (elapsed !== null && moving !== null && moving > elapsed) {
      context.addIssue({
        code: "custom",
        path: ["moving", "value"],
        message: "Aggregate moving duration cannot exceed aggregate elapsed duration",
      });
    }
    if (active !== null && moving !== null && moving > active) {
      context.addIssue({
        code: "custom",
        path: ["moving", "value"],
        message: "Aggregate moving duration cannot exceed aggregate active duration",
      });
    }
  });

export const aggregateActivityDistanceSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("complete"),
        ...aggregateCountShape,
        value: finiteNonnegativeNumberSchema,
        unit: z.literal("meters"),
      })
      .strict(),
    z
      .object({
        status: z.literal("partial"),
        ...aggregateCountShape,
        value: finiteNonnegativeNumberSchema,
        unit: z.literal("meters"),
        reason: z.literal("incomplete_members"),
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        ...aggregateCountShape,
        value: z.null(),
        unit: z.literal("meters"),
        reason: aggregateActivityQuantityUnavailableReasonSchema,
      })
      .strict(),
  ])
  .superRefine(addAggregateCountIssues);

export const activityQuantificationLifecycleSchema = z.enum(["prescription", "observation"]);
export const activityQuantificationSummaryScopeSchema = z.enum(["components", "collection"]);

const aggregateEvidenceDetailsSchema = z
  .object({
    lifecycle: activityQuantificationLifecycleSchema,
    summaryScope: activityQuantificationSummaryScopeSchema,
    memberEvidenceFingerprints: z
      .array(z.string().regex(/^activity-quantification:v1:fnv1a64:[0-9a-f]{16}$/))
      .max(10_000),
  })
  .strict();

export const aggregateActivityQuantificationSchema = z
  .object({
    kind: z.literal("aggregate"),
    lifecycle: activityQuantificationLifecycleSchema,
    summaryScope: activityQuantificationSummaryScopeSchema,
    subjectIdentity: activityQuantificationSubjectIdentitySchema,
    evidenceIdentity: activityQuantificationEvidenceIdentitySchema,
    calculationIdentity: activityQuantificationCalculationIdentitySchema,
    memberSubjectIdentities: z
      .array(activityQuantificationSubjectIdentitySchema)
      .max(10_000)
      .refine(
        (identities) =>
          new Set(identities.map((identity) => identity.fingerprint)).size === identities.length,
        { message: "Aggregate subject identities must be unique" },
      ),
    activity_categories: z
      .array(canonicalActivityCategorySchema)
      .max(canonicalActivityCategoryValues.length)
      .refine((categories) => new Set(categories).size === categories.length, {
        message: "Aggregate activity categories must be unique",
      }),
    duration: aggregateActivityDurationSchema,
    distance: aggregateActivityDistanceSchema,
    /** Existing Common Load aggregate coverage and model identity remain intact. */
    commonLoad: commonLoadAggregateSchema,
  })
  .strict()
  .superRefine((aggregate, context) => {
    const memberCount = aggregate.memberSubjectIdentities.length;
    if (
      aggregate.calculationIdentity.model !== aggregate.commonLoad.model ||
      aggregate.calculationIdentity.version !== aggregate.commonLoad.version
    ) {
      context.addIssue({
        code: "custom",
        path: ["calculationIdentity"],
        message: "Aggregate calculation identity must match the Common Load model and version",
      });
    }
    if (aggregate.calculationIdentity.memberCalculationFingerprints.length !== memberCount) {
      context.addIssue({
        code: "custom",
        path: ["calculationIdentity", "memberCalculationFingerprints"],
        message: "Aggregate calculation identity must cover every summarized member",
      });
    }
    const evidenceDetails = aggregateEvidenceDetailsSchema.safeParse(
      aggregate.evidenceIdentity.details,
    );
    const sortedEvidenceSourceIds = [...aggregate.evidenceIdentity.sourceIds].sort();
    if (
      aggregate.evidenceIdentity.evidenceType !== "aggregate" ||
      aggregate.evidenceIdentity.revisionFingerprint !== null ||
      !evidenceDetails.success ||
      evidenceDetails.data.lifecycle !== aggregate.lifecycle ||
      evidenceDetails.data.summaryScope !== aggregate.summaryScope ||
      evidenceDetails.data.memberEvidenceFingerprints.length !== memberCount ||
      JSON.stringify(evidenceDetails.data.memberEvidenceFingerprints) !==
        JSON.stringify(sortedEvidenceSourceIds) ||
      JSON.stringify(aggregate.evidenceIdentity.sourceIds) !==
        JSON.stringify(sortedEvidenceSourceIds)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceIdentity"],
        message: "Aggregate evidence identity must canonically cover every summarized member",
      });
    }
    if (aggregate.summaryScope === "collection") {
      if (aggregate.subjectIdentity.subjectType !== "collection") {
        context.addIssue({
          code: "custom",
          path: ["subjectIdentity", "subjectType"],
          message: "A collection summary requires a collection subject identity",
        });
      } else if (
        aggregate.subjectIdentity.lifecycle !== aggregate.lifecycle ||
        JSON.stringify(aggregate.subjectIdentity.memberSubjectFingerprints) !==
          JSON.stringify(
            aggregate.memberSubjectIdentities.map((identity) => identity.fingerprint).sort(),
          )
      ) {
        context.addIssue({
          code: "custom",
          path: ["subjectIdentity"],
          message: "Collection subject identity must cover exactly the summarized subjects",
        });
      }
    } else {
      if (memberCount === 0) {
        context.addIssue({
          code: "custom",
          path: ["memberSubjectIdentities"],
          message: "A component summary requires at least one component",
        });
      }
      const componentSubjectType = aggregate.memberSubjectIdentities[0]?.subjectType;
      for (const [index, member] of aggregate.memberSubjectIdentities.entries()) {
        const parentSubjectIdentity =
          member.subjectType === "segment" || member.subjectType === "plan_occurrence"
            ? member.parentSubjectIdentity
            : null;
        if (
          parentSubjectIdentity === null ||
          member.subjectType !== componentSubjectType ||
          parentSubjectIdentity.fingerprint !== aggregate.subjectIdentity.fingerprint
        ) {
          context.addIssue({
            code: "custom",
            path: ["memberSubjectIdentities", index],
            message:
              "Component summaries require one component kind nested under one parent subject",
          });
        }
      }
    }
    const metricCounts = [
      aggregate.duration.elapsed.totalCount,
      aggregate.duration.active.totalCount,
      aggregate.duration.moving.totalCount,
      aggregate.distance.totalCount,
      aggregate.commonLoad.totalActivityCount,
    ];
    if (metricCounts.some((count) => count !== memberCount)) {
      context.addIssue({
        code: "custom",
        message: "Every aggregate coverage denominator must equal the member identity count",
      });
    }
  });

export const activityPrescriptionSummarySchema = z.intersection(
  aggregateActivityQuantificationSchema,
  z.object({ lifecycle: z.literal("prescription") }),
);

export const activityObservationSummarySchema = z.intersection(
  aggregateActivityQuantificationSchema,
  z.object({ lifecycle: z.literal("observation") }),
);

export type ActivityQuantificationEvidenceRole = z.infer<
  typeof activityQuantificationEvidenceRoleSchema
>;
export type ActivityDurationUnavailableReason = z.infer<
  typeof activityDurationUnavailableReasonSchema
>;
export type ActivityDurationPartialReason = z.infer<typeof activityDurationPartialReasonSchema>;
export type ActivityDuration = z.infer<typeof activityDurationSchema>;
export type ActivityDistanceUnavailableReason = z.infer<
  typeof activityDistanceUnavailableReasonSchema
>;
export type ActivityDistancePartialReason = z.infer<typeof activityDistancePartialReasonSchema>;
export type ActivityDistance = z.infer<typeof activityDistanceSchema>;
export type ActivityNativeIntensityValue = z.infer<typeof activityNativeIntensityValueSchema>;
export type PrescribedActivityIntensity = z.infer<typeof prescribedActivityIntensitySchema>;
export type ObservedActivityIntensity = z.infer<typeof observedActivityIntensitySchema>;
export type ActivityPrescriptionIntensity = z.infer<typeof activityPrescriptionIntensitySchema>;
export type ActivityObservationIntensity = z.infer<typeof activityObservationIntensitySchema>;
export type ActivityPrescriptionStage = z.infer<typeof activityPrescriptionStageSchema>;
export type ActivityObservationStage = z.infer<typeof activityObservationStageSchema>;
export type CompletedActivityQuantificationProvenance = z.infer<
  typeof completedActivityQuantificationProvenanceSchema
>;
export type ActivityPrescriptionQuantification = z.infer<
  typeof activityPrescriptionQuantificationSchema
>;
export type ActivityObservationQuantification = z.infer<
  typeof activityObservationQuantificationSchema
>;
export type ActivityQuantification = z.infer<typeof activityQuantificationSchema>;
export type AggregateActivityDuration = z.infer<typeof aggregateActivityDurationSchema>;
export type AggregateActivityDistance = z.infer<typeof aggregateActivityDistanceSchema>;
export type AggregateActivityQuantityUnavailableReason = z.infer<
  typeof aggregateActivityQuantityUnavailableReasonSchema
>;
export type AggregateActivityQuantification = z.infer<typeof aggregateActivityQuantificationSchema>;
export type ActivityQuantificationLifecycle = z.infer<typeof activityQuantificationLifecycleSchema>;
export type ActivityQuantificationSummaryScope = z.infer<
  typeof activityQuantificationSummaryScopeSchema
>;
export type ActivityPrescriptionSummary = z.infer<typeof activityPrescriptionSummarySchema>;
export type ActivityObservationSummary = z.infer<typeof activityObservationSummarySchema>;
export type ActivityComponentSummary = AggregateActivityQuantification & {
  summaryScope: "components";
};
export type ActivityCollectionSummary = AggregateActivityQuantification & {
  summaryScope: "collection";
};
