// packages/core/schemas/planned_activity.ts
import { z } from "zod";

const dateTimeStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date format");

const dateOnlyStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)");

const rruleFrequencies = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

function isValidIcalRRule(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.includes("\r")) {
    return false;
  }

  const body = trimmed.startsWith("RRULE:") ? trimmed.slice(6) : trimmed;
  if (!body) return false;

  const parts = body.split(";");
  const tokens = new Map<string, string>();

  for (const part of parts) {
    const [key, rawValue, ...rest] = part.split("=");
    if (!key || !rawValue || rest.length > 0) return false;
    if (!/^[A-Z][A-Z0-9_-]*$/.test(key)) return false;
    if (!/^[^;\r\n]+$/.test(rawValue)) return false;
    if (tokens.has(key)) return false;
    tokens.set(key, rawValue);
  }

  const freq = tokens.get("FREQ");
  if (!freq || !rruleFrequencies.has(freq)) return false;

  const interval = tokens.get("INTERVAL");
  if (interval && (!/^\d+$/.test(interval) || Number(interval) < 1)) {
    return false;
  }

  const count = tokens.get("COUNT");
  if (count && (!/^\d+$/.test(count) || Number(count) < 1)) {
    return false;
  }

  const until = tokens.get("UNTIL");
  if (until && !/^\d{8}(T\d{6}Z)?$/.test(until)) {
    return false;
  }

  if (count && until) return false;

  const byDay = tokens.get("BYDAY");
  if (byDay) {
    const days = byDay.split(",");
    if (days.length === 0) return false;
    for (const day of days) {
      if (!/^(-?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.test(day)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Event types used by the core event domain.
 *
 * - "planned": user/programmed planned workout
 * - "rest_day": planned rest day block
 * - "race_target": race/goal target marker
 * - "custom": user-authored non-workout event
 * - "imported": read-only external calendar import
 */
export const eventTypeSchema = z.enum(["planned", "rest_day", "race_target", "custom", "imported"]);

/**
 * Backward-compatible parser for legacy persisted enum values.
 */
export const eventTypeInputSchema = z
  .union([eventTypeSchema, z.literal("planned_activity"), z.literal("race")])
  .transform((eventType) => {
    if (eventType === "planned_activity") return "planned" as const;
    if (eventType === "race") return "race_target" as const;
    return eventType;
  });

export const editableEventTypeSchema = z.enum(["planned", "rest_day", "race_target", "custom"]);

export const eventMutationScopeSchema = z.enum(["single", "future", "series"]);

export const iCalRRuleSchema = z
  .string()
  .trim()
  .min(1, "RRULE is required")
  .max(1000, "RRULE is too long")
  .refine(isValidIcalRRule, "Invalid iCal RRULE string");

export const eventRecurrenceExceptionSchema = z
  .object({
    occurrence_date: dateOnlyStringSchema,
    action: z.enum(["cancelled", "modified"]).default("modified"),
    starts_at: dateTimeStringSchema.optional(),
    ends_at: dateTimeStringSchema.nullable().optional(),
  })
  .superRefine((exception, ctx) => {
    if (exception.action === "modified" && !exception.starts_at) {
      ctx.addIssue({
        code: "custom",
        path: ["starts_at"],
        message: 'starts_at is required when exception action is "modified"',
      });
    }
  });

export const eventRecurrenceSchema = z
  .object({
    rule: iCalRRuleSchema,
    timezone: z.string().min(1, "Timezone is required").max(120),
    exdates: z.array(dateOnlyStringSchema).default([]),
    exceptions: z.array(eventRecurrenceExceptionSchema).default([]),
  })
  .superRefine((recurrence, ctx) => {
    const uniqueExdates = new Set(recurrence.exdates);
    if (uniqueExdates.size !== recurrence.exdates.length) {
      ctx.addIssue({
        code: "custom",
        path: ["exdates"],
        message: "exdates must not contain duplicates",
      });
    }

    const exceptionDateSet = new Set<string>();
    for (const [index, exception] of recurrence.exceptions.entries()) {
      if (exceptionDateSet.has(exception.occurrence_date)) {
        ctx.addIssue({
          code: "custom",
          path: ["exceptions", index, "occurrence_date"],
          message: "Only one exception is allowed per occurrence_date",
        });
      }
      exceptionDateSet.add(exception.occurrence_date);

      if (uniqueExdates.has(exception.occurrence_date)) {
        ctx.addIssue({
          code: "custom",
          path: ["exceptions", index, "occurrence_date"],
          message: "occurrence_date cannot be listed in both exceptions and exdates",
        });
      }
    }
  });

export const eventLifecycleStatusSchema = z.enum([
  "scheduled",
  "completed",
  "cancelled",
  "deleted",
]);

export const cancelledMetadataSchema = z.object({
  cancelled_at: dateTimeStringSchema,
  cancelled_reason: z.string().max(500).nullable().optional(),
  cancelled_by: z.string().uuid().nullable().optional(),
});

export const deletedMetadataSchema = z.object({
  deleted_at: dateTimeStringSchema,
  deleted_reason: z.string().max(500).nullable().optional(),
  deleted_by: z.string().uuid().nullable().optional(),
});

export const eventLifecycleSchema = z
  .object({
    status: eventLifecycleStatusSchema.default("scheduled"),
    cancelled: cancelledMetadataSchema.nullable().optional(),
    deleted: deletedMetadataSchema.nullable().optional(),
  })
  .superRefine((lifecycle, ctx) => {
    const hasCancelled = Boolean(lifecycle.cancelled);
    const hasDeleted = Boolean(lifecycle.deleted);

    if (lifecycle.status === "cancelled" && !hasCancelled) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelled"],
        message: 'cancelled metadata is required when status is "cancelled"',
      });
    }

    if (lifecycle.status === "deleted" && !hasDeleted) {
      ctx.addIssue({
        code: "custom",
        path: ["deleted"],
        message: 'deleted metadata is required when status is "deleted"',
      });
    }

    if (lifecycle.status !== "cancelled" && hasCancelled) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelled"],
        message: 'cancelled metadata is only allowed when status is "cancelled"',
      });
    }

    if (lifecycle.status !== "deleted" && hasDeleted) {
      ctx.addIssue({
        code: "custom",
        path: ["deleted"],
        message: 'deleted metadata is only allowed when status is "deleted"',
      });
    }
  });

export const importedEventSourceMetadataSchema = z
  .object({
    provider: z.literal("ical").default("ical"),
    feed_id: z.string().min(1).max(255).optional(),
    feed_url: z.string().url().optional(),
    external_uid: z.string().min(1).max(512),
    external_event_id: z.string().min(1).max(512).nullable().optional(),
    etag: z.string().max(1024).nullable().optional(),
    content_hash: z.string().max(1024).nullable().optional(),
    last_synced_at: dateTimeStringSchema.optional(),
    last_modified_at: dateTimeStringSchema.optional(),
  })
  .superRefine((source, ctx) => {
    if (!source.feed_id && !source.feed_url) {
      ctx.addIssue({
        code: "custom",
        path: ["feed_id"],
        message: "Either feed_id or feed_url is required for imported events",
      });
    }
  });

const eventDomainBaseSchema = z.object({
  title: z.string().min(1).max(255),
  starts_at: dateTimeStringSchema,
  ends_at: dateTimeStringSchema.nullable().optional(),
  all_day: z.boolean().default(false),
  timezone: z.string().min(1).max(120).default("UTC"),
  notes: z.string().max(2000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  activity_plan_id: z.string().uuid().nullable().optional(),
  training_plan_id: z.string().uuid().nullable().optional(),
  recurrence: eventRecurrenceSchema.optional(),
  lifecycle: eventLifecycleSchema.default({ status: "scheduled" }),
});

const editableEventDomainBaseSchema = eventDomainBaseSchema.extend({
  event_type: editableEventTypeSchema,
  source: z.undefined().optional(),
  read_only: z.boolean().optional(),
});

export const editableEventDomainSchema = editableEventDomainBaseSchema
  .extend({
    event_type: editableEventTypeSchema.default("planned"),
    read_only: z.boolean().optional().default(false),
  })
  .superRefine((event, ctx) => {
    if (event.event_type === "planned" && !event.activity_plan_id) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_plan_id"],
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (event.event_type === "rest_day" && event.activity_plan_id) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_plan_id"],
        message: 'activity_plan_id must be omitted when event_type is "rest_day"',
      });
    }
  });

export const editableEventPatchSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    starts_at: dateTimeStringSchema.optional(),
    ends_at: dateTimeStringSchema.nullable().optional(),
    all_day: z.boolean().optional(),
    timezone: z.string().min(1).max(120).optional(),
    notes: z.string().max(2000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    activity_plan_id: z.string().uuid().nullable().optional(),
    training_plan_id: z.string().uuid().nullable().optional(),
    recurrence: eventRecurrenceSchema.optional(),
    lifecycle: eventLifecycleSchema.optional(),
    event_type: editableEventTypeSchema.optional(),
    source: z.undefined().optional(),
    read_only: z.boolean().optional(),
  })
  .superRefine((event, ctx) => {
    if (event.event_type === "planned" && !event.activity_plan_id) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_plan_id"],
        message: 'activity_plan_id is required when event_type is "planned"',
      });
    }

    if (event.event_type === "rest_day" && event.activity_plan_id) {
      ctx.addIssue({
        code: "custom",
        path: ["activity_plan_id"],
        message: 'activity_plan_id must be omitted when event_type is "rest_day"',
      });
    }
  });

export const importedEventDomainSchema = eventDomainBaseSchema.extend({
  event_type: z.literal("imported"),
  source: importedEventSourceMetadataSchema,
  read_only: z.literal(true).default(true),
});

export const eventDomainSchema = z.union([editableEventDomainSchema, importedEventDomainSchema]);

export const eventCreateSchema = eventDomainSchema;

export const eventUpdateSchema = z
  .object({
    id: z.string().uuid("Invalid event ID"),
    scope: eventMutationScopeSchema.default("single"),
    patch: editableEventPatchSchema,
  })
  .superRefine((mutation, ctx) => {
    if (Object.keys(mutation.patch).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["patch"],
        message: "patch must include at least one editable field",
      });
    }
  });

export const importedEventLifecycleMutationSchema = z.object({
  id: z.string().uuid("Invalid event ID"),
  event_type: z.literal("imported"),
  scope: eventMutationScopeSchema.default("single"),
  lifecycle: z.union([
    z.object({
      status: z.literal("cancelled"),
      cancelled: cancelledMetadataSchema,
    }),
    z.object({
      status: z.literal("deleted"),
      deleted: deletedMetadataSchema,
    }),
  ]),
});

export const eventCancelSchema = z.object({
  id: z.string().uuid("Invalid event ID"),
  scope: eventMutationScopeSchema.default("single"),
  lifecycle: z.object({
    status: z.literal("cancelled"),
    cancelled: cancelledMetadataSchema,
  }),
});

export const eventSoftDeleteSchema = z.object({
  id: z.string().uuid("Invalid event ID"),
  scope: eventMutationScopeSchema.default("single"),
  lifecycle: z.object({
    status: z.literal("deleted"),
    deleted: deletedMetadataSchema,
  }),
});

/**
 * Planned Activity Create Schema
 * Used when scheduling a new activity
 *
 * Note: Intensity is NOT stored - it's calculated from IF after activity completion.
 * TSS estimation happens in the application layer, not stored in the database.
 */
export const plannedActivityCreateSchema = z.object({
  activity_plan_id: z.string().uuid("Invalid activity plan ID"),
  scheduled_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  training_plan_id: z.string().uuid("Invalid training plan ID").optional(),
  notes: z.string().max(2000, "Notes are too long").nullable().optional(),
  event_type: eventTypeInputSchema.default("planned").optional(),
  recurrence: eventRecurrenceSchema.optional(),
  lifecycle: eventLifecycleSchema.optional(),
  source: importedEventSourceMetadataSchema.optional(),
  read_only: z.boolean().optional(),
});

/**
 * Planned Activity Update Schema
 * Used when modifying an existing planned activity
 */
export const plannedActivityUpdateSchema = z.object({
  activity_plan_id: z.string().uuid("Invalid activity plan ID").optional(),
  scheduled_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid date format")
    .optional(),
  notes: z.string().max(2000, "Notes are too long").nullable().optional(),
  event_type: eventTypeInputSchema.optional(),
  recurrence: eventRecurrenceSchema.optional(),
  lifecycle: eventLifecycleSchema.optional(),
});

/**
 * Reschedule Schema
 * Used when moving a planned activity to a different date
 */
export const plannedActivityRescheduleSchema = z.object({
  id: z.string().uuid("Invalid planned activity ID"),
  new_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  reason: z.string().max(500, "Reason is too long").optional(),
  scope: eventMutationScopeSchema.default("single"),
});

/**
 * TypeScript types exported for use throughout the application
 */
export type PlannedActivityCreate = z.infer<typeof plannedActivityCreateSchema>;
export type PlannedActivityUpdate = z.infer<typeof plannedActivityUpdateSchema>;
export type PlannedActivityReschedule = z.infer<typeof plannedActivityRescheduleSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type EventTypeInput = z.infer<typeof eventTypeInputSchema>;
export type EventMutationScope = z.infer<typeof eventMutationScopeSchema>;
export type EventRecurrence = z.infer<typeof eventRecurrenceSchema>;
export type EventRecurrenceException = z.infer<typeof eventRecurrenceExceptionSchema>;
export type EventLifecycle = z.infer<typeof eventLifecycleSchema>;
export type ImportedEventSourceMetadata = z.infer<typeof importedEventSourceMetadataSchema>;
export type EventDomain = z.infer<typeof eventDomainSchema>;
