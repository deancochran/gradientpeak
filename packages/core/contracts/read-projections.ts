import { z } from "zod";

import { activityPlanStructureSchema } from "../activity-plan/structure-schema";
import { activityPrescriptionQuantificationBundleSchema } from "../activity-quantification/bundle";
import { completedSegmentSummarySchema } from "../activity-segments/completed-segment-schema";
import { activityLapRecordListSchema } from "../schemas/activity_streams";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

const identifierSchema = z.string().trim().min(1).max(128);
const hrefSchema = z.string().trim().startsWith("/").max(512);
const instantSchema = z.iso.datetime({ offset: true });
const calendarDateSchema = z.iso.date();

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
});

/** A locale-neutral quantity. Surfaces choose formatting and preferred display units. */
export const semanticMetricSchema = z.discriminatedUnion("status", [
  semanticMetricAvailableSchema,
  semanticMetricPartialSchema,
  semanticMetricUnavailableSchema,
]);
export type SemanticMetric = z.infer<typeof semanticMetricSchema>;

export function createSemanticMetric(value: unknown): SemanticMetric {
  return semanticMetricSchema.parse(value);
}

export const activityDisplayModelSchema = z.strictObject({
  contractVersion: z.literal("activity-display-v1"),
  id: identifierSchema,
  href: hrefSchema,
  owner: projectionOwnerSchema,
  time: z.strictObject({
    startedAt: instantSchema,
    finishedAt: instantSchema.nullable(),
  }),
  activityComposition: z.strictObject({
    kind: z.enum(["single", "multisport", "unknown"]),
    categories: z.array(canonicalActivityCategorySchema).max(16),
  }),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5_000).nullable(),
  metrics: z.array(semanticMetricSchema).max(16),
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
    elapsedSeconds: z.number().finite().nonnegative(),
    activeSeconds: nullableFiniteNumberSchema,
    movingSeconds: nullableFiniteNumberSchema,
    distanceMeters: z.number().finite().nonnegative(),
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
  structure: activityPlanStructureSchema,
  prescriptionQuantification: activityPrescriptionQuantificationBundleSchema.nullable(),
  metrics: z.array(semanticMetricSchema).max(8),
  visibility: z.enum(["private", "followers", "public"]),
  isSystemTemplate: z.boolean(),
  engagement: z.strictObject({
    likes: z.number().int().nonnegative(),
    viewerHasLiked: z.boolean(),
  }),
  capabilities: activityPlanCapabilitiesSchema,
};

export const activityPlanSummarySchema = z.strictObject(activityPlanSummaryShape);
export type ActivityPlanSummary = z.infer<typeof activityPlanSummarySchema>;

export const scheduledActivityPlanSummarySchema = z.strictObject({
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
});
export type ScheduledActivityPlanSummary = z.infer<typeof scheduledActivityPlanSummarySchema>;

export const activityPlanDetailSchema = z.strictObject({
  ...activityPlanSummaryShape,
  contractVersion: z.literal("activity-plan-detail-v1"),
  notes: z.string().max(1_000).nullable(),
  structureHash: z.string().trim().min(1).max(128),
  gpsRecordingEnabled: z.boolean(),
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
    metrics: z.array(semanticMetricSchema).max(8),
    estimated: z.boolean(),
    partial: z.boolean(),
    plan: scheduledActivityPlanSummarySchema.nullable(),
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
        viewerRsvpStatus: z.literal("declined").nullable(),
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
        valid: (item.activity !== null) === (item.kind === "completed_activity"),
      },
      {
        field: "event",
        valid:
          (item.event !== null) === (item.kind === "planned_activity" || item.kind === "event"),
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
