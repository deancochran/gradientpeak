// packages/core/schemas/planned_activity.ts
import { z } from "zod";

const dateTimeStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date format");

const dateOnlyStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)");

export const scheduledDateSchema = dateOnlyStringSchema.refine((value) => {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}, "Invalid calendar date");

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
 * - "race_target": race/goal target marker
 * - "custom": user-authored non-activity event
 */
export const eventTypeSchema = z.enum(["race_target", "custom"]);
export const eventTypeInputSchema = eventTypeSchema;

export const editableEventTypeSchema = z.enum(["race_target", "custom"]);
export const editableEventTypeInputSchema = editableEventTypeSchema;

export const eventMutationScopeSchema = z.enum(["single", "future", "series"]);

export const iCalRRuleSchema = z
  .string()
  .trim()
  .min(1, "RRULE is required")
  .max(1000, "RRULE is too long")
  .refine(isValidIcalRRule, "Invalid iCal RRULE string");

export const eventRecurrenceSchema = z
  .object({
    rule: iCalRRuleSchema,
    timezone: z.string().min(1, "Timezone is required").max(120),
  })
  .strict();

export const eventStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);

const eventDomainBaseSchema = z.object({
  title: z.string().min(1).max(255),
  starts_at: dateTimeStringSchema,
  ends_at: dateTimeStringSchema.nullable().optional(),
  all_day: z.boolean().default(false),
  timezone: z.string().min(1).max(120).default("UTC"),
  notes: z.string().max(2000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  route_id: z.string().uuid().nullable().optional(),
  recurrence: eventRecurrenceSchema.optional(),
});

const editableEventDomainBaseSchema = eventDomainBaseSchema.extend({
  event_type: editableEventTypeSchema,
});

export const editableEventDomainSchema = editableEventDomainBaseSchema.extend({
  event_type: editableEventTypeSchema.default("custom"),
});

export const eventDomainSchema = editableEventDomainSchema;

const editableEventDetailsPatchSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    notes: z.string().max(2000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    route_id: z.string().uuid().nullable().optional(),
  })
  .strict();

// Patches are intentionally context-free. The application layer must validate
// the persisted final state when a planned event changes either content link.

const editableEventSchedulePatchSchema = z
  .object({
    starts_at: dateTimeStringSchema.optional(),
    ends_at: dateTimeStringSchema.nullable().optional(),
    all_day: z.boolean().optional(),
    scheduled_date: scheduledDateSchema.optional(),
    timezone: z.string().min(1).max(120).optional(),
  })
  .strict();

const hasAtLeastOneDefinedKey = (patch: object) =>
  Object.values(patch).some((value) => value !== undefined);

const requireNonEmptyPatch = <Schema extends z.ZodTypeAny>(schema: Schema) =>
  schema.refine(
    (patch) => hasAtLeastOneDefinedKey(patch as object),
    "patch must include at least one editable field",
  );

const editableEventDetailsOnlyPatchSchema = requireNonEmptyPatch(editableEventDetailsPatchSchema);

const editableEventScheduleOnlyPatchSchema = requireNonEmptyPatch(editableEventSchedulePatchSchema);

const editableEventDetailsAndSchedulePatchSchema = requireNonEmptyPatch(
  editableEventDetailsPatchSchema.merge(editableEventSchedulePatchSchema),
).superRefine((event, ctx) => {
  const hasDetails = Object.keys(editableEventDetailsPatchSchema.shape).some(
    (key) => event[key as keyof typeof event] !== undefined,
  );
  const hasSchedule = Object.keys(editableEventSchedulePatchSchema.shape).some(
    (key) => event[key as keyof typeof event] !== undefined,
  );

  if (!hasDetails || !hasSchedule) {
    ctx.addIssue({
      code: "custom",
      message: "patch must include both details and schedule fields",
    });
  }
});

export const genericEventPatchSchema = z.union([
  editableEventDetailsAndSchedulePatchSchema,
  editableEventDetailsOnlyPatchSchema,
  editableEventScheduleOnlyPatchSchema,
]);

export const customEventCreateSchema = z
  .object({
    event_type: z.enum(["custom", "race_target"]),
    title: z.string().min(1).max(255),
    starts_at: dateTimeStringSchema,
    ends_at: dateTimeStringSchema.nullable().optional(),
    all_day: z.boolean().default(false),
    scheduled_date: scheduledDateSchema.optional(),
    timezone: z.string().min(1).max(120).default("UTC"),
    notes: z.string().max(2000).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    route_id: z.string().uuid().nullable().optional(),
    recurrence: eventRecurrenceSchema.nullable().optional(),
  })
  .strict();

export const eventCreateSchema = z.discriminatedUnion("event_type", [customEventCreateSchema]);

export const eventUpdateSchema = z
  .object({
    id: z.string().uuid("Invalid event ID"),
    scope: eventMutationScopeSchema.default("single"),
    patch: genericEventPatchSchema,
  })
  .strict();

/**
 * TypeScript types exported for use throughout the application
 */
export type CustomEventCreate = z.infer<typeof customEventCreateSchema>;
export type EventCreate = z.infer<typeof eventCreateSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type EventTypeInput = z.infer<typeof eventTypeInputSchema>;
export type EventMutationScope = z.infer<typeof eventMutationScopeSchema>;
export type EventRecurrence = z.infer<typeof eventRecurrenceSchema>;
export type EventDomain = z.infer<typeof eventDomainSchema>;
