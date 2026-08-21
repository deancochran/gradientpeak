import {
  type ActivityObservationQuantificationBundle,
  type ActivityPlanPrescriptionQuantificationBundle,
  activityObservationQuantificationBundleSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPrescriptionQuantificationBundleSchema,
  bindPrescriptionQuantificationToScheduledEvent,
  createObservationQuantificationBundle,
  createPrescriptionQuantificationBundle,
  createUnavailableActivityPlanPlanningEstimate,
  dateOnlySchema,
} from "@repo/core";
import { diffDateOnlyUtcDays, getCalendarDateInIanaZone } from "@repo/core/calendar";
import {
  aggregateCommonLoadEnvelopes,
  buildCommonLoadRecommendation,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  commonLoadAggregateSchema,
  commonLoadRecommendationSchema,
  commonLoadResultSchema,
} from "@repo/core/load";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaries,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis";
import type { EventReadRepository } from "../../repositories";
import { estimateActivityPlans } from "../activity-plans/estimate-activity-plans";
import {
  composeEffectivePlanDto,
  effectivePlanCompositionDtoSchema,
} from "./effective-plan-composition";

type Db = ReturnType<typeof getRequiredDb>;

const dateSchema = dateOnlySchema;
export const MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS = 366;
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
const quantificationIdentityProbeSchema = z
  .object({
    summary: z
      .object({
        commonLoad: z.object({ model: z.string(), version: z.string() }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
const unavailableReasonSchema = z.enum([
  "planning_timezone_missing",
  "planning_timezone_invalid",
  "missing_quantification",
  "invalid_quantification",
  "incompatible_common_load_identity",
]);

export const getEffectivePlanLoadInputSchema = z
  .object({
    endDate: dateSchema.optional(),
    startDate: dateSchema.optional(),
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
    if (
      value.startDate &&
      value.endDate &&
      diffDateOnlyUtcDays(value.startDate, value.endDate) >= MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Effective Load ranges cannot exceed ${MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS} days`,
        path: ["endDate"],
      });
    }
  });

const availableSchema = z
  .object({
    status: z.literal("available"),
    completed: commonLoadAggregateSchema,
    remaining: commonLoadAggregateSchema,
    completedObservationQuantification: activityObservationQuantificationBundleSchema.nullable(),
    remainingPrescriptionQuantification: activityPrescriptionQuantificationBundleSchema.nullable(),
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
    reason: unavailableReasonSchema,
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
  return getCalendarDateInIanaZone(instant.toISOString(), timezone);
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

type QuantificationUnavailableReason =
  | "missing_quantification"
  | "invalid_quantification"
  | "incompatible_common_load_identity";
type ParsedQuantification<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: QuantificationUnavailableReason };

function parseQuantificationBundle<TSchema extends z.ZodType>(
  value: unknown,
  schema: TSchema,
): ParsedQuantification<z.output<TSchema>> {
  if (value === null || value === undefined) {
    return { status: "unavailable", reason: "missing_quantification" };
  }
  const identity = quantificationIdentityProbeSchema.safeParse(value);
  if (
    identity.success &&
    (identity.data.summary.commonLoad.model !== COMMON_RELATIVE_LOAD_MODEL ||
      identity.data.summary.commonLoad.version !== COMMON_RELATIVE_LOAD_VERSION)
  ) {
    return { status: "unavailable", reason: "incompatible_common_load_identity" };
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { status: "available", value: parsed.data }
    : { status: "unavailable", reason: "invalid_quantification" };
}

/**
 * The sole authorized effective Plan Load composition. Events, completions, links and timezone
 * are profile-owned reads.
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
  const unavailable = (reason: z.infer<typeof unavailableReasonSchema>) =>
    unavailableSchema.parse({
      status: "unavailable",
      reason,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      sourceCounts: facts.sourceCounts,
      resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
      sourceCoverage: facts.sourceCoverage,
    });
  if (!facts.planningTimezone) {
    return unavailable("planning_timezone_missing");
  }
  const planningTimezone = facts.planningTimezone;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: planningTimezone }).format();
  } catch {
    return unavailable("planning_timezone_invalid");
  }
  const { endDate, startDate } = facts.resolvedRange;
  if (!startDate || !endDate) {
    return unavailable("planning_timezone_invalid");
  }
  const recommendationEvents = facts.recommendationEvents.filter((event) => {
    if (!event.original_starts_at) {
      return event.scheduled_date >= startDate && event.scheduled_date <= endDate;
    }
    const originalInstant = new Date(event.original_starts_at);
    if (Number.isNaN(originalInstant.getTime())) return false;
    const recommendationDate = localDate(originalInstant, planningTimezone);
    return recommendationDate >= startDate && recommendationDate <= endDate;
  });

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
  const completedQuantificationById = new Map<string, ActivityObservationQuantificationBundle>();
  let completedQuantificationIncomplete = false;
  for (const [activityId, summary] of summaries.parent) {
    const parsed = parseQuantificationBundle(
      summary.observationQuantification,
      activityObservationQuantificationBundleSchema,
    );
    if (parsed.status === "unavailable") {
      completedQuantificationIncomplete = true;
      continue;
    }
    completedQuantificationById.set(activityId, parsed.value);
  }
  const activityPlansById = new Map(
    [...facts.events, ...recommendationEvents].flatMap((event) =>
      event.activity_plan ? [[event.activity_plan.id, event.activity_plan] as const] : [],
    ),
  );
  const plans = await estimateActivityPlans(
    [...activityPlansById.values()],
    input.db,
    input.profileId,
    { asOf },
  );
  const plannedQuantificationById = new Map<string, ActivityPlanPrescriptionQuantificationBundle>();
  for (const plan of plans) {
    const parsed = parseQuantificationBundle(
      plan.prescriptionQuantification,
      activityPlanPrescriptionQuantificationBundleSchema,
    );
    if (parsed.status === "unavailable") return unavailable(parsed.reason);
    plannedQuantificationById.set(plan.id, parsed.value);
  }
  const activitiesInRange = facts.activities.filter((activity) => {
    const date = localDate(activity.started_at, planningTimezone);
    return date >= startDate && date <= endDate;
  });
  completedQuantificationIncomplete ||= activitiesInRange.some(
    (activity) => !completedQuantificationById.has(activity.id),
  );
  const completedActivities = activitiesInRange.flatMap((activity) => {
    const source = completedQuantificationById.get(activity.id);
    if (!source) return [];
    return [
      {
        completedActivityId: activity.id,
        completedDate: localDate(activity.started_at, planningTimezone),
        observationQuantification: source,
      },
    ];
  });
  const scheduledItems = facts.events.map((event) => {
    const planned = plannedQuantificationById.get(event.activity_plan_id ?? "");
    const source =
      planned === undefined
        ? createUnavailableActivityPlanPlanningEstimate({
            asOf: asOf.toISOString(),
            stage: "scheduled",
            ...(event.activity_plan_id ? { planId: event.activity_plan_id } : {}),
            scheduledEventId: event.id,
          }).prescriptionQuantification
        : bindPrescriptionQuantificationToScheduledEvent({
            prescriptionQuantification: planned,
            eventId: event.id,
          });
    return {
      scheduledItemId: event.id,
      scheduledDate: event.scheduled_date,
      status:
        event.status === "cancelled" || (event.status === "completed" && !event.linked_activity_id)
          ? ("cancelled" as const)
          : ("active" as const),
      linkedCompletedActivityId: event.linked_activity_id,
      prescriptionQuantification: source,
    };
  });
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
      facts.sourceCoverage.activities?.status === "complete" && !completedQuantificationIncomplete
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
  const completedMembers =
    composition.status === "available"
      ? composition.firmItems.flatMap((item) =>
          item.kind === "completed" ? item.observationQuantification.members : [],
        )
      : [];
  const remainingMembers =
    composition.status === "available"
      ? composition.firmItems.flatMap((item) =>
          item.kind === "scheduled" && item.date >= composition.planningDate
            ? item.prescriptionQuantification.members
            : [],
        )
      : [];
  const completedObservationQuantification =
    completedMembers.length === 0
      ? null
      : createObservationQuantificationBundle({ members: completedMembers });
  const remainingPrescriptionQuantification =
    remainingMembers.length === 0
      ? null
      : createPrescriptionQuantificationBundle({ members: remainingMembers });
  const recommendation = buildCommonLoadRecommendation({
    computedAsOf: asOf.toISOString(),
    planningTimezone,
    planningDate: localDate(asOf, planningTimezone),
    startDate,
    endDate,
    sourceStatus: facts.recommendationSource.status,
    trainingPlanId: facts.recommendationSource.trainingPlanId,
    scheduleBatchId: facts.recommendationSource.scheduleBatchId,
    items: recommendationEvents.map((event) => ({
      scheduledItemId: event.id,
      recommendationDate: event.original_starts_at
        ? localDate(new Date(event.original_starts_at), planningTimezone)
        : event.scheduled_date,
      commonLoad:
        plannedQuantificationById.get(event.activity_plan_id ?? "")?.summary.commonLoad ??
        unavailableActivityLoad(asOf.toISOString()),
    })),
  });
  return effectivePlanLoadDtoSchema.parse({
    status: "available",
    completed,
    remaining,
    completedObservationQuantification,
    remainingPrescriptionQuantification,
    recommendation,
    effective: composition,
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sourceCounts: facts.sourceCounts,
    resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
    sourceCoverage: facts.sourceCoverage,
  });
}
