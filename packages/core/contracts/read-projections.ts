import { z } from "zod";

import { activityPlanStructureSchema } from "../activity-plan/structure-schema";
import { activityPrescriptionQuantificationBundleSchema } from "../activity-quantification/bundle";
import { activityPlanProjectionSchema } from "../activity-quantification/plan-projection";
import { completedSegmentSummarySchema } from "../activity-segments/completed-segment-schema";
import { plannedSessionProjectionSchema } from "../calendar/planned-session";
import { plannedSessionComparisonSchema } from "../calendar/planned-session-comparison";
import { groupEventRsvpStatusSchema } from "../groups/schemas";
import { activityLapRecordListSchema } from "../schemas/activity_streams";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

const identifierSchema = z.string().trim().min(1).max(128);
const hrefSchema = z.string().trim().startsWith("/").max(512);
const instantSchema = z.iso.datetime({ offset: true });
const calendarDateSchema = z.iso.date();

/** The source a plan viewer may rely on when interpreting an estimate-row value. */
export const activityPlanMetricProvenanceSchema = z.enum([
  "authored",
  "estimated",
  "plan_intent",
  "personalized",
]);
export type ActivityPlanMetricProvenance = z.infer<typeof activityPlanMetricProvenanceSchema>;

export const ACTIVITY_PLAN_METRIC_PROVENANCE_LABELS: Record<ActivityPlanMetricProvenance, string> =
  {
    authored: "Authored",
    estimated: "Estimated",
    plan_intent: "Plan intent",
    personalized: "Personalized",
  };

export const projectionOwnerSchema = z.strictObject({
  id: identifierSchema,
  username: z.string().trim().min(1).max(100).nullable(),
  avatarUrl: z.string().url().nullable(),
});
export type ProjectionOwner = z.infer<typeof projectionOwnerSchema>;

const semanticMetricBaseShape = {
  key: z.enum([
    "common_load",
    "normalized_intensity",
    "objective_intensity",
    "distance",
    "elapsed_duration",
    "active_duration",
    "moving_duration",
    "elevation_gain",
    "average_heart_rate",
    "average_power",
    "calories",
    "repetitions",
  ]),
  label: z.string().trim().min(1).max(80),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(48),
  /** Present on plan estimate rows; omitted by unrelated metric projections. */
  provenance: activityPlanMetricProvenanceSchema.nullable().optional(),
};

const semanticMetricAvailableSchema = z.strictObject({
  ...semanticMetricBaseShape,
  status: z.literal("available"),
  reason: z.null(),
});

const semanticMetricPartialSchema = z.strictObject({
  ...semanticMetricBaseShape,
  status: z.literal("partial"),
  reason: z.string().trim().min(1).max(160),
});

const semanticMetricUnavailableSchema = z.strictObject({
  key: semanticMetricBaseShape.key,
  label: z.string().trim().min(1).max(80),
  status: z.literal("unavailable"),
  value: z.null(),
  unit: z.string().trim().min(1).max(48).nullable(),
  reason: z.string().trim().min(1).max(160),
  provenance: activityPlanMetricProvenanceSchema.nullable().optional(),
});

/** A locale-neutral quantity. Surfaces choose formatting and preferred display units. */
export const semanticMetricSchema = z
  .discriminatedUnion("status", [
    semanticMetricAvailableSchema,
    semanticMetricPartialSchema,
    semanticMetricUnavailableSchema,
  ])
  .superRefine((metric, context) => {
    if (metric.key !== "objective_intensity") return;
    if (metric.status === "partial") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Objective intensity never exposes a partial numeric value",
      });
    }
    if (metric.unit !== "ratio") {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Objective intensity is always a ratio",
      });
    }
    if (metric.status === "unavailable" && metric.provenance !== null) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Unavailable objective intensity requires explicit null provenance",
      });
    }
    if (metric.status === "available" && metric.provenance !== "estimated") {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Available objective intensity requires estimated provenance",
      });
    }
  });
export type SemanticMetric = z.infer<typeof semanticMetricSchema>;

function semanticMetricListSchema(maximum: number) {
  return z
    .array(semanticMetricSchema)
    .max(maximum)
    .superRefine((metrics, context) => {
      const seen = new Set<string>();
      metrics.forEach((metric, index) => {
        if (seen.has(metric.key)) {
          context.addIssue({
            code: "custom",
            path: [index, "key"],
            message: `Duplicate semantic metric key: ${metric.key}`,
          });
        }
        seen.add(metric.key);
      });
    });
}

export function createSemanticMetric(value: unknown): SemanticMetric {
  return semanticMetricSchema.parse(value);
}

export const ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES = 64;
export const ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS = 31_536_000;
export const activityCardEffortLevelSchema = z.enum([
  "lowest",
  "lower",
  "steady",
  "higher",
  "highest",
]);
export type ActivityCardEffortLevel = z.infer<typeof activityCardEffortLevelSchema>;

/**
 * One threshold-free, ordinal point in a completed activity. Every point in a
 * profile uses one recorded signal and one activity-wide scale; it is not an
 * athlete zone, target ratio, or comparison between unrelated segment signals.
 */
export const activityCardEffortSampleSchema = z.strictObject({
  elapsedSeconds: z
    .number()
    .finite()
    .nonnegative()
    .max(ACTIVITY_CARD_EFFORT_PROFILE_MAX_ELAPSED_SECONDS),
  effortLevel: activityCardEffortLevelSchema,
});
export type ActivityCardEffortSample = z.infer<typeof activityCardEffortSampleSchema>;

export const activityCardEffortProfileSchema = z
  .strictObject({
    basis: z.literal("activity_wide_signal_ordinal"),
    samples: z
      .array(activityCardEffortSampleSchema)
      .min(2)
      .max(ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES),
  })
  .superRefine((profile, context) => {
    for (let index = 1; index < profile.samples.length; index += 1) {
      const previous = profile.samples[index - 1];
      const current = profile.samples[index];
      if (previous && current && current.elapsedSeconds <= previous.elapsedSeconds) {
        context.addIssue({
          code: "custom",
          path: ["samples", index, "elapsedSeconds"],
          message: "Elapsed time must be strictly increasing",
        });
      }
    }
  });
export type ActivityCardEffortProfile = z.infer<typeof activityCardEffortProfileSchema>;

/** Presentation-only ordering. No raw measurement or personal calibration is encoded. */
export function activityCardEffortLevelChartValue(level: ActivityCardEffortLevel): number {
  switch (level) {
    case "lowest":
      return 0;
    case "lower":
      return 1;
    case "steady":
      return 2;
    case "higher":
      return 3;
    case "highest":
      return 4;
  }
}

export const activityDisplayModelSchema = z.strictObject({
  contractVersion: z.literal("activity-display-v1"),
  id: identifierSchema,
  href: hrefSchema,
  owner: projectionOwnerSchema,
  time: z.strictObject({
    startedAt: instantSchema.nullable(),
    finishedAt: instantSchema.nullable(),
    diaryDate: z.iso.date().nullable().optional(),
    diaryTimezone: z.string().min(1).nullable().optional(),
  }),
  activityComposition: z.strictObject({
    kind: z.enum(["single", "multisport", "unknown"]),
    categories: z.array(canonicalActivityCategorySchema).max(16),
  }),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5_000).nullable(),
  metrics: semanticMetricListSchema(16),
  effortProfile: activityCardEffortProfileSchema.nullable().optional(),
  visibility: z.enum(["private", "followers", "public"]),
  engagement: z.strictObject({
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    viewerHasLiked: z.boolean(),
  }),
  capabilities: z.strictObject({
    canLike: z.boolean(),
    canComment: z.boolean(),
    canShare: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    hasRoute: z.boolean(),
  }),
});
export type ActivityDisplayModel = z.infer<typeof activityDisplayModelSchema>;

const activityDetailSegmentBaseShape = {
  id: identifierSchema,
  ordinal: z.number().int().nonnegative(),
  role: z.enum(["activity", "transition", "rest", "unknown"]),
  activityCategory: canonicalActivityCategorySchema.nullable(),
  timingCoverage: z.enum(["complete", "partial", "unavailable"]),
};

export const activityDetailSegmentSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...activityDetailSegmentBaseShape,
    status: z.literal("processing"),
    summary: z.null(),
  }),
  z.strictObject({
    ...activityDetailSegmentBaseShape,
    status: z.literal("available"),
    summary: completedSegmentSummarySchema,
  }),
  z.strictObject({
    ...activityDetailSegmentBaseShape,
    status: z.literal("failed"),
    summary: z.null(),
    reason: z.string().trim().min(1).max(512),
  }),
]);
export type ActivityDetailSegment = z.infer<typeof activityDetailSegmentSchema>;

const nullableFiniteNumberSchema = z.number().finite().nullable();

/** Protected presentation detail. Stream samples remain on the activity-files API. */
export const activityDetailDisplaySchema = z.strictObject({
  contractVersion: z.literal("activity-detail-display-v1"),
  summary: activityDisplayModelSchema,
  performance: z.strictObject({
    timingCoverage: z.enum(["complete", "partial", "unavailable"]),
    elapsedSeconds: nullableFiniteNumberSchema,
    activeSeconds: nullableFiniteNumberSchema,
    movingSeconds: nullableFiniteNumberSchema,
    distanceMeters: nullableFiniteNumberSchema,
    elevationGainMeters: nullableFiniteNumberSchema,
    calories: nullableFiniteNumberSchema,
    averageHeartRate: nullableFiniteNumberSchema,
    maximumHeartRate: nullableFiniteNumberSchema,
    averagePower: nullableFiniteNumberSchema,
    maximumPower: nullableFiniteNumberSchema,
    averageSpeedMetersPerSecond: nullableFiniteNumberSchema,
    maximumSpeedMetersPerSecond: nullableFiniteNumberSchema,
    poolLengthMeters: nullableFiniteNumberSchema,
    totalStrokes: nullableFiniteNumberSchema,
    averageSwolf: nullableFiniteNumberSchema,
  }),
  routePolyline: z.string().nullable(),
  laps: activityLapRecordListSchema,
  segments: z.array(activityDetailSegmentSchema).max(256),
  linkedPlan: z
    .strictObject({
      id: identifierSchema,
      name: z.string().trim().min(1).max(100),
    })
    .nullable(),
  linkedRoute: z
    .strictObject({
      id: identifierSchema,
      name: z.string().trim().min(1).max(100),
    })
    .nullable(),
  currentArtifact: z
    .strictObject({
      id: identifierSchema,
      format: z.string().trim().min(1).max(64),
      originalName: z.string().max(512).nullable(),
      availability: z.literal("accepted"),
    })
    .nullable(),
  ingestion: z
    .strictObject({
      status: z.string().trim().min(1).max(64),
      lastErrorMessage: z.string().max(2_000).nullable(),
    })
    .nullable(),
  effectiveSessionRpe: z
    .strictObject({
      id: identifierSchema,
      rpe: z.number().int().min(1).max(10),
      scale: z.literal("borg_cr10"),
      scaleVersion: z.literal("1"),
      source: z.enum(["user", "provider", "manual"]),
      recordedAt: instantSchema,
      correctedAt: instantSchema.nullable(),
    })
    .nullable(),
});
export type ActivityDetailDisplay = z.infer<typeof activityDetailDisplaySchema>;

const activityPlanCapabilitiesSchema = z.strictObject({
  canLike: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canDuplicate: z.boolean(),
  canSchedule: z.boolean(),
  canRecord: z.boolean(),
});

const activityPlanMetricKeys = [
  "distance",
  "elapsed_duration",
  "common_load",
  "objective_intensity",
] as const;

export const activityPlanMetricKeySchema = z.enum(activityPlanMetricKeys);
export type ActivityPlanMetricKey = z.infer<typeof activityPlanMetricKeySchema>;

const activityPlanMetricAvailableSchema = semanticMetricAvailableSchema.safeExtend({
  key: activityPlanMetricKeySchema,
  provenance: z.enum(["authored", "estimated"]),
});

const activityPlanMetricUnavailableSchema = semanticMetricUnavailableSchema.safeExtend({
  key: activityPlanMetricKeySchema,
  unit: z.string().trim().min(1).max(48),
  provenance: z.null(),
});

const activityPlanMetricUnits: Record<ActivityPlanMetricKey, string> = {
  distance: "meters",
  elapsed_duration: "seconds",
  common_load: "score",
  objective_intensity: "ratio",
};

/** A promoted headline is either complete with explicit provenance or unavailable with no value. */
export const activityPlanMetricSchema = z
  .discriminatedUnion("status", [
    activityPlanMetricAvailableSchema,
    activityPlanMetricUnavailableSchema,
  ])
  .superRefine((metric, context) => {
    if (metric.unit !== activityPlanMetricUnits[metric.key]) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: `Activity plan ${metric.key} must use ${activityPlanMetricUnits[metric.key]}`,
      });
    }
    if (
      metric.status === "available" &&
      (metric.key === "common_load" || metric.key === "objective_intensity") &&
      metric.provenance !== "estimated"
    ) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: `Calculated activity plan ${metric.key} requires estimated provenance`,
      });
    }
  });
export type ActivityPlanMetric = z.infer<typeof activityPlanMetricSchema>;

export function createActivityPlanMetric(value: unknown): ActivityPlanMetric {
  return activityPlanMetricSchema.parse(value);
}

/** Exactly one canonical value for every metric supported by activity-plan projections. */
export const activityPlanMetricListSchema = z
  .array(activityPlanMetricSchema)
  .length(activityPlanMetricKeys.length)
  .superRefine((metrics, context) => {
    for (const key of activityPlanMetricKeys) {
      const matchingIndexes = metrics.flatMap((metric, index) =>
        metric.key === key ? [index] : [],
      );
      if (matchingIndexes.length === 0) {
        context.addIssue({
          code: "custom",
          message: `Activity plan metrics must include ${key} exactly once`,
        });
      }
      for (const duplicateIndex of matchingIndexes.slice(1)) {
        context.addIssue({
          code: "custom",
          path: [duplicateIndex, "key"],
          message: `Activity plan metric ${key} must appear exactly once`,
        });
      }
    }

    metrics.forEach((metric, index) => {
      if (!(activityPlanMetricKeys as readonly string[]).includes(metric.key)) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `Unsupported activity plan metric: ${metric.key}`,
        });
      }
    });
  });
export type ActivityPlanMetricList = z.infer<typeof activityPlanMetricListSchema>;

const activityPlanSummaryShape = {
  contractVersion: z.literal("activity-plan-summary-v1"),
  id: identifierSchema,
  href: hrefSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  owner: projectionOwnerSchema.nullable(),
  activityCategory: canonicalActivityCategorySchema,
  activityPlanRevision: z.number().int().positive(),
  /** Authored prescription data used by every plan presentation surface. */
  structure: activityPlanStructureSchema,
  /** Owner-only prescription detail. Non-owner projections omit this key entirely. */
  prescriptionQuantification: activityPrescriptionQuantificationBundleSchema.nullable().optional(),
  /** Authored-only quantities retain compiled completion-policy scope. */
  planProjection: activityPlanProjectionSchema.optional(),
  metrics: activityPlanMetricListSchema,
  visibility: z.enum(["private", "followers", "public"]),
  isSystemTemplate: z.boolean(),
  engagement: z.strictObject({
    likes: z.number().int().nonnegative(),
    viewerHasLiked: z.boolean(),
  }),
  capabilities: activityPlanCapabilitiesSchema,
};

type ActivityPlanProjectionPrivacyValue = {
  capabilities: {
    canEdit: boolean;
    canRecord: boolean;
    canSchedule: boolean;
  };
  metrics: readonly unknown[];
  prescriptionQuantification?: unknown;
  structure: unknown;
};

function enforceActivityPlanProjectionPrivacy(
  projection: ActivityPlanProjectionPrivacyValue,
  context: z.RefinementCtx,
): void {
  const hasPrescriptionQuantification = Object.hasOwn(projection, "prescriptionQuantification");

  if (projection.capabilities.canEdit) {
    if (!hasPrescriptionQuantification) {
      context.addIssue({
        code: "custom",
        path: ["prescriptionQuantification"],
        message: "Owner projections must include prescription quantification state",
      });
    }
    return;
  }

  if (hasPrescriptionQuantification) {
    context.addIssue({
      code: "custom",
      path: ["prescriptionQuantification"],
      message: "Non-owner projections must omit personalized prescription quantification",
    });
  }
  if (
    projection.metrics.some(
      (metric) =>
        typeof metric === "object" &&
        metric !== null &&
        "provenance" in metric &&
        metric.provenance === "personalized",
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["metrics"],
      message: "Non-owner projections must not include personalized plan metrics",
    });
  }
  if (projection.capabilities.canRecord) {
    context.addIssue({
      code: "custom",
      path: ["capabilities"],
      message: "Recording this plan is not available to the current viewer",
    });
  }
}

export const activityPlanSummarySchema = z
  .strictObject(activityPlanSummaryShape)
  .superRefine(enforceActivityPlanProjectionPrivacy);
export type ActivityPlanSummary = z.infer<typeof activityPlanSummarySchema>;

export const scheduledActivityPlanSummarySchema = z
  .strictObject({
    ...activityPlanSummaryShape,
    contractVersion: z.literal("scheduled-activity-plan-summary-v1"),
    schedule: z.strictObject({
      eventId: identifierSchema,
      calendarDate: calendarDateSchema,
      startsAt: instantSchema.nullable(),
      endsAt: instantSchema.nullable(),
      allDay: z.boolean(),
      status: z.enum(["scheduled", "completed", "cancelled", "expired"]),
      trainingPlanId: identifierSchema.nullable(),
    }),
  })
  .superRefine(enforceActivityPlanProjectionPrivacy);
export type ScheduledActivityPlanSummary = z.infer<typeof scheduledActivityPlanSummarySchema>;

export const activityPlanDetailSchema = z
  .strictObject({
    ...activityPlanSummaryShape,
    contractVersion: z.literal("activity-plan-detail-v1"),
    /** These authoring fields are present only for the owner. */
    notes: z.string().max(1_000).nullable().optional(),
    structureHash: z.string().trim().min(1).max(128).optional(),
    gpsRecordingEnabled: z.boolean().optional(),
  })
  .superRefine((projection, context) => {
    enforceActivityPlanProjectionPrivacy(projection, context);
    const ownerOnlyFields = ["notes", "structureHash", "gpsRecordingEnabled"] as const;
    for (const key of ownerOnlyFields) {
      const hasField = Object.hasOwn(projection, key);
      if (projection.capabilities.canEdit !== hasField) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: projection.capabilities.canEdit
            ? "Owner detail projections must include authoring fields"
            : "Non-owner detail projections must omit authoring fields",
        });
      }
    }
  });
export type ActivityPlanDetail = z.infer<typeof activityPlanDetailSchema>;

/**
 * Calendar date and rendered time share one zone. For group events that zone
 * is the event's timezone; the range timezone must not override it.
 */
export const calendarProjectionItemSchema = z
  .strictObject({
    id: identifierSchema,
    calendarDate: calendarDateSchema,
    timing: z.strictObject({
      startsAt: instantSchema.nullable(),
      endsAt: instantSchema.nullable(),
      allDay: z.boolean(),
      timezone: z.string().trim().min(1).max(64),
    }),
    kind: z.enum(["planned_activity", "completed_activity", "event", "group_event", "goal"]),
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().min(1).max(500).nullable(),
    status: z.enum(["scheduled", "completed", "cancelled", "expired", "active"]),
    navigation: z.strictObject({
      target: z.enum(["activity", "event", "group_event", "goal", "activity_plan"]),
      href: hrefSchema,
    }),
    metrics: semanticMetricListSchema(16),
    estimated: z.boolean(),
    partial: z.boolean(),
    plan: scheduledActivityPlanSummarySchema.nullable(),
    plannedSession: plannedSessionProjectionSchema.nullable().default(null),
    plannedActual: plannedSessionComparisonSchema.nullable().default(null),
    activity: activityDisplayModelSchema.nullable(),
    event: z
      .strictObject({
        type: z.enum(["planned", "race_target", "custom"]),
        trainingPlanId: identifierSchema.nullable(),
      })
      .nullable(),
    groupEvent: z
      .strictObject({
        group: z.strictObject({ id: identifierSchema, name: z.string().trim().min(1).max(200) }),
        viewerRsvpStatus: groupEventRsvpStatusSchema.nullable(),
      })
      .nullable(),
    goal: z
      .strictObject({
        typeLabel: z.string().trim().min(1).max(100),
        objectiveSummary: z.string().trim().min(1).max(500),
      })
      .nullable(),
  })
  .superRefine((item, context) => {
    const checks = [
      {
        field: "activity",
        valid:
          item.kind === "completed_activity"
            ? item.activity !== null
            : (item.kind === "planned_activity" || item.kind === "event") &&
                item.status === "completed"
              ? true
              : item.activity === null,
      },
      {
        field: "event",
        valid:
          item.kind === "event"
            ? item.event !== null
            : item.kind === "planned_activity"
              ? item.event !== null || item.plannedSession !== null
              : item.event === null,
      },
      {
        field: "plannedSession",
        valid: item.plannedSession === null || item.kind === "planned_activity",
      },
      {
        field: "plannedActual",
        valid: item.plannedActual === null || item.kind === "planned_activity",
      },
      { field: "groupEvent", valid: (item.groupEvent !== null) === (item.kind === "group_event") },
      { field: "goal", valid: (item.goal !== null) === (item.kind === "goal") },
    ];
    for (const check of checks) {
      if (!check.valid) {
        context.addIssue({
          code: "custom",
          path: [check.field],
          message: "Context does not match item kind",
        });
      }
    }
  });
export type CalendarProjectionItem = z.infer<typeof calendarProjectionItemSchema>;

const calendarKindOrder: Record<CalendarProjectionItem["kind"], number> = {
  goal: 0,
  group_event: 1,
  planned_activity: 2,
  event: 3,
  completed_activity: 4,
};

export function compareCalendarProjectionItems(
  left: CalendarProjectionItem,
  right: CalendarProjectionItem,
): number {
  const dateOrder = left.calendarDate.localeCompare(right.calendarDate);
  if (dateOrder !== 0) return dateOrder;

  // All-day anchors are placed first, timed items are ordered by instant, and
  // non-all-day items without an instant are placed last. Never compare ISO
  // strings lexically because equivalent offsets do not sort chronologically.
  const placement = (item: CalendarProjectionItem) =>
    item.timing.allDay ? 0 : item.timing.startsAt ? 1 : 2;
  const placementOrder = placement(left) - placement(right);
  if (placementOrder !== 0) return placementOrder;
  if (!left.timing.allDay && left.timing.startsAt && right.timing.startsAt) {
    const timeOrder = Date.parse(left.timing.startsAt) - Date.parse(right.timing.startsAt);
    if (timeOrder !== 0) return timeOrder;
  }
  const kindOrder = calendarKindOrder[left.kind] - calendarKindOrder[right.kind];
  return kindOrder || left.id.localeCompare(right.id);
}

export const calendarProjectionRangeSchema = z
  .strictObject({
    contractVersion: z.literal("calendar-projection-v1"),
    startDate: calendarDateSchema,
    endDateExclusive: calendarDateSchema,
    timezone: z.string().trim().min(1).max(64),
    items: z.array(calendarProjectionItemSchema).max(2_000),
    truncated: z.boolean(),
    truncation: z.strictObject({
      events: z.boolean(),
      plannedSessions: z.boolean(),
      completedActivities: z.boolean(),
      groupEvents: z.boolean(),
      goals: z.boolean(),
    }),
  })
  .superRefine((range, context) => {
    if (range.startDate >= range.endDateExclusive) {
      context.addIssue({
        code: "custom",
        path: ["endDateExclusive"],
        message: "Range must be positive",
      });
    }
    for (const [index, item] of range.items.entries()) {
      if (item.calendarDate < range.startDate || item.calendarDate >= range.endDateExclusive) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "calendarDate"],
          message: "Item is outside the range",
        });
      }
      const previousItem = range.items[index - 1];
      if (previousItem && compareCalendarProjectionItems(previousItem, item) > 0) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Items are not canonically ordered",
        });
      }
    }
  });
export type CalendarProjectionRange = z.infer<typeof calendarProjectionRangeSchema>;
