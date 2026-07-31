import {
  aggregateCommonLoadEnvelopes,
  buildCommonLoadRecommendation,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  type CommonLoadResult,
  commonLoadAggregateSchema,
  commonLoadRecommendationSchema,
  commonLoadResultSchema,
} from "@repo/core/load";
import { getScheduledDateKey } from "@repo/core/utils/schedule-date";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaries,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis";
import type { EventReadRepository } from "../../repositories";
import { getActivityPlansDerivedMetrics } from "../../utils/activity-plan-derived-metrics";
import {
  composeEffectivePlanDto,
  effectivePlanCompositionDtoSchema,
} from "./effective-plan-composition";

type Db = ReturnType<typeof getRequiredDb>;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceCountsSchema = z
  .object({ activities: z.number().int().nonnegative(), events: z.number().int().nonnegative() })
  .strict();
const resolvedRangeSchema = z
  .object({
    endDate: dateSchema.nullable(),
    startDate: dateSchema.nullable(),
    timezone: z.string().nullable(),
  })
  .strict();
const sourceCoverageSchema = z
  .object({
    activities: z
      .object({
        endDate: dateSchema,
        startDate: dateSchema,
        status: z.enum(["complete", "partial"]),
      })
      .strict()
      .nullable(),
    scheduledItems: z
      .object({
        endDate: dateSchema,
        startDate: dateSchema,
        status: z.enum(["complete", "partial"]),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const getEffectivePlanLoadInputSchema = z
  .object({
    endDate: dateSchema.optional(),
    startDate: dateSchema.optional(),
    /** An overlay may classify server-loaded scheduled items, but cannot supply Load facts. */
    tentativeScheduledItemIds: z.array(z.string().uuid()).max(10_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate and endDate must be supplied together",
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must not follow endDate",
        path: ["endDate"],
      });
    }
  });

const availableSchema = z
  .object({
    status: z.literal("available"),
    completed: commonLoadAggregateSchema,
    remaining: commonLoadAggregateSchema,
    tentative: commonLoadAggregateSchema,
    effective: effectivePlanCompositionDtoSchema,
    model: z.literal(COMMON_RELATIVE_LOAD_MODEL),
    version: z.literal(COMMON_RELATIVE_LOAD_VERSION),
    sourceCounts: sourceCountsSchema,
    resolvedRange: resolvedRangeSchema,
    sourceCoverage: sourceCoverageSchema,
  })
  .strict();
const unavailableSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["planning_timezone_missing", "planning_timezone_invalid"]),
    model: z.literal(COMMON_RELATIVE_LOAD_MODEL),
    version: z.literal(COMMON_RELATIVE_LOAD_VERSION),
    sourceCounts: sourceCountsSchema,
    resolvedRange: resolvedRangeSchema,
    sourceCoverage: sourceCoverageSchema,
  })
  .strict();
export const effectivePlanLoadDtoSchema = z.discriminatedUnion("status", [
  availableSchema.extend({ recommendation: commonLoadRecommendationSchema }),
  unavailableSchema,
]);
export type EffectivePlanLoadDto = z.infer<typeof effectivePlanLoadDtoSchema>;

function localDate(instant: Date, timezone: string): string {
  return getScheduledDateKey(instant.toISOString(), timezone);
}

function unavailableActivityLoad(asOf: string): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "other",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: asOf,
    contributingDurationSeconds: null,
    reason: "activity_data_missing",
  });
}

/**
 * The sole authorized effective Plan Load composition. Events, completions, links and timezone
 * are profile-owned reads; callers may only mark already-loaded scheduled IDs as tentative.
 */
export async function getEffectivePlanLoad(input: {
  asOf?: Date;
  db: Db;
  profileId: string;
  repository: EventReadRepository;
  request: z.input<typeof getEffectivePlanLoadInputSchema>;
}): Promise<EffectivePlanLoadDto> {
  const request = getEffectivePlanLoadInputSchema.parse(input.request);
  const asOf = input.asOf ?? new Date();
  const facts = await input.repository.getEffectivePlanLoadInputs({
    asOf,
    profileId: input.profileId,
    ...(request.startDate && request.endDate
      ? { startDate: request.startDate, endDate: request.endDate }
      : {}),
  });
  if (!facts.planningTimezone) {
    return unavailableSchema.parse({
      status: "unavailable",
      reason: "planning_timezone_missing",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      sourceCounts: facts.sourceCounts,
      resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
      sourceCoverage: facts.sourceCoverage,
    });
  }
  const planningTimezone = facts.planningTimezone;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: planningTimezone }).format();
  } catch {
    return unavailableSchema.parse({
      status: "unavailable",
      reason: "planning_timezone_invalid",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      sourceCounts: facts.sourceCounts,
      resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
      sourceCoverage: facts.sourceCoverage,
    });
  }
  const { endDate, startDate } = facts.resolvedRange;
  if (!startDate || !endDate) {
    return unavailableSchema.parse({
      status: "unavailable",
      reason: "planning_timezone_invalid",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      sourceCounts: facts.sourceCounts,
      resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
      sourceCoverage: facts.sourceCoverage,
    });
  }

  const segments = await loadActivitySegmentsByActivityId(
    input.db,
    facts.activities.map((activity) => activity.id),
  );
  const summaries = await buildActivityDerivedSummaries({
    store: createActivityAnalysisStore(input.db),
    profileId: input.profileId,
    activities: facts.activities.map((activity) => ({
      ...activity,
      segments: segments.get(activity.id) ?? [],
    })),
  });
  const loadByActivity = new Map<string, CommonLoadResult | CommonLoadAggregate>();
  for (const [activityId, summary] of summaries.parent) {
    // Parent summaries aggregate all represented segments, preserving one completion per activity.
    const parsed = z
      .union([commonLoadResultSchema, commonLoadAggregateSchema])
      .safeParse(summary.common_load);
    if (parsed.success) loadByActivity.set(activityId, parsed.data);
  }
  const activityPlansById = new Map(
    [...facts.events, ...facts.recommendationEvents].flatMap((event) =>
      event.activity_plan ? [[event.activity_plan.id, event.activity_plan] as const] : [],
    ),
  );
  const plans = await getActivityPlansDerivedMetrics(
    [...activityPlansById.values()],
    input.db,
    input.repository,
    input.profileId,
    { asOf },
  );
  const plannedLoadById = new Map(plans.map((plan) => [plan.id, plan.common_load]));
  const tentativeIds = new Set(request.tentativeScheduledItemIds ?? []);
  const completedActivities = facts.activities
    .filter((activity) => {
      const date = localDate(activity.started_at, planningTimezone);
      return date >= startDate && date <= endDate;
    })
    .map((activity) => ({
      completedActivityId: activity.id,
      completedDate: localDate(activity.started_at, planningTimezone),
      commonLoad: loadByActivity.get(activity.id) ?? unavailableActivityLoad(asOf.toISOString()),
    }));
  const scheduledItems = facts.events.map((event) => ({
    scheduledItemId: event.id,
    scheduledDate: event.scheduled_date,
    status:
      event.status === "cancelled" || (event.status === "completed" && !event.linked_activity_id)
        ? ("cancelled" as const)
        : ("active" as const),
    tentative: tentativeIds.has(event.id),
    linkedCompletedActivityId: event.linked_activity_id,
    commonLoad:
      plannedLoadById.get(event.activity_plan_id ?? "") ??
      unavailableActivityLoad(asOf.toISOString()),
  }));
  const composition = composeEffectivePlanDto({
    scheduledItems,
    completedActivities,
    scheduledSource:
      facts.sourceCoverage.scheduledItems?.status === "complete"
        ? {
            status: "complete",
            startDate,
            endDate,
          }
        : {
            status: "incomplete",
            reason: "fetch_partial",
            startDate,
            endDate,
          },
    completedSource:
      facts.sourceCoverage.activities?.status === "complete"
        ? {
            status: "complete",
            startDate,
            endDate,
          }
        : {
            status: "incomplete",
            reason: "fetch_partial",
            startDate,
            endDate,
          },
    planningTimezone: facts.planningTimezone,
    asOfInstant: asOf.toISOString(),
  });
  // Aggregate only after replacement composition. Raw events and activities can
  // double-count a completed scheduled item or include a cancelled replacement.
  const compositionUnavailable = aggregateCommonLoadEnvelopes([
    unavailableActivityLoad(asOf.toISOString()),
  ]);
  const completed =
    composition.status === "available"
      ? aggregateCommonLoadEnvelopes(
          composition.firmItems
            .filter((item) => item.kind === "completed")
            .map((item) => item.commonLoad),
        )
      : compositionUnavailable;
  const remaining =
    composition.status === "available"
      ? aggregateCommonLoadEnvelopes(
          composition.firmItems
            .filter((item) => item.kind === "scheduled" && item.date >= composition.planningDate)
            .map((item) => item.commonLoad),
        )
      : compositionUnavailable;
  const tentative =
    composition.status === "available"
      ? aggregateCommonLoadEnvelopes(composition.tentativeItems.map((item) => item.commonLoad))
      : compositionUnavailable;
  const recommendation = buildCommonLoadRecommendation({
    computedAsOf: asOf.toISOString(),
    planningTimezone,
    planningDate: localDate(asOf, planningTimezone),
    startDate,
    endDate,
    sourceStatus: facts.recommendationSource.status,
    trainingPlanId: facts.recommendationSource.trainingPlanId,
    scheduleBatchId: facts.recommendationSource.scheduleBatchId,
    items: facts.recommendationEvents.map((event) => ({
      scheduledItemId: event.id,
      recommendationDate: event.original_starts_at
        ? localDate(new Date(event.original_starts_at), planningTimezone)
        : event.scheduled_date,
      commonLoad:
        plannedLoadById.get(event.activity_plan_id ?? "") ??
        unavailableActivityLoad(asOf.toISOString()),
    })),
  });
  return effectivePlanLoadDtoSchema.parse({
    status: "available",
    completed,
    remaining,
    tentative,
    recommendation,
    effective: composition,
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sourceCounts: facts.sourceCounts,
    resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
    sourceCoverage: facts.sourceCoverage,
  });
}
