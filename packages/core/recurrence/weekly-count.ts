import { z } from "zod";

export const WEEKLY_RECURRENCE_MIN_OCCURRENCES = 2;
export const WEEKLY_RECURRENCE_MAX_OCCURRENCES = 52;

export const weeklyCountRecurrenceSchema = z.object({
  enabled: z.boolean(),
  frequency: z.literal("weekly"),
  interval: z.literal(1),
  occurrenceCount: z
    .number()
    .int()
    .min(WEEKLY_RECURRENCE_MIN_OCCURRENCES)
    .max(WEEKLY_RECURRENCE_MAX_OCCURRENCES),
});

export type WeeklyCountRecurrence = z.infer<typeof weeklyCountRecurrenceSchema>;

export const DEFAULT_WEEKLY_COUNT_RECURRENCE: WeeklyCountRecurrence = {
  enabled: false,
  frequency: "weekly",
  interval: 1,
  occurrenceCount: 4,
};

export type RRuleWeekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

const RRULE_WEEKDAYS: readonly RRuleWeekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function deriveUtcRRuleWeekday(startInstant: Date | string): RRuleWeekday {
  const date = startInstant instanceof Date ? startInstant : new Date(startInstant);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("A valid start instant is required to derive recurrence weekday");
  }

  return RRULE_WEEKDAYS[date.getUTCDay()] ?? "MO";
}

export type WeeklyCountRecurrencePayload = {
  rule: string;
  timezone: "UTC";
};

export function serializeWeeklyCountRecurrence(input: {
  recurrence: WeeklyCountRecurrence;
  startInstant: Date | string;
}): WeeklyCountRecurrencePayload | undefined {
  const recurrence = weeklyCountRecurrenceSchema.parse(input.recurrence);
  if (!recurrence.enabled) {
    return undefined;
  }

  return {
    rule: `FREQ=WEEKLY;INTERVAL=1;COUNT=${recurrence.occurrenceCount};BYDAY=${deriveUtcRRuleWeekday(input.startInstant)}`,
    timezone: "UTC",
  };
}

export function parseWeeklyCountRecurrenceRule(rule: string): WeeklyCountRecurrence {
  const match = /^FREQ=WEEKLY;INTERVAL=1;COUNT=(\d+);BYDAY=(SU|MO|TU|WE|TH|FR|SA)$/.exec(rule);
  if (!match) {
    throw new RangeError("Unsupported weekly count recurrence rule");
  }

  return weeklyCountRecurrenceSchema.parse({
    enabled: true,
    frequency: "weekly",
    interval: 1,
    occurrenceCount: Number(match[1]),
  });
}
