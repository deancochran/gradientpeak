import {
  type ActivityObservationQuantificationBundle,
  activityObservationQuantificationBundleSchema,
  createObservationQuantificationBundle,
  dateOnlySchema,
} from "@repo/core";
import { diffDateOnlyUtcDays, getCalendarDateInIanaZone } from "@repo/core/calendar";
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
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaries,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis";
import type { EventReadRepository } from "../../repositories";
import { estimateActivityPlans } from "../activity-plans/estimate-activity-plans";
import { materializeCurrentPlannedSessionProjection } from "../calendar/current-planned-session-projection";
import {
  composeEffectivePlanDto,
  effectivePlanCompositionDtoSchema,
} from "./effective-plan-composition";

type Db = ReturnType<typeof getRequiredDb>;

const dateSchema = dateOnlySchema;
export const MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS = 366;
const sourceCountsSchema = z
  .object({
    activities: z.number().int().nonnegative(),
    plannedSessions: z.number().int().nonnegative(),
  })
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
const unavailableReasonSchema = z.enum([
  "planning_timezone_missing",
  "planning_timezone_invalid",
  "missing_quantification",
  "invalid_quantification",
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

type QuantificationUnavailableReason = "missing_quantification" | "invalid_quantification";
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
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { status: "available", value: parsed.data }
    : { status: "unavailable", reason: "invalid_quantification" };
}

/** Converts a current authored-plan estimate into one validated scheduled-load aggregate. */
function currentPlanCommonLoad(input: {
  commonLoad: number | null;
  durationSeconds: number | null;
}): CommonLoadAggregate {
  const durationSeconds = input.durationSeconds;
  if (input.commonLoad !== null && durationSeconds !== null && durationSeconds > 0) {
    const intensity = Math.sqrt((input.commonLoad * 3600) / (durationSeconds * 100));
    if (Number.isFinite(intensity) && intensity <= 1.5) {
      return commonLoadAggregateSchema.parse({
        status: "complete",
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        load: input.commonLoad,
        intensity,
        contributingDurationSeconds: durationSeconds,
        knownDurationSeconds: durationSeconds,
        contributingActivityCount: 1,
        partialActivityCount: 0,
        unavailableActivityCount: 0,
        totalActivityCount: 1,
        activityCountCoverage: 1,
        knownDurationCoverage: 1,
        unknownDurationActivityCount: 0,
      });
    }
  }
  return commonLoadAggregateSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    reason: durationSeconds === null ? "duration_missing" : "no_load_data",
    contributingDurationSeconds: 0,
    knownDurationSeconds: durationSeconds,
    contributingActivityCount: 0,
    partialActivityCount: 0,
    unavailableActivityCount: 1,
    totalActivityCount: 1,
    activityCountCoverage: 0,
    knownDurationCoverage: durationSeconds === null ? null : 0,
    unknownDurationActivityCount: durationSeconds === null ? 1 : 0,
  });
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
  const recommendationSessions = facts.recommendationPlannedSessions.filter(
    (session) => session.originalTargetDate >= startDate && session.originalTargetDate <= endDate,
  );
  const currentPlans = [
    ...facts.plannedSessions.map((session) => session.currentPlan),
    ...recommendationSessions.map((session) => session.currentPlan),
  ].filter((plan): plan is NonNullable<typeof plan> => plan !== null);
  const estimatedPlans = await estimateActivityPlans(
    currentPlans.map((plan) => ({
      id: plan.id,
      profile_id: input.profileId,
      name: plan.name,
      description: null,
      structure: plan.structure,
      gps_recording_enabled: false,
      structure_hash: "current-planned-session",
      updated_at: plan.updatedAt,
    })),
    input.db,
    input.profileId,
    { asOf, personalize: true },
  );
  const currentPlanById = new Map(estimatedPlans.map((plan) => [plan.id, plan]));

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
  const activitiesInRange = facts.activities.filter(
    (activity): activity is typeof activity & { started_at: Date } => {
      if (activity.started_at === null) return false;
      const date = localDate(activity.started_at, planningTimezone);
      return date >= startDate && date <= endDate;
    },
  );
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
  const scheduledItems = facts.plannedSessions.map((session) => {
    const estimated = session.currentPlan ? currentPlanById.get(session.currentPlan.id) : null;
    const currentPlan = materializeCurrentPlannedSessionProjection(
      estimated && session.currentPlan
        ? {
            ...session.currentPlan,
            prescriptionQuantification: estimated.prescriptionQuantification,
          }
        : session.currentPlan,
    );
    return {
      scheduledItemId: session.id,
      scheduledDate: session.planningDate,
      status:
        session.lifecycleStatus === "cancelled" ||
        (session.lifecycleStatus === "completed" && !session.completedActivityId)
          ? ("cancelled" as const)
          : ("active" as const),
      linkedCompletedActivityId: session.completedActivityId,
      commonLoad: currentPlan
        ? currentPlanCommonLoad(currentPlan)
        : currentPlanCommonLoad({ commonLoad: null, durationSeconds: null }),
      resolutionManifest: session.resolutionManifest,
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
  const completedObservationQuantification =
    completedMembers.length === 0
      ? null
      : createObservationQuantificationBundle({ members: completedMembers });
  const recommendation = buildCommonLoadRecommendation({
    computedAsOf: asOf.toISOString(),
    planningTimezone,
    planningDate: localDate(asOf, planningTimezone),
    startDate,
    endDate,
    sourceStatus: facts.recommendationSource.status,
    trainingPlanId: facts.recommendationSource.trainingPlanId,
    scheduleBatchId: null,
    items: recommendationSessions.map((session) => {
      const estimated = session.currentPlan ? currentPlanById.get(session.currentPlan.id) : null;
      const currentPlan = materializeCurrentPlannedSessionProjection(
        estimated && session.currentPlan
          ? {
              ...session.currentPlan,
              prescriptionQuantification: estimated.prescriptionQuantification,
            }
          : session.currentPlan,
      );
      return {
        scheduledItemId: session.id,
        recommendationDate: session.originalTargetDate,
        commonLoad: currentPlan
          ? currentPlanCommonLoad(currentPlan)
          : currentPlanCommonLoad({ commonLoad: null, durationSeconds: null }),
      };
    }),
  });
  return effectivePlanLoadDtoSchema.parse({
    status: "available",
    completed,
    remaining,
    completedObservationQuantification,
    recommendation,
    effective: composition,
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sourceCounts: facts.sourceCounts,
    resolvedRange: { ...facts.resolvedRange, timezone: facts.planningTimezone },
    sourceCoverage: facts.sourceCoverage,
  });
}
