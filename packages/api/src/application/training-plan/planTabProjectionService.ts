import {
  activityPlanDocumentSchema,
  addDaysDateKey,
  buildTrainingTimelineWindow,
  type CompletedTrainingItem,
  canonicalActivityCategorySchema,
  compareTrainingLoad,
  completedSegmentSummarySchema,
  dateOnlySchema,
  PLAN_ANALYSIS_WINDOW_MAX_DAYS,
  resolveActivityPlanVariant,
  type ScheduledTrainingItem,
  type TrainingLoadTimelineInputPoint,
  trainingTimelineWindowSchema,
} from "@repo/core";
import { diffDateOnlyUtcDays } from "@repo/core/calendar";
import {
  aggregateCommonLoadEnvelopes,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadRecommendation,
  type CommonLoadTrendProjectionDay,
  projectCommonLoadTrend,
} from "@repo/core/load";
import {
  activities,
  activityPlans,
  activitySegments,
  events,
  profileGoals,
  trainingPlans,
} from "@repo/db";
import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { type DrizzleQueryExecutor, withRepeatableReadSnapshot } from "../../db";
import { createEventReadRepository } from "../../infrastructure/repositories";
import {
  type AthleteReadModel,
  readAthleteReadModel,
} from "../athlete-intelligence/athlete-read-model";
import { type EffectivePlanLoadDto, getEffectivePlanLoad } from "./get-effective-plan-load";

const MAX_PLAN_TAB_RANGE_DAYS = PLAN_ANALYSIS_WINDOW_MAX_DAYS;
const MAX_PLANNING_RANGE_DAYS = PLAN_ANALYSIS_WINDOW_MAX_DAYS;
const MAX_CATEGORY_COMPOSITION_ACTIVITIES = 2_000;
const MAX_CATEGORY_COMPOSITION_SEGMENT_ROWS = 8_000;
export const PLAN_TAB_PROJECTION_VERSION = "plan-tab-projection-v2" as const;

export const planTabProjectionInputSchema = z
  .object({
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.startDate > input.endDate) {
      context.addIssue({
        code: "custom",
        message: "startDate must not follow endDate",
        path: ["endDate"],
      });
      return;
    }
    if (diffDateOnlyUtcDays(input.startDate, input.endDate) >= MAX_PLAN_TAB_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        message: `Plan-tab ranges cannot exceed ${MAX_PLAN_TAB_RANGE_DAYS} days`,
        path: ["endDate"],
      });
    }
  });

const loadStatusSchema = z.enum(["complete", "partial", "known_zero", "unavailable"]);
const compositionMetricSchema = z
  .object({
    status: loadStatusSchema,
    value: z.number().finite().nonnegative().nullable(),
  })
  .strict();
const ledgerItemCategoryDoseSchema = z
  .object({
    activityCategory: canonicalActivityCategorySchema,
    durationSeconds: compositionMetricSchema,
    distanceMeters: compositionMetricSchema,
    elevationGainMeters: compositionMetricSchema,
  })
  .strict();
const planTabLoadSummarySchema = z
  .object({
    status: loadStatusSchema,
    commonLoad: z.number().finite().nonnegative().nullable(),
    intensity: z.number().finite().nonnegative().nullable(),
    contributingDurationSeconds: z.number().finite().nonnegative().nullable(),
    completedLoadStatus: loadStatusSchema,
    completedLoad: z.number().finite().nonnegative().nullable(),
    knownCompletedLoadSubtotal: z.number().finite().nonnegative().nullable().optional(),
    scheduledLoadStatus: loadStatusSchema,
    scheduledLoad: z.number().finite().nonnegative().nullable(),
    knownScheduledLoadSubtotal: z.number().finite().nonnegative().nullable().optional(),
    remainingLoadStatus: loadStatusSchema,
    remainingLoad: z.number().finite().nonnegative().nullable(),
    hasUnavailableCompletedLoad: z.boolean(),
    recommendedLoadStatus: loadStatusSchema,
    recommendedLoad: z.number().finite().nonnegative().nullable(),
  })
  .strict();
const sourceRangeSchema = z
  .object({
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    status: z.enum(["complete", "partial"]),
  })
  .strict();
const sourceCoverageSchema = z
  .object({
    activities: sourceRangeSchema.nullable(),
    scheduledItems: sourceRangeSchema.nullable(),
  })
  .strict();
const goalMarkerSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1),
    priority: z.number().int().min(0).max(10),
    targetDate: dateOnlySchema,
    activityCategory: z.string().nullable(),
  })
  .strict();
const fitnessPointSchema = z
  .object({
    date: dateOnlySchema,
    longTermLoad: z.number().finite(),
    recentLoad: z.number().finite(),
    loadBalance: z.number().finite(),
  })
  .strict();
const fitnessHistorySchema = z
  .object({
    status: z.enum(["current", "historical", "unavailable"]),
    verifiedThrough: dateOnlySchema.nullable(),
    maturity: z.enum(["establishing_baseline", "mature"]).nullable(),
  })
  .strict();
const currentScheduledPlanSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    scheduleBatchId: z.string().uuid().nullable(),
    nextEventId: z.string().uuid(),
    nextEventTitle: z.string().min(1),
    nextEventDate: dateOnlySchema,
    nextEventAt: z.string().datetime({ offset: true }),
    nextActivityPlanId: z.string().uuid().nullable(),
  })
  .strict();
const recommendationPointSchema = z
  .object({
    date: dateOnlySchema,
    status: loadStatusSchema,
    load: z.number().finite().nonnegative().nullable(),
  })
  .strict();
const ledgerItemSchema = z
  .object({
    id: z.string().min(1),
    date: dateOnlySchema,
    kind: z.enum(["completed", "planned"]),
    title: z.string().min(1),
    activityCategory: z.string().nullable().optional(),
    categoryDoses: z.array(ledgerItemCategoryDoseSchema).max(8).optional(),
    categoryDoseStatus: z.enum(["complete", "unavailable"]).optional(),
    loadStatus: loadStatusSchema,
    load: z.number().finite().nonnegative().nullable(),
    intensityStatus: loadStatusSchema,
    intensity: z.number().finite().nonnegative().nullable(),
    contributingDurationStatus: loadStatusSchema,
    contributingDurationSeconds: z.number().finite().nonnegative().nullable(),
  })
  .strict();
export const planTabProjectionSchema = z
  .object({
    contractVersion: z.literal(PLAN_TAB_PROJECTION_VERSION),
    asOf: z.string().datetime({ offset: true }),
    planningTimezone: z.string().min(1).nullable(),
    today: dateOnlySchema.nullable(),
    currentScheduledPlan: currentScheduledPlanSchema.nullable(),
    timeline: trainingTimelineWindowSchema.nullable(),
    dayLoads: z.record(dateOnlySchema, planTabLoadSummarySchema),
    fitness: z
      .object({
        actual: z.array(fitnessPointSchema),
        scheduled: z.array(fitnessPointSchema),
        recommended: z.array(fitnessPointSchema),
      })
      .strict(),
    fitnessHistory: fitnessHistorySchema.optional(),
    recommendationPoints: z.array(recommendationPointSchema),
    ledgerItems: z.array(ledgerItemSchema),
    sourceCoverage: sourceCoverageSchema,
    goalMarkers: z.array(goalMarkerSchema).max(100),
    goalMarkersTruncated: z.boolean().optional(),
    publishedRevision: z.number().int().nonnegative().nullable(),
    algorithmVersion: z.string().min(1).nullable(),
  })
  .strict();

export type PlanTabProjection = z.infer<typeof planTabProjectionSchema>;
type PlanTabRequest = z.output<typeof planTabProjectionInputSchema>;

type DbClientWithTransaction = DrizzleQueryExecutor & {
  transaction: <T>(
    operation: (tx: DrizzleQueryExecutor) => Promise<T>,
    config?: { accessMode?: "read only" | "read write"; isolationLevel?: "repeatable read" },
  ) => Promise<T>;
};

type CurrentScheduledPlan = z.infer<typeof currentScheduledPlanSchema>;
type GoalMarker = z.infer<typeof goalMarkerSchema>;
type ItemMetadata = {
  scheduled: Map<string, { title: string; activityCategory: string | null }>;
  completed: Map<
    string,
    {
      title: string;
      activityCategory: string | null;
      categoryDoses?: z.infer<typeof ledgerItemCategoryDoseSchema>[];
      categoryDoseStatus?: "complete" | "unavailable";
    }
  >;
};

type CompositionMetric = z.infer<typeof compositionMetricSchema>;

function unavailableCompositionMetric(): CompositionMetric {
  return { status: "unavailable", value: null };
}

function aggregateCompositionMetrics(values: CompositionMetric[]): CompositionMetric {
  const known = values.flatMap((entry) => (entry.value === null ? [] : [entry.value]));
  if (known.length === 0) return unavailableCompositionMetric();
  const value = known.reduce((total, entry) => total + entry, 0);
  if (known.length !== values.length || values.some((entry) => entry.status === "partial")) {
    return { status: "partial", value };
  }
  return { status: value === 0 ? "known_zero" : "complete", value };
}

function segmentCompositionMetric(
  value: number | undefined,
  status: "complete" | "partial" = "complete",
): CompositionMetric {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return unavailableCompositionMetric();
  }
  return { status: value === 0 ? "known_zero" : status, value };
}

export function completedCategoryDoses(
  rows: Array<{
    activityCategory: string | null;
    segmentCategory: string | null;
    summary: unknown;
  }>,
) {
  const byCategory = new Map<
    z.infer<typeof canonicalActivityCategorySchema>,
    {
      durationSeconds: CompositionMetric[];
      distanceMeters: CompositionMetric[];
      elevationGainMeters: CompositionMetric[];
    }
  >();
  for (const row of rows) {
    const categoryResult = canonicalActivityCategorySchema.safeParse(
      row.segmentCategory ?? row.activityCategory,
    );
    if (!categoryResult.success) continue;
    const summaryResult = completedSegmentSummarySchema.safeParse(row.summary);
    const summary = summaryResult.success ? summaryResult.data : null;
    const timing = summary?.timing;
    const durationSeconds =
      timing && "activeMs" in timing && timing.activeMs !== undefined
        ? segmentCompositionMetric(
            timing.activeMs / 1_000,
            timing.timingCoverage === "partial" ? "partial" : "complete",
          )
        : unavailableCompositionMetric();
    const group = byCategory.get(categoryResult.data) ?? {
      durationSeconds: [],
      distanceMeters: [],
      elevationGainMeters: [],
    };
    group.durationSeconds.push(durationSeconds);
    group.distanceMeters.push(segmentCompositionMetric(summary?.distanceMeters));
    group.elevationGainMeters.push(segmentCompositionMetric(summary?.ascentMeters));
    byCategory.set(categoryResult.data, group);
  }
  return [...byCategory.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([activityCategory, metrics]) => ({
      activityCategory,
      durationSeconds: aggregateCompositionMetrics(metrics.durationSeconds),
      distanceMeters: aggregateCompositionMetrics(metrics.distanceMeters),
      elevationGainMeters: aggregateCompositionMetrics(metrics.elevationGainMeters),
    }));
}

export type PlanTabProjectionDependencies = {
  readModel: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    now: Date;
  }) => Promise<AthleteReadModel>;
  readEffectiveLoad: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    request: PlanTabRequest;
    asOf: Date;
  }) => Promise<EffectivePlanLoadDto>;
  readCurrentScheduledPlan: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    asOf: Date;
  }) => Promise<CurrentScheduledPlan | null>;
  readGoalMarkers: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
  }) => Promise<GoalMarker[]>;
  readItemMetadata: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    scheduledIds: string[];
    completedIds: string[];
  }) => Promise<ItemMetadata>;
};

function extractActivityCategory(structure: unknown): string | null {
  const document = activityPlanDocumentSchema.safeParse(structure);
  if (!document.success) return null;
  return resolveActivityPlanVariant(document.data).structure.activity_category;
}

const defaultDependencies: PlanTabProjectionDependencies = {
  readModel: ({ db, profileId, now }) =>
    readAthleteReadModel({
      db,
      profileId,
      now,
      sections: {
        currentBaseline: { includePlanningContext: false },
        loadHistory: true,
      },
    }),
  readEffectiveLoad: ({ db, profileId, request, asOf }) =>
    getEffectivePlanLoad({
      db: db as never,
      profileId,
      request,
      asOf,
      repository: createEventReadRepository(db),
    }),
  readCurrentScheduledPlan: async ({ db, profileId, asOf }) => {
    const [row] = await db
      .select({
        id: trainingPlans.id,
        name: trainingPlans.name,
        scheduleBatchId: events.schedule_batch_id,
        nextEventId: events.id,
        nextEventTitle: events.title,
        nextEventDate: events.scheduled_date,
        nextEventAt: events.starts_at,
        nextActivityPlanId: events.activity_plan_id,
      })
      .from(events)
      .innerJoin(
        trainingPlans,
        and(
          eq(trainingPlans.id, events.training_plan_id),
          eq(trainingPlans.profile_id, events.profile_id),
        ),
      )
      .where(
        and(
          eq(events.profile_id, profileId),
          eq(events.event_type, "planned"),
          eq(events.status, "scheduled"),
          isNotNull(events.training_plan_id),
          gte(events.starts_at, asOf),
        ),
      )
      .orderBy(asc(events.starts_at))
      .limit(1);
    return row
      ? {
          id: row.id,
          name: row.name,
          scheduleBatchId: row.scheduleBatchId,
          nextEventId: row.nextEventId,
          nextEventTitle: row.nextEventTitle,
          nextEventDate: row.nextEventDate,
          nextEventAt: row.nextEventAt.toISOString(),
          nextActivityPlanId: row.nextActivityPlanId,
        }
      : null;
  },
  readGoalMarkers: async ({ db, profileId }) => {
    const rows = await db
      .select({
        id: profileGoals.id,
        label: profileGoals.title,
        priority: profileGoals.priority,
        targetDate: profileGoals.target_date,
        activityCategory: profileGoals.activity_category,
      })
      .from(profileGoals)
      .where(eq(profileGoals.profile_id, profileId))
      .orderBy(desc(profileGoals.priority), asc(profileGoals.target_date), asc(profileGoals.id))
      .limit(101);
    return rows.map((row) => ({ ...row, activityCategory: row.activityCategory ?? null }));
  },
  readItemMetadata: async ({ db, profileId, scheduledIds, completedIds }) => {
    const scheduledRows =
      scheduledIds.length === 0
        ? []
        : await db
            .select({
              id: events.id,
              eventTitle: events.title,
              planName: activityPlans.name,
              planStructure: activityPlans.structure,
            })
            .from(events)
            .leftJoin(activityPlans, eq(activityPlans.id, events.activity_plan_id))
            .where(and(eq(events.profile_id, profileId), inArray(events.id, scheduledIds)));
    const includeCategoryDoses = completedIds.length <= MAX_CATEGORY_COMPOSITION_ACTIVITIES;
    const completedRows =
      completedIds.length === 0
        ? []
        : await db
            .select({
              id: activities.id,
              title: activities.name,
              activityCategory: activities.athlete_state_activity_category,
            })
            .from(activities)
            .where(and(eq(activities.profile_id, profileId), inArray(activities.id, completedIds)));
    const segmentRows =
      completedIds.length === 0 || !includeCategoryDoses
        ? []
        : await db
            .select({
              id: activities.id,
              activityCategory: activities.athlete_state_activity_category,
              segmentCategory: activitySegments.activity_category,
              summary: activitySegments.summary,
            })
            .from(activitySegments)
            .innerJoin(
              activities,
              and(
                eq(activitySegments.activity_id, activities.id),
                eq(activitySegments.profile_id, activities.profile_id),
                eq(activitySegments.segment_revision, activities.segments_revision),
              ),
            )
            .where(
              and(
                eq(activities.profile_id, profileId),
                inArray(activities.id, completedIds),
                eq(activitySegments.role, "activity"),
              ),
            )
            .limit(MAX_CATEGORY_COMPOSITION_SEGMENT_ROWS + 1);
    const segmentRowsOverflow = segmentRows.length > MAX_CATEGORY_COMPOSITION_SEGMENT_ROWS;
    const acceptedSegmentRows = segmentRowsOverflow
      ? []
      : segmentRows.slice(0, MAX_CATEGORY_COMPOSITION_SEGMENT_ROWS);
    const segmentRowsById = new Map<string, typeof acceptedSegmentRows>();
    for (const row of acceptedSegmentRows) {
      const rows = segmentRowsById.get(row.id) ?? [];
      rows.push(row);
      segmentRowsById.set(row.id, rows);
    }
    return {
      scheduled: new Map(
        scheduledRows.map((row) => [
          row.id,
          {
            title: row.planName?.trim() || row.eventTitle.trim() || "Scheduled session",
            activityCategory: extractActivityCategory(row.planStructure),
          },
        ]),
      ),
      completed: new Map(
        completedRows.map((row) => {
          const categoryDoses = completedCategoryDoses(segmentRowsById.get(row.id) ?? []);
          return [
            row.id,
            {
              title: row.title.trim() || "Completed activity",
              activityCategory: row.activityCategory ?? null,
              categoryDoses,
              categoryDoseStatus:
                includeCategoryDoses && !segmentRowsOverflow && categoryDoses.length > 0
                  ? ("complete" as const)
                  : ("unavailable" as const),
            },
          ];
        }),
      ),
    };
  },
};

type AvailableEffectiveLoad = Extract<EffectivePlanLoadDto, { status: "available" }>;
type EffectiveItem = Extract<
  AvailableEffectiveLoad["effective"],
  { status: "available" }
>["firmItems"][number];

function envelopeLoad(envelope: EffectiveItem["commonLoad"]): number | null {
  return envelope.status === "unavailable" ? null : envelope.load;
}

function envelopeIntensity(envelope: EffectiveItem["commonLoad"]): number | null {
  return envelope.status === "unavailable" ? null : envelope.intensity;
}

function knownIncompleteLoadSubtotal(items: EffectiveItem[]): number | null {
  if (items.length === 0) return null;
  const values = items.flatMap((item) => {
    if (item.commonLoad.status === "unavailable") return [];
    const load = item.commonLoad.load;
    return load === null ? [] : [load];
  });
  return values.length === 0 ? null : values.reduce((total, load) => total + load, 0);
}

function aggregateValue(items: EffectiveItem[]) {
  if (items.length === 0) {
    return {
      status: "known_zero" as const,
      load: 0,
      intensity: null,
      contributingDurationSeconds: 0,
    };
  }
  const aggregate = aggregateCommonLoadEnvelopes(items.map((item) => item.commonLoad));
  return aggregate.status === "unavailable"
    ? {
        status: "unavailable" as const,
        load: null,
        intensity: null,
        contributingDurationSeconds: null,
      }
    : aggregate.status === "partial"
      ? {
          status: "partial" as const,
          load: aggregate.load,
          intensity: aggregate.intensity,
          contributingDurationSeconds: aggregate.contributingDurationSeconds,
        }
      : {
          status: "complete" as const,
          load: aggregate.load,
          intensity: aggregate.intensity,
          contributingDurationSeconds: aggregate.contributingDurationSeconds,
        };
}

function applySourceCoverage(
  aggregate: ReturnType<typeof aggregateValue>,
  source: "complete" | "partial" | undefined,
) {
  if (source === "complete" || aggregate.status === "unavailable") return aggregate;
  if (source === "partial") {
    return aggregate.status === "known_zero"
      ? {
          status: "unavailable" as const,
          load: null,
          intensity: null,
          contributingDurationSeconds: null,
        }
      : { ...aggregate, status: "partial" as const };
  }
  return {
    status: "unavailable" as const,
    load: null,
    intensity: null,
    contributingDurationSeconds: null,
  };
}

function recommendationForDate(
  recommendation: CommonLoadRecommendation | undefined,
  date: string,
): { status: z.infer<typeof loadStatusSchema>; load: number | null } {
  if (!recommendation || recommendation.status === "unavailable") {
    return { status: "unavailable", load: null };
  }
  const point = recommendation.points.find((candidate) => candidate.date === date);
  if (!point || point.state === "unavailable") return { status: "unavailable", load: null };
  if (point.state === "partial") {
    return {
      status: "partial",
      load: point.aggregate.status === "unavailable" ? null : point.aggregate.load,
    };
  }
  if (point.state === "known_zero") return { status: "known_zero", load: 0 };
  return { status: point.state, load: point.load };
}

function unavailableLoadSummary(
  recommendation: ReturnType<typeof recommendationForDate>,
): z.infer<typeof planTabLoadSummarySchema> {
  return {
    status: "unavailable",
    commonLoad: null,
    intensity: null,
    contributingDurationSeconds: null,
    completedLoadStatus: "unavailable",
    completedLoad: null,
    knownCompletedLoadSubtotal: null,
    scheduledLoadStatus: "unavailable",
    scheduledLoad: null,
    knownScheduledLoadSubtotal: null,
    remainingLoadStatus: "unavailable",
    remainingLoad: null,
    hasUnavailableCompletedLoad: false,
    recommendedLoadStatus: recommendation.status,
    recommendedLoad: recommendation.load,
  };
}

function summarizeDate(response: EffectivePlanLoadDto, date: string) {
  const recommendation = recommendationForDate(
    response.status === "available" ? response.recommendation : undefined,
    date,
  );
  if (response.status !== "available" || response.effective.status !== "available") {
    return unavailableLoadSummary(recommendation);
  }
  const withinResolvedRange =
    response.resolvedRange.startDate !== null &&
    response.resolvedRange.endDate !== null &&
    date >= response.resolvedRange.startDate &&
    date <= response.resolvedRange.endDate;
  if (!withinResolvedRange) return unavailableLoadSummary(recommendation);

  const items = response.effective.firmItems.filter((item) => item.date === date);
  if (
    items.length === 0 &&
    response.effective.firm.status !== "complete" &&
    response.effective.firm.status !== "known_zero"
  ) {
    return unavailableLoadSummary(recommendation);
  }
  const completedItems = items.filter((item) => item.kind === "completed");
  const completedAggregate = aggregateValue(completedItems);
  const completed = applySourceCoverage(
    completedAggregate,
    response.sourceCoverage.activities?.status,
  );
  const scheduledItems = items.filter((item) => item.kind === "scheduled");
  const scheduledAggregate = aggregateValue(scheduledItems);
  const scheduled = applySourceCoverage(
    scheduledAggregate,
    response.sourceCoverage.scheduledItems?.status,
  );
  const scheduledLoadStatus = scheduled.status;
  const scheduledLoad = scheduled.load;
  const effectiveAggregate = aggregateValue(items);
  const effectiveSource =
    response.sourceCoverage.activities?.status === undefined ||
    response.sourceCoverage.scheduledItems?.status === undefined
      ? undefined
      : response.sourceCoverage.activities.status === "partial" ||
          response.sourceCoverage.scheduledItems.status === "partial"
        ? ("partial" as const)
        : ("complete" as const);
  const effective = applySourceCoverage(effectiveAggregate, effectiveSource);
  const loadComparison = compareTrainingLoad({
    scheduledLoad,
    scheduledLoadStatus,
    completedLoad: completed.load,
    completedLoadStatus: completed.status,
  });
  return planTabLoadSummarySchema.parse({
    status: effective.status,
    commonLoad: effective.load,
    intensity: effective.intensity,
    contributingDurationSeconds: effective.contributingDurationSeconds,
    completedLoadStatus: completed.status,
    completedLoad: completed.load,
    knownCompletedLoadSubtotal:
      completed.status === "partial" ? knownIncompleteLoadSubtotal(completedItems) : null,
    scheduledLoadStatus,
    scheduledLoad,
    knownScheduledLoadSubtotal:
      scheduled.status === "partial" ? knownIncompleteLoadSubtotal(scheduledItems) : null,
    remainingLoadStatus: loadComparison.remainingLoadStatus,
    remainingLoad: loadComparison.remainingLoad,
    hasUnavailableCompletedLoad:
      items.some((item) => item.kind === "completed") &&
      (completed.status === "partial" || completed.status === "unavailable"),
    recommendedLoadStatus: recommendation.status,
    recommendedLoad: recommendation.load,
  });
}

function dateKeys(startDate: string, endDate: string) {
  const result: string[] = [];
  for (let date = startDate, guard = 0; date <= endDate && guard <= MAX_PLANNING_RANGE_DAYS; ) {
    result.push(date);
    date = addDaysDateKey(date, 1);
    guard += 1;
  }
  return result;
}

function toProjectionDay(summary: z.infer<typeof planTabLoadSummarySchema>, date: string) {
  if (summary.remainingLoadStatus === "complete" && summary.remainingLoad !== null) {
    return { date, state: "available" as const, load: summary.remainingLoad };
  }
  if (summary.remainingLoadStatus === "partial" && summary.remainingLoad !== null) {
    return { date, state: "available" as const, load: summary.remainingLoad };
  }
  if (summary.remainingLoadStatus === "known_zero") {
    return { date, state: "known_zero" as const };
  }
  if (
    summary.knownScheduledLoadSubtotal !== null &&
    summary.knownScheduledLoadSubtotal !== undefined
  ) {
    return { date, state: "available" as const, load: summary.knownScheduledLoadSubtotal };
  }
  // A missing planned Load is a zero-Load trajectory assumption, not a reason
  // to remove every later Fitness/Fatigue/Form point from the chart.
  return { date, state: "known_zero" as const };
}

function assumedCompletedLoad(summary: z.infer<typeof planTabLoadSummarySchema> | undefined) {
  return summary?.completedLoad ?? summary?.knownCompletedLoadSubtotal ?? 0;
}

function recommendationProjectionDays(recommendation: CommonLoadRecommendation | undefined) {
  if (!recommendation || recommendation.status === "unavailable") return [];
  return recommendation.points.map<CommonLoadTrendProjectionDay>((point) => {
    if (point.state === "known_zero") return { date: point.date, state: "known_zero" };
    if (point.state === "complete") {
      return { date: point.date, state: "available", load: point.load };
    }
    return {
      date: point.date,
      state: "unavailable",
      reason: point.state === "partial" ? "partial" : "unavailable",
    };
  });
}

function buildFitness(input: {
  readModel: AthleteReadModel;
  dayLoads: Record<string, z.infer<typeof planTabLoadSummarySchema>>;
  today: string | null;
  recommendation?: CommonLoadRecommendation;
}) {
  const today = input.today;
  const history = input.readModel.loadHistory?.result;
  const historyPoints = history?.status === "available" ? history.points : [];
  const historyEndDate =
    history?.status === "available" && "identity" in history ? history.identity.endDate : null;
  const historyIsCurrent =
    historyEndDate !== null &&
    input.readModel.currentBaseline?.currentPlanningDate !== undefined &&
    historyEndDate === addDaysDateKey(input.readModel.currentBaseline.currentPlanningDate, -1);
  const publishedBaseline = input.readModel.currentBaseline?.baseline;
  const currentPlanningDate = input.readModel.currentBaseline?.currentPlanningDate;
  const currentBaselinePoint =
    publishedBaseline && currentPlanningDate
      ? {
          date: currentPlanningDate,
          longTermLoad: publishedBaseline.longTermLoad,
          recentLoad: publishedBaseline.recentLoad,
          loadBalance: publishedBaseline.loadBalance,
        }
      : null;
  const requestedDates = Object.keys(input.dayLoads).sort();
  const firstRequestedDate = requestedDates[0];
  const lastRequestedDate = requestedDates.at(-1);
  let actual = historyPoints
    .map((point) => ({
      date: point.date,
      longTermLoad: point.longTermLoad,
      recentLoad: point.recentLoad,
      loadBalance: point.loadBalance,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  if (actual.length > 0 && currentBaselinePoint && historyIsCurrent) {
    if (!actual.some((point) => point.date === currentBaselinePoint.date)) {
      actual = [...actual, currentBaselinePoint].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
    }
  } else if (actual.length === 0) {
    const requestedActualDates = requestedDates.filter((date) => !today || date <= today);
    const firstActualDate = requestedActualDates[0];
    if (firstActualDate) {
      const seedDate = addDaysDateKey(firstActualDate, -1);
      actual = projectCommonLoadTrend({
        baseline: { date: seedDate, longTermLoad: 0, recentLoad: 0 },
        days: requestedActualDates.map((date) => ({
          date,
          state: "available" as const,
          load: assumedCompletedLoad(input.dayLoads[date]),
        })),
      }).points.filter((point) => point.date !== seedDate);
    }
    if (currentBaselinePoint && Object.hasOwn(input.dayLoads, currentBaselinePoint.date)) {
      actual = [
        ...actual.filter((point) => point.date !== currentBaselinePoint.date),
        currentBaselinePoint,
      ].sort((left, right) => left.date.localeCompare(right.date));
    } else if (actual.length === 0 && currentBaselinePoint) {
      actual = [currentBaselinePoint];
    }
  }

  const firstActual = actual[0];
  if (firstRequestedDate && firstActual && firstRequestedDate < firstActual.date) {
    const assumedPrefix = projectCommonLoadTrend({
      baseline: {
        date: addDaysDateKey(firstRequestedDate, -1),
        longTermLoad: 0,
        recentLoad: 0,
      },
      days: requestedDates
        .filter((date) => date < firstActual.date && (!today || date <= today))
        .map((date) => ({
          date,
          state: "available" as const,
          load: assumedCompletedLoad(input.dayLoads[date]),
        })),
    });
    actual = [
      ...assumedPrefix.points.filter((point) => point.date >= firstRequestedDate),
      ...actual,
    ];
  }

  const lastActual = actual.at(-1);
  const lastRequestedActualDate = requestedDates.filter((date) => !today || date <= today).at(-1);
  if (lastActual && lastRequestedActualDate && lastActual.date < lastRequestedActualDate) {
    const useExistingState =
      diffDateOnlyUtcDays(lastActual.date, lastRequestedActualDate) <= MAX_PLANNING_RANGE_DAYS;
    const extensionBaseline = useExistingState
      ? lastActual
      : {
          date: addDaysDateKey(firstRequestedDate ?? lastRequestedActualDate, -1),
          longTermLoad: 0,
          recentLoad: 0,
        };
    const extension = projectCommonLoadTrend({
      baseline: extensionBaseline,
      days: dateKeys(addDaysDateKey(extensionBaseline.date, 1), lastRequestedActualDate).map(
        (date) => ({
          date,
          state: "available" as const,
          load: assumedCompletedLoad(input.dayLoads[date]),
        }),
      ),
    });
    actual = [
      ...actual,
      ...extension.points.filter(
        (point) =>
          point.date > lastActual.date &&
          point.date >= (firstRequestedDate ?? point.date) &&
          point.date <= lastRequestedActualDate,
      ),
    ];
  }
  if (currentBaselinePoint && Object.hasOwn(input.dayLoads, currentBaselinePoint.date)) {
    actual = [
      ...actual.filter((point) => point.date !== currentBaselinePoint.date),
      currentBaselinePoint,
    ].sort((left, right) => left.date.localeCompare(right.date));
  }

  const baseline =
    currentBaselinePoint ??
    (currentPlanningDate
      ? actual.find((point) => point.date === currentPlanningDate)
      : undefined) ??
    actual.at(-1);
  if (!baseline) {
    if (!firstRequestedDate || !lastRequestedDate) {
      return { actual, scheduled: [], recommended: [] };
    }
    const seedDate = addDaysDateKey(firstRequestedDate, -1);
    const trajectory = projectCommonLoadTrend({
      baseline: { date: seedDate, longTermLoad: 0, recentLoad: 0 },
      days: requestedDates.map((date) => {
        const summary = input.dayLoads[date];
        if (today && date <= today) {
          return { date, state: "available" as const, load: assumedCompletedLoad(summary) };
        }
        return summary ? toProjectionDay(summary, date) : { date, state: "known_zero" as const };
      }),
    }).points.filter((point) => point.date !== seedDate);
    return {
      actual: today ? trajectory.filter((point) => point.date <= today) : [],
      scheduled: today ? trajectory.filter((point) => point.date >= today) : trajectory,
      recommended: [],
    };
  }
  const futureDates = Object.keys(input.dayLoads)
    .filter((date) => date > baseline.date)
    .sort();
  const lastFutureDate = futureDates.at(-1);
  const projectionBaseline =
    firstRequestedDate &&
    lastFutureDate &&
    diffDateOnlyUtcDays(baseline.date, lastFutureDate) > MAX_PLANNING_RANGE_DAYS
      ? { date: addDaysDateKey(firstRequestedDate, -1), longTermLoad: 0, recentLoad: 0 }
      : baseline;
  const scheduledProjection = projectCommonLoadTrend({
    baseline: projectionBaseline,
    days: lastFutureDate
      ? dateKeys(addDaysDateKey(projectionBaseline.date, 1), lastFutureDate).map((date) => {
          const summary = input.dayLoads[date];
          if (today && date <= today) {
            return {
              date,
              state: "available" as const,
              load: assumedCompletedLoad(summary),
            };
          }
          return summary ? toProjectionDay(summary, date) : { date, state: "known_zero" as const };
        })
      : [],
  });
  const recommendedProjection = projectCommonLoadTrend({
    baseline,
    days: recommendationProjectionDays(input.recommendation).filter(
      (point) => point.date > baseline.date,
    ),
  });
  const mapProjection = (points: typeof scheduledProjection.points) =>
    points.map((point) => ({
      date: point.date,
      longTermLoad: point.longTermLoad,
      recentLoad: point.recentLoad,
      loadBalance: point.loadBalance,
    }));
  const actualExtension = scheduledProjection.points.filter(
    (point) =>
      projectionBaseline.date === baseline.date &&
      today &&
      point.date > baseline.date &&
      point.date <= today,
  );
  if (actualExtension.length > 0) {
    actual = [
      ...actual,
      ...mapProjection(actualExtension).filter(
        (point) => !actual.some((actualPoint) => actualPoint.date === point.date),
      ),
    ].sort((left, right) => left.date.localeCompare(right.date));
  }
  const scheduledStartDate =
    today && firstRequestedDate && today > firstRequestedDate ? today : firstRequestedDate;
  const scheduledPoints =
    futureDates.length === 0
      ? []
      : scheduledStartDate
        ? scheduledProjection.points.filter((point) => point.date >= scheduledStartDate)
        : scheduledProjection.points;
  return {
    actual,
    scheduled: mapProjection(scheduledPoints),
    recommended: mapProjection(recommendedProjection.points),
  };
}

function fitnessHistoryMetadata(readModel: AthleteReadModel): z.infer<typeof fitnessHistorySchema> {
  const history = readModel.loadHistory?.result;
  if (history?.status !== "available" || !("identity" in history) || !("maturity" in history)) {
    return { status: "unavailable", verifiedThrough: null, maturity: null };
  }
  const currentPlanningDate = readModel.currentBaseline?.currentPlanningDate;
  return {
    status:
      currentPlanningDate && history.identity.endDate === addDaysDateKey(currentPlanningDate, -1)
        ? "current"
        : "historical",
    verifiedThrough: history.identity.endDate,
    maturity: history.maturity.status,
  };
}

function recommendationPoints(response: EffectivePlanLoadDto) {
  if (response.status !== "available" || response.recommendation.status === "unavailable") {
    return [];
  }
  return response.recommendation.points.map((point) => ({
    date: point.date,
    status: point.state,
    load:
      point.state === "complete"
        ? point.load
        : point.state === "partial"
          ? point.aggregate.status === "unavailable"
            ? null
            : point.aggregate.load
          : point.state === "known_zero"
            ? 0
            : null,
  }));
}

type PlanTabLoadStatus = z.infer<typeof loadStatusSchema>;

function plannedItemLoadStatus(envelope: EffectiveItem["commonLoad"]): PlanTabLoadStatus {
  if (envelope.status === "unavailable") return "unavailable";
  if (envelope.status === "partial") return "partial";
  return "complete";
}

function completedItemLoadStatus(envelope: EffectiveItem["commonLoad"]): PlanTabLoadStatus {
  if (envelope.status === "unavailable") return "unavailable";
  if (envelope.status === "partial") return "partial";
  return envelope.load === 0 ? "known_zero" : "complete";
}

function applyItemSourceCoverage(
  itemStatus: PlanTabLoadStatus,
  source: "complete" | "partial" | undefined,
): PlanTabLoadStatus {
  if (source === undefined || itemStatus === "unavailable") return "unavailable";
  return source === "partial" ? "partial" : itemStatus;
}

export async function readPlanTabProjectionSnapshot(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  request: PlanTabRequest;
  asOf: Date;
  dependencies?: PlanTabProjectionDependencies;
}): Promise<PlanTabProjection> {
  const dependencies = input.dependencies ?? defaultDependencies;
  const readModel = await dependencies.readModel({
    db: input.db,
    profileId: input.profileId,
    now: input.asOf,
  });
  const effectiveLoad = await dependencies.readEffectiveLoad({
    db: input.db,
    profileId: input.profileId,
    request: input.request,
    asOf: input.asOf,
  });
  const currentScheduledPlan = await dependencies.readCurrentScheduledPlan({
    db: input.db,
    profileId: input.profileId,
    asOf: input.asOf,
  });
  const rawGoalMarkers = await dependencies.readGoalMarkers({
    db: input.db,
    profileId: input.profileId,
  });
  const goalMarkers = rawGoalMarkers.slice(0, 100);
  const goalMarkersTruncated = rawGoalMarkers.length > goalMarkers.length;
  const effectiveItems =
    effectiveLoad.status === "available" && effectiveLoad.effective.status === "available"
      ? effectiveLoad.effective.firmItems
      : [];
  const scheduledIds = effectiveItems.flatMap((item) =>
    item.kind === "scheduled" ? [item.scheduledItemId] : [],
  );
  const completedIds = effectiveItems.flatMap((item) =>
    item.kind === "completed" ? [item.completedActivityId] : [],
  );
  const metadata = await dependencies.readItemMetadata({
    db: input.db,
    profileId: input.profileId,
    scheduledIds,
    completedIds,
  });
  const planningTimezone =
    effectiveLoad.resolvedRange.timezone ?? readModel.currentBaseline?.planningTimezone ?? null;
  const today =
    effectiveLoad.status === "available"
      ? effectiveLoad.effective.planningDate
      : (readModel.currentBaseline?.currentPlanningDate ?? null);
  const dates = dateKeys(input.request.startDate, input.request.endDate);
  const dayLoads = Object.fromEntries(
    dates.map((date) => [date, summarizeDate(effectiveLoad, date)] as const),
  );
  const scheduledItems: ScheduledTrainingItem[] = effectiveItems.flatMap((item) => {
    if (item.kind !== "scheduled") return [];
    const itemMetadata = metadata.scheduled.get(item.scheduledItemId);
    const plannedLoadStatus = applyItemSourceCoverage(
      plannedItemLoadStatus(item.commonLoad),
      effectiveLoad.sourceCoverage.scheduledItems?.status,
    );
    return [
      {
        id: item.scheduledItemId,
        source: "training_plan",
        date: item.date,
        title: itemMetadata?.title ?? "Scheduled session",
        activityCategory: itemMetadata?.activityCategory ?? null,
        plannedLoad: plannedLoadStatus === "unavailable" ? null : envelopeLoad(item.commonLoad),
        plannedLoadStatus,
        status: "planned",
      },
    ];
  });
  const completedItems: CompletedTrainingItem[] = effectiveItems.flatMap((item) => {
    if (item.kind !== "completed") return [];
    const itemMetadata = metadata.completed.get(item.completedActivityId);
    const completedLoadStatus = applyItemSourceCoverage(
      completedItemLoadStatus(item.commonLoad),
      effectiveLoad.sourceCoverage.activities?.status,
    );
    return [
      {
        id: item.completedActivityId,
        source: "completed_activity",
        date: item.date,
        title: itemMetadata?.title ?? "Completed activity",
        activityCategory: itemMetadata?.activityCategory ?? null,
        completedLoad: completedLoadStatus === "unavailable" ? null : envelopeLoad(item.commonLoad),
        completedLoadStatus,
      },
    ];
  });
  const timeline = today
    ? buildTrainingTimelineWindow({
        today,
        startDate: input.request.startDate,
        endDate: input.request.endDate,
        loadPoints: dates.map((date) => {
          const load = dayLoads[date];
          if (!load) throw new Error("Plan-tab day load was not assembled");
          const point: TrainingLoadTimelineInputPoint = {
            date,
            ...(load.recommendedLoadStatus === "partial"
              ? {}
              : {
                  recommended_common_load: load.recommendedLoad,
                  recommended_common_load_status: load.recommendedLoadStatus,
                }),
            ...(load.scheduledLoadStatus === "partial"
              ? {}
              : {
                  scheduled_common_load: load.scheduledLoad,
                  scheduled_common_load_status: load.scheduledLoadStatus,
                }),
          };
          return point;
        }),
        scheduledItems,
        scheduledSourceStatus: effectiveLoad.sourceCoverage.scheduledItems?.status ?? "unavailable",
        completedItems,
        completedSourceStatus: effectiveLoad.sourceCoverage.activities?.status ?? "unavailable",
      })
    : null;
  const recommendation =
    effectiveLoad.status === "available" ? effectiveLoad.recommendation : undefined;
  return planTabProjectionSchema.parse({
    contractVersion: PLAN_TAB_PROJECTION_VERSION,
    asOf: input.asOf.toISOString(),
    planningTimezone,
    today,
    currentScheduledPlan,
    timeline,
    dayLoads,
    fitness: buildFitness({
      readModel,
      dayLoads,
      today,
      ...(recommendation === undefined ? {} : { recommendation }),
    }),
    fitnessHistory: fitnessHistoryMetadata(readModel),
    recommendationPoints: recommendationPoints(effectiveLoad),
    ledgerItems: effectiveItems.map((item) => {
      const envelope = item.commonLoad;
      const isPlanned = item.kind === "scheduled";
      const knownLoad = envelopeLoad(envelope);
      const knownIntensity = envelopeIntensity(envelope);
      const sourceStatus = isPlanned
        ? effectiveLoad.sourceCoverage.scheduledItems?.status
        : effectiveLoad.sourceCoverage.activities?.status;
      const loadStatus = applyItemSourceCoverage(
        isPlanned ? plannedItemLoadStatus(envelope) : completedItemLoadStatus(envelope),
        sourceStatus,
      );
      const contributingDurationStatus = loadStatus;
      const metadataItem =
        item.kind === "scheduled"
          ? metadata.scheduled.get(item.scheduledItemId)
          : metadata.completed.get(item.completedActivityId);
      const completedDoses =
        item.kind === "completed"
          ? (metadata.completed.get(item.completedActivityId)?.categoryDoses ?? [])
          : [];
      const fallbackCategory = canonicalActivityCategorySchema.safeParse(
        metadataItem?.activityCategory,
      );
      const categoryDoses =
        item.kind === "completed"
          ? completedDoses
          : fallbackCategory.success
            ? [
                {
                  activityCategory: fallbackCategory.data,
                  durationSeconds: {
                    status: contributingDurationStatus,
                    value:
                      contributingDurationStatus === "unavailable"
                        ? null
                        : envelope.contributingDurationSeconds,
                  },
                  distanceMeters: unavailableCompositionMetric(),
                  elevationGainMeters: unavailableCompositionMetric(),
                },
              ]
            : [];
      const categoryDoseStatus =
        item.kind === "completed"
          ? (metadata.completed.get(item.completedActivityId)?.categoryDoseStatus ??
            (completedDoses.length > 0 ? "complete" : "unavailable"))
          : fallbackCategory.success
            ? "complete"
            : "unavailable";
      return {
        id: item.kind === "scheduled" ? item.scheduledItemId : item.completedActivityId,
        date: item.date,
        kind: item.kind === "completed" ? ("completed" as const) : ("planned" as const),
        title:
          metadataItem?.title ??
          (item.kind === "completed" ? "Completed activity" : "Scheduled session"),
        activityCategory: metadataItem?.activityCategory ?? null,
        categoryDoses,
        categoryDoseStatus,
        loadStatus,
        load: loadStatus === "unavailable" ? null : knownLoad,
        intensityStatus: loadStatus,
        intensity: loadStatus === "unavailable" ? null : knownIntensity,
        contributingDurationStatus,
        contributingDurationSeconds:
          contributingDurationStatus === "unavailable"
            ? null
            : envelope.contributingDurationSeconds,
      };
    }),
    sourceCoverage: effectiveLoad.sourceCoverage,
    goalMarkers,
    goalMarkersTruncated,
    publishedRevision: readModel.publishedRevision,
    algorithmVersion: readModel.algorithmVersion,
  });
}

/** Reads every Plan-tab source from one read-only repeatable-read database snapshot. */
export async function readPlanTabProjection(input: {
  db: DbClientWithTransaction;
  profileId: string;
  request: z.input<typeof planTabProjectionInputSchema>;
  asOf?: Date;
  dependencies?: PlanTabProjectionDependencies;
}): Promise<PlanTabProjection> {
  const request = planTabProjectionInputSchema.parse(input.request);
  const asOf = input.asOf ?? new Date();
  const dependencies = input.dependencies ?? defaultDependencies;
  return withRepeatableReadSnapshot(input.db, (tx) =>
    readPlanTabProjectionSnapshot({
      db: tx,
      profileId: input.profileId,
      request,
      asOf,
      dependencies,
    }),
  );
}

export const planTabCommonLoadIdentity = {
  model: COMMON_RELATIVE_LOAD_MODEL,
  version: COMMON_RELATIVE_LOAD_VERSION,
} as const;
