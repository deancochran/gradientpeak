import { z } from "zod";

import {
  type ActivityDurationValue,
  type ActivityNativeIntensityValue,
  type ActivityObservationQuantification,
  activityDistanceSchema,
  activityDurationSchema,
  activityDurationValueSchema,
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createSegmentActivityQuantificationSubjectIdentity,
  fingerprintActivityQuantification,
  observedActivityIntensitySchema,
} from "../activity-quantification";
import { commonLoadResultSchema } from "../load/common-relative-load";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

export const COMPLETED_ACTIVITY_OBSERVATION_MODEL = "completed_activity_segment";
export const COMPLETED_ACTIVITY_OBSERVATION_VERSION = "1";
export const COMPLETED_ACTIVITY_OBSERVATION_CALCULATION_VERSION = "completed_activity_segment_v1";

const nullableIdentityStringSchema = z.string().trim().min(1).nullable();
const nullablePositiveIntegerSchema = z.number().int().positive().nullable();
const nullableNonnegativeIntegerSchema = z.number().int().nonnegative().nullable();
const nullablePositiveMeasurementSchema = z.number().finite().positive().nullable();
const nullableNonnegativeMeasurementSchema = z.number().finite().nonnegative().nullable();
const rawSourceValueSchema = z.union([z.string().min(1).max(128), z.number().int()]).nullable();

export const completedActivityObservationSourceSchema = z
  .object({
    activityId: z.string().trim().min(1),
    segmentId: z.string().trim().min(1),
    provider: nullableIdentityStringSchema,
    externalId: nullableIdentityStringSchema,
    artifactId: nullableIdentityStringSchema,
    capability: z.enum(["activity_file", "provider_summary", "recording", "unknown"]),
    parserVersion: nullableIdentityStringSchema,
    decodedContractVersion: nullableIdentityStringSchema,
    materializerVersion: nullableIdentityStringSchema,
    segmentsRevision: nullablePositiveIntegerSchema,
    segmentRevision: nullablePositiveIntegerSchema,
    summaryVersion: z.literal(1),
    sourceSessionIndex: nullableNonnegativeIntegerSchema,
    sourceMessageIndex: nullableNonnegativeIntegerSchema,
    rawType: rawSourceValueSchema,
    rawSport: rawSourceValueSchema,
    rawSubSport: rawSourceValueSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (source.capability === "activity_file" && source.artifactId === null) {
      context.addIssue({
        code: "custom",
        path: ["artifactId"],
        message: "Activity-file capability requires source artifact identity",
      });
    }
    if (
      source.capability === "provider_summary" &&
      (source.provider === null || source.artifactId !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["capability"],
        message: "Provider-summary capability requires provider identity without an artifact",
      });
    }
    if (
      source.capability === "recording" &&
      (source.provider !== null || source.artifactId !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["capability"],
        message: "Recording capability cannot claim provider or artifact provenance",
      });
    }
  });

export const completedActivityObservationTimingSchema = z
  .object({
    coverage: z.enum(["complete", "partial", "unavailable"]),
    source: z.enum(["activity_file", "provider_summary", "recording", "unknown"]),
    basis: z.enum(["session_timing", "provider_active_summary", "recording_timer", "unknown"]),
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }),
    elapsedSeconds: z.number().finite().positive(),
    activeSeconds: z.number().finite().nonnegative().nullable(),
    movingSeconds: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((timing, context) => {
    const expectedBasis =
      timing.source === "activity_file"
        ? "session_timing"
        : timing.source === "provider_summary"
          ? "provider_active_summary"
          : timing.source === "recording"
            ? "recording_timer"
            : "unknown";
    if (timing.basis !== expectedBasis) {
      context.addIssue({
        code: "custom",
        path: ["basis"],
        message: "Timing basis must match its source provenance",
      });
    }
    if (Date.parse(timing.finishedAt) <= Date.parse(timing.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["finishedAt"],
        message: "Completed observation finish must follow its source start",
      });
    }
    if (
      (timing.coverage === "complete" &&
        (timing.activeSeconds === null || timing.movingSeconds === null)) ||
      (timing.coverage === "partial" &&
        timing.activeSeconds === null &&
        timing.movingSeconds === null) ||
      (timing.coverage === "unavailable" &&
        (timing.activeSeconds !== null || timing.movingSeconds !== null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message: "Timing coverage must match the available active and moving evidence",
      });
    }
    if (timing.activeSeconds !== null && timing.activeSeconds > timing.elapsedSeconds) {
      context.addIssue({
        code: "custom",
        path: ["activeSeconds"],
        message: "Observed active time cannot exceed elapsed time",
      });
    }
    if (timing.movingSeconds !== null && timing.movingSeconds > timing.elapsedSeconds) {
      context.addIssue({
        code: "custom",
        path: ["movingSeconds"],
        message: "Observed moving time cannot exceed elapsed time",
      });
    }
    if (
      timing.activeSeconds !== null &&
      timing.movingSeconds !== null &&
      timing.movingSeconds > timing.activeSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["movingSeconds"],
        message: "Observed moving time cannot exceed active time",
      });
    }
  });

export const completedActivityObservationDistanceSchema = z
  .object({
    meters: z.number().finite().nonnegative().nullable(),
    source: z.enum(["activity_file", "provider_summary", "recorded_stream", "unknown"]),
    basis: z.enum([
      "session_summary",
      "artifact_summary",
      "provider_summary",
      "stream_accumulation",
      "unknown",
    ]),
  })
  .strict()
  .superRefine((distance, context) => {
    const compatibleBasis =
      distance.source === "activity_file"
        ? distance.basis === "session_summary" || distance.basis === "artifact_summary"
        : distance.source === "provider_summary"
          ? distance.basis === "provider_summary"
          : distance.source === "recorded_stream"
            ? distance.basis === "stream_accumulation"
            : distance.basis === "unknown";
    if (!compatibleBasis) {
      context.addIssue({
        code: "custom",
        path: ["basis"],
        message: "Distance basis must match its source provenance",
      });
    }
  });

export const completedActivityObservationIntensityFactsSchema = z
  .object({
    averageHeartRateBpm: nullablePositiveMeasurementSchema,
    averagePowerWatts: nullableNonnegativeMeasurementSchema,
    averageSpeedMetersPerSecond: nullableNonnegativeMeasurementSchema,
    normalizedSpeedMetersPerSecond: nullablePositiveMeasurementSchema,
  })
  .strict();

export const completedActivityObservationInputSchema = z
  .object({
    activityCategory: canonicalActivityCategorySchema,
    source: completedActivityObservationSourceSchema,
    timing: completedActivityObservationTimingSchema,
    distance: completedActivityObservationDistanceSchema,
    intensity: completedActivityObservationIntensityFactsSchema,
    commonLoad: commonLoadResultSchema,
  })
  .strict();

export type CompletedActivityObservationInput = z.infer<
  typeof completedActivityObservationInputSchema
>;

function observedTimingValue(
  value: number | null,
  coverage: CompletedActivityObservationInput["timing"]["coverage"],
): ActivityDurationValue {
  if (value === null) {
    return activityDurationValueSchema.parse({
      status: "unavailable",
      evidenceRole: "measured",
      value: null,
      unit: "seconds",
      reason: coverage === "unavailable" ? "not_observed" : "source_missing",
    });
  }
  if (coverage === "partial") {
    return activityDurationValueSchema.parse({
      status: "partial",
      evidenceRole: "measured",
      value,
      unit: "seconds",
      reason: "source_incomplete",
    });
  }
  return activityDurationValueSchema.parse({
    status: "available",
    evidenceRole: "measured",
    value,
    unit: "seconds",
  });
}

function observedNativeIntensity(facts: CompletedActivityObservationInput["intensity"]) {
  const values: ActivityNativeIntensityValue[] = [];
  if (facts.averagePowerWatts !== null) {
    values.push({
      metric: "power",
      unit: "watts",
      magnitude: { kind: "point", value: facts.averagePowerWatts },
    });
  }
  if (facts.averageSpeedMetersPerSecond !== null) {
    values.push({
      metric: "speed",
      unit: "meters_per_second",
      magnitude: { kind: "point", value: facts.averageSpeedMetersPerSecond },
    });
  }
  if (facts.averageHeartRateBpm !== null) {
    values.push({
      metric: "heart_rate",
      unit: "beats_per_minute",
      magnitude: { kind: "point", value: facts.averageHeartRateBpm },
    });
  }
  return observedActivityIntensitySchema.parse(
    values.length === 0
      ? {
          status: "unavailable",
          evidenceRole: "measured",
          values: [],
          reason: "not_observed",
        }
      : {
          status: "available",
          evidenceRole: "measured",
          values,
        },
  );
}

/**
 * Adapts persisted completed-segment facts to the Stage 1 observation contract.
 * Common Load is accepted as an intact result and is never recalculated here.
 */
export function quantifyCompletedActivityObservation(
  input: CompletedActivityObservationInput,
): ActivityObservationQuantification {
  const parsed = completedActivityObservationInputSchema.parse(input);
  const commonLoad = commonLoadResultSchema.parse(parsed.commonLoad);
  const { computedAsOf: _computedAsOf, ...commonLoadEvidence } = commonLoad;
  const duration = activityDurationSchema.parse({
    elapsed: {
      status: "available",
      evidenceRole: "measured",
      value: parsed.timing.elapsedSeconds,
      unit: "seconds",
    },
    active: observedTimingValue(parsed.timing.activeSeconds, parsed.timing.coverage),
    moving: observedTimingValue(parsed.timing.movingSeconds, parsed.timing.coverage),
  });
  const distance = activityDistanceSchema.parse(
    parsed.distance.meters === null
      ? {
          status: "unavailable",
          evidenceRole: "measured",
          value: null,
          unit: "meters",
          reason: parsed.activityCategory === "strength" ? "not_applicable" : "not_observed",
        }
      : {
          status: "available",
          evidenceRole: "measured",
          value: parsed.distance.meters,
          unit: "meters",
        },
  );
  const activitySubjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
    activityId: parsed.source.activityId,
  });
  const subjectIdentity = createSegmentActivityQuantificationSubjectIdentity({
    segmentId: parsed.source.segmentId,
    parentSubjectIdentity: activitySubjectIdentity,
  });
  const sourceEvidence = {
    model: COMPLETED_ACTIVITY_OBSERVATION_MODEL,
    version: COMPLETED_ACTIVITY_OBSERVATION_VERSION,
    activityCategory: parsed.activityCategory,
    source: parsed.source,
    timing: parsed.timing,
    distance: parsed.distance,
    nativeIntensity: parsed.intensity,
    commonLoad: commonLoadEvidence,
  };
  const revisionFingerprint = fingerprintActivityQuantification(sourceEvidence);
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType:
      parsed.source.capability === "activity_file"
        ? "activity_artifact"
        : parsed.source.capability === "provider_summary"
          ? "provider_summary"
          : "segment_facts",
    sourceIds: [
      parsed.source.activityId,
      parsed.source.segmentId,
      ...(parsed.source.artifactId === null ? [] : [parsed.source.artifactId]),
      ...(parsed.source.provider === null ? [] : [parsed.source.provider]),
      ...(parsed.source.externalId === null ? [] : [parsed.source.externalId]),
    ],
    revisionFingerprint,
    details: sourceEvidence,
  });
  const calculationIdentity = createActivityQuantificationCalculationIdentity({
    model: commonLoad.model,
    version: commonLoad.version,
    computedAt: commonLoad.computedAsOf,
    calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
  });
  const observedIntensity = observedNativeIntensity(parsed.intensity);

  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity,
    calculationIdentity,
    activity_category: parsed.activityCategory,
    duration,
    distance,
    intensity: {
      observed: observedIntensity,
    },
    completedProvenance: {
      activityId: parsed.source.activityId,
      segmentId: parsed.source.segmentId,
      source: parsed.source.capability,
      artifactIdentity: parsed.source.artifactId,
      providerIdentity:
        parsed.source.provider === null
          ? null
          : { provider: parsed.source.provider, externalId: parsed.source.externalId },
      segmentRevision: parsed.source.segmentRevision,
      observedAt: parsed.timing.finishedAt,
      computedAt: commonLoad.computedAsOf,
      calculationVersion: COMPLETED_ACTIVITY_OBSERVATION_CALCULATION_VERSION,
    },
    commonLoad,
  });
}
