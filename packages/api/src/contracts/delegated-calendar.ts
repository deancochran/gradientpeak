import { diffDateOnlyUtcDays } from "@repo/core/calendar";
import { calendarScopeProjectionSchema } from "@repo/core/organizations";
import { dateOnlySchema } from "@repo/core/schemas";
import { z } from "zod";

const calendarScopeProjectionObjectSchema = calendarScopeProjectionSchema.unwrap();
const delegatedCalendarEventSchema = calendarScopeProjectionObjectSchema.shape.events
  .unwrap()
  .element.omit({ startsAt: true })
  .extend({ planningDate: dateOnlySchema })
  .strict();

export const delegatedCalendarProjectionSchema = calendarScopeProjectionObjectSchema
  .extend({ events: z.array(delegatedCalendarEventSchema).readonly() })
  .strict();

export const delegatedCalendarCursorSchema = z
  .object({
    eventId: z.string().uuid(),
    planningDate: dateOnlySchema,
  })
  .strict();

export const delegatedCalendarRangeRequestSchema = z
  .object({
    athleteProfileId: z.string().uuid(),
    cursor: delegatedCalendarCursorSchema.nullable().default(null),
    endDateExclusive: dateOnlySchema,
    limit: z.number().int().min(1).max(100).default(28),
    organizationId: z.string().uuid(),
    startDate: dateOnlySchema,
  })
  .strict()
  .superRefine((input, context) => {
    const days = diffDateOnlyUtcDays(input.startDate, input.endDateExclusive);
    if (days <= 0 || days > 62) {
      context.addIssue({
        code: "custom",
        path: ["endDateExclusive"],
        message: "Calendar ranges must cover 1-62 planning days",
      });
    }
    // Cursors are the last identity returned by a preceding page. Keeping them
    // inside the requested half-open date range prevents a continuation token
    // from silently turning this bounded page into an unrelated coverage read.
    if (
      input.cursor &&
      (input.cursor.planningDate < input.startDate ||
        input.cursor.planningDate >= input.endDateExclusive)
    ) {
      context.addIssue({
        code: "custom",
        path: ["cursor", "planningDate"],
        message: "Cursor planningDate must be within the requested calendar range",
      });
    }
  });

export const delegatedCalendarRangeResponseSchema = z
  .object({
    nextCursor: delegatedCalendarCursorSchema.nullable(),
    projection: delegatedCalendarProjectionSchema,
    source: z.literal("planned_sessions"),
    truncated: z.boolean(),
  })
  .strict();

export type DelegatedCalendarRangeRequest = z.output<typeof delegatedCalendarRangeRequestSchema>;
export type DelegatedCalendarRangeResponse = z.output<typeof delegatedCalendarRangeResponseSchema>;
