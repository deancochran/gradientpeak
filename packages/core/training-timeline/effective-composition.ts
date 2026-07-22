import { z } from "zod";

import {
  aggregateCommonLoad,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
} from "../load/common-relative-load";

const MAX_COMPOSITION_ITEMS = 10_000;

const identitySchema = z.string().trim().min(1).max(256);
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date");

const planningTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Planning timezone must be a valid IANA timezone");

export const effectiveScheduledItemSchema = z
  .object({
    scheduledItemId: identitySchema,
    scheduledDate: calendarDateSchema,
    status: z.enum(["active", "cancelled"]),
    tentative: z.boolean(),
    linkedCompletedActivityId: identitySchema.nullable(),
    commonLoad: commonLoadResultSchema,
  })
  .strict();

export const effectiveCompletedActivitySchema = z
  .object({
    completedActivityId: identitySchema,
    completedDate: calendarDateSchema,
    commonLoad: commonLoadResultSchema,
  })
  .strict();

const completedSourceBoundsShape = {
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
};

export const completedSourceCompletenessSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("complete"), ...completedSourceBoundsShape }).strict(),
    z
      .object({
        status: z.literal("incomplete"),
        reason: z.enum(["not_fetched", "fetch_partial", "provider_unavailable"]),
        ...completedSourceBoundsShape,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Completed source endDate must not precede startDate",
      });
    }
  });

export const effectiveCompositionInputSchema = z
  .object({
    scheduledItems: z.array(effectiveScheduledItemSchema).max(MAX_COMPOSITION_ITEMS),
    completedActivities: z.array(effectiveCompletedActivitySchema).max(MAX_COMPOSITION_ITEMS),
    scheduledSource: completedSourceCompletenessSchema,
    completedSource: completedSourceCompletenessSchema,
    planningTimezone: planningTimezoneSchema,
    asOfInstant: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.scheduledSource.startDate !== input.completedSource.startDate ||
      input.scheduledSource.endDate !== input.completedSource.endDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["scheduledSource"],
        message: "Scheduled and completed source bounds must match",
      });
    }
    const addDuplicateIssues = (
      values: readonly string[],
      path: "scheduledItems" | "completedActivities",
    ): void => {
      const seen = new Set<string>();
      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [path, index],
            message: "Identity must be unique",
          });
        }
        seen.add(value);
      }
    };
    addDuplicateIssues(
      input.scheduledItems.map((item) => item.scheduledItemId),
      "scheduledItems",
    );
    addDuplicateIssues(
      input.completedActivities.map((activity) => activity.completedActivityId),
      "completedActivities",
    );
  });

const composedScheduledItemSchema = z
  .object({
    kind: z.literal("scheduled"),
    scheduledItemId: identitySchema,
    date: calendarDateSchema,
    commonLoad: commonLoadResultSchema,
  })
  .strict();

const composedCompletedItemSchema = z
  .object({
    kind: z.literal("completed"),
    completedActivityId: identitySchema,
    date: calendarDateSchema,
    replacedScheduledItemId: identitySchema.nullable(),
    commonLoad: commonLoadResultSchema,
  })
  .strict();

export const effectiveCompositionItemSchema = z.discriminatedUnion("kind", [
  composedScheduledItemSchema,
  composedCompletedItemSchema,
]);

export const effectiveLoadAggregateSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("known_zero"), load: z.literal(0), intensity: z.null() }).strict(),
    z
      .object({
        status: z.enum(["complete", "partial"]),
        commonLoad: commonLoadAggregateSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        reason: z.enum([
          "scheduled_source_incomplete",
          "completed_source_incomplete",
          "common_load_unavailable",
        ]),
        commonLoad: commonLoadAggregateSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.status === "complete" && value.commonLoad.status !== "complete") {
      context.addIssue({
        code: "custom",
        message: "Complete composition requires complete common Load",
      });
    }
    if (value.status === "partial" && value.commonLoad.status === "unavailable") {
      context.addIssue({
        code: "custom",
        message: "Partial composition requires known common Load",
      });
    }
    if (value.status === "unavailable" && value.commonLoad.status !== "unavailable") {
      context.addIssue({
        code: "custom",
        message: "Unavailable composition requires unavailable common Load",
      });
    }
  });

const compositionContextShape = {
  periodStartDate: calendarDateSchema,
  periodEndDate: calendarDateSchema,
  planningDate: calendarDateSchema,
};

const duplicateLinkSchema = z
  .object({
    completedActivityId: identitySchema,
    scheduledItemIds: z.array(identitySchema).min(2),
  })
  .strict();

export const effectiveCompositionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("composed"),
      ...compositionContextShape,
      items: z.array(effectiveCompositionItemSchema),
      tentativeItems: z.array(composedScheduledItemSchema),
      aggregate: effectiveLoadAggregateSchema,
      tentativeAggregate: commonLoadAggregateSchema,
      includingTentativeAggregate: effectiveLoadAggregateSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("integrity_unavailable"),
      reason: z.literal("duplicate_activity_to_scheduled_links"),
      ...compositionContextShape,
      duplicateLinks: z.array(duplicateLinkSchema).min(1),
    })
    .strict(),
]);

export type EffectiveScheduledItem = z.infer<typeof effectiveScheduledItemSchema>;
export type EffectiveCompletedActivity = z.infer<typeof effectiveCompletedActivitySchema>;
export type CompletedSourceCompleteness = z.infer<typeof completedSourceCompletenessSchema>;
export type EffectiveCompositionInput = z.infer<typeof effectiveCompositionInputSchema>;
export type EffectiveCompositionItem = z.infer<typeof effectiveCompositionItemSchema>;
export type EffectiveLoadAggregate = z.infer<typeof effectiveLoadAggregateSchema>;
export type EffectiveCompositionResult = z.infer<typeof effectiveCompositionResultSchema>;

function formatDateInTimezone(instant: string, planningTimezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: planningTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;
  return `${values.year}-${values.month}-${values.day}`;
}

function isWithinPeriod(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

function effectiveAggregate(
  items: readonly EffectiveCompositionItem[],
  scheduledSource: CompletedSourceCompleteness,
  completedSource: CompletedSourceCompleteness,
): EffectiveLoadAggregate {
  const commonLoad = aggregateCommonLoad(items.map((item) => item.commonLoad));
  const sourcesComplete =
    scheduledSource.status === "complete" && completedSource.status === "complete";
  if (items.length === 0 && sourcesComplete) {
    return { status: "known_zero", load: 0, intensity: null };
  }
  if (commonLoad.status === "unavailable") {
    return {
      status: "unavailable",
      reason:
        items.length === 0 && scheduledSource.status === "incomplete"
          ? "scheduled_source_incomplete"
          : items.length === 0 && completedSource.status === "incomplete"
            ? "completed_source_incomplete"
            : "common_load_unavailable",
      commonLoad,
    };
  }
  return {
    status: sourcesComplete && commonLoad.status === "complete" ? "complete" : "partial",
    commonLoad,
  };
}

/**
 * Composes effective common Load for one bounded calendar-date period. Scheduled dates and the
 * as-of instant are interpreted in the explicit planning timezone; no ambient clock is consulted.
 */
export function composeEffectivePlanLoad(
  input: EffectiveCompositionInput,
): EffectiveCompositionResult {
  const parsed = effectiveCompositionInputSchema.parse(input);
  const { startDate, endDate } = parsed.completedSource;
  const planningDate = formatDateInTimezone(parsed.asOfInstant, parsed.planningTimezone);
  const context = { periodStartDate: startDate, periodEndDate: endDate, planningDate };

  const scheduledLinks = new Map<string, string[]>();
  for (const scheduled of parsed.scheduledItems) {
    if (scheduled.status !== "active" || scheduled.linkedCompletedActivityId === null) {
      continue;
    }
    const links = scheduledLinks.get(scheduled.linkedCompletedActivityId) ?? [];
    links.push(scheduled.scheduledItemId);
    scheduledLinks.set(scheduled.linkedCompletedActivityId, links);
  }
  const duplicateLinks = [...scheduledLinks.entries()]
    .filter(([, scheduledItemIds]) => scheduledItemIds.length > 1)
    .map(([completedActivityId, scheduledItemIds]) => ({
      completedActivityId,
      scheduledItemIds: [...scheduledItemIds].sort(),
    }))
    .sort((left, right) => left.completedActivityId.localeCompare(right.completedActivityId));
  if (duplicateLinks.length > 0) {
    return effectiveCompositionResultSchema.parse({
      status: "integrity_unavailable",
      reason: "duplicate_activity_to_scheduled_links",
      ...context,
      duplicateLinks,
    });
  }

  const completedById = new Map(
    parsed.completedActivities.map((activity) => [activity.completedActivityId, activity]),
  );
  const replacedCompletedIds = new Set(scheduledLinks.keys());
  const items: EffectiveCompositionItem[] = [];
  const tentativeItems: z.infer<typeof composedScheduledItemSchema>[] = [];

  for (const scheduled of [...parsed.scheduledItems].sort((left, right) =>
    left.scheduledItemId.localeCompare(right.scheduledItemId),
  )) {
    if (
      scheduled.status === "cancelled" ||
      !isWithinPeriod(scheduled.scheduledDate, startDate, endDate)
    ) {
      continue;
    }
    const completed =
      scheduled.linkedCompletedActivityId === null
        ? undefined
        : completedById.get(scheduled.linkedCompletedActivityId);
    if (completed !== undefined) {
      replacedCompletedIds.add(completed.completedActivityId);
      items.push({
        kind: "completed",
        completedActivityId: completed.completedActivityId,
        date: scheduled.scheduledDate,
        replacedScheduledItemId: scheduled.scheduledItemId,
        commonLoad: completed.commonLoad,
      });
      continue;
    }
    if (scheduled.scheduledDate < planningDate) continue;
    const composed = {
      kind: "scheduled" as const,
      scheduledItemId: scheduled.scheduledItemId,
      date: scheduled.scheduledDate,
      commonLoad: scheduled.commonLoad,
    };
    if (scheduled.tentative) tentativeItems.push(composed);
    else items.push(composed);
  }

  for (const completed of [...parsed.completedActivities].sort((left, right) =>
    left.completedActivityId.localeCompare(right.completedActivityId),
  )) {
    if (
      replacedCompletedIds.has(completed.completedActivityId) ||
      !isWithinPeriod(completed.completedDate, startDate, endDate)
    ) {
      continue;
    }
    items.push({
      kind: "completed",
      completedActivityId: completed.completedActivityId,
      date: completed.completedDate,
      replacedScheduledItemId: null,
      commonLoad: completed.commonLoad,
    });
  }

  const result = {
    status: "composed" as const,
    ...context,
    items,
    tentativeItems,
    aggregate: effectiveAggregate(items, parsed.scheduledSource, parsed.completedSource),
    tentativeAggregate: aggregateCommonLoad(tentativeItems.map((item) => item.commonLoad)),
    includingTentativeAggregate: effectiveAggregate(
      [...items, ...tentativeItems],
      parsed.scheduledSource,
      parsed.completedSource,
    ),
  };
  return effectiveCompositionResultSchema.parse(result);
}
