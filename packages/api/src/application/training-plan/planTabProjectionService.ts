import {
  addDaysDateKey,
  buildTrainingTimelineWindowFromLoadTimeline,
  type CompletedTrainingItem,
  dateOnlySchema,
  type ScheduledTrainingItem,
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
import { activities, activityPlans, events, profileGoals, trainingPlans } from "@repo/db";
import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../../db";
import { createEventReadRepository } from "../../infrastructure/repositories";
import {
  type AthleteReadModel,
  readAthleteReadModel,
} from "../athlete-intelligence/athlete-read-model";
import { type EffectivePlanLoadDto, getEffectivePlanLoad } from "./get-effective-plan-load";

const MAX_PLAN_TAB_RANGE_DAYS = 90;
export const PLAN_TAB_PROJECTION_VERSION = "plan-tab-projection-v1" as const;

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
const planTabLoadSummarySchema = z
  .object({
    status: loadStatusSchema,
    commonLoad: z.number().finite().nonnegative().nullable(),
    intensity: z.number().finite().nonnegative().nullable(),
    contributingDurationSeconds: z.number().finite().nonnegative().nullable(),
    completedLoadStatus: loadStatusSchema,
    completedLoad: z.number().finite().nonnegative().nullable(),
    scheduledLoadStatus: loadStatusSchema,
    scheduledLoad: z.number().finite().nonnegative().nullable(),
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
const currentScheduledPlanSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    scheduleBatchId: z.string().uuid().nullable(),
    nextEventAt: z.string().datetime({ offset: true }),
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
    recommendationPoints: z.array(recommendationPointSchema),
    ledgerItems: z.array(ledgerItemSchema),
    sourceCoverage: sourceCoverageSchema,
    goalMarkers: z.array(goalMarkerSchema).max(100),
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
  completed: Map<string, { title: string; activityCategory: string | null }>;
};

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
  if (!structure || typeof structure !== "object" || Array.isArray(structure)) return null;
  const value = (structure as { activity_category?: unknown }).activity_category;
  return typeof value === "string" && value.trim() ? value : null;
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
        nextEventAt: events.starts_at,
      })
      .from(events)
      .innerJoin(trainingPlans, eq(trainingPlans.id, events.training_plan_id))
      .where(
        and(
          eq(events.profile_id, profileId),
          eq(events.event_type, "planned"),
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
          nextEventAt: row.nextEventAt.toISOString(),
        }
      : null;
  },
  readGoalMarkers: async ({ db, profileId }) => {
    const rows = await db
      .select({
        id: profileGoals.id,
        label: profileGoals.title,
        targetDate: profileGoals.target_date,
        activityCategory: profileGoals.activity_category,
      })
      .from(profileGoals)
      .where(eq(profileGoals.profile_id, profileId))
      .orderBy(asc(profileGoals.target_date), asc(profileGoals.priority))
      .limit(100);
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
        completedRows.map((row) => [
          row.id,
          {
            title: row.title.trim() || "Completed activity",
            activityCategory: row.activityCategory ?? null,
          },
        ]),
      ),
    };
  },
};

type AvailableEffectiveLoad = Extract<EffectivePlanLoadDto, { status: "available" }>;
type EffectiveItem = Extract<
  AvailableEffectiveLoad["effective"],
  { status: "available" }
>["firmItems"][number];

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
    : {
        status: aggregate.status,
        load: aggregate.load,
        intensity: aggregate.intensity,
        contributingDurationSeconds: aggregate.contributingDurationSeconds,
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
    scheduledLoadStatus: "unavailable",
    scheduledLoad: null,
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
  const completed = aggregateValue(items.filter((item) => item.kind === "completed"));
  const scheduled = aggregateValue(items.filter((item) => item.kind === "scheduled"));
  const effective = aggregateValue(items);
  return planTabLoadSummarySchema.parse({
    status: effective.status,
    commonLoad: effective.load,
    intensity: effective.intensity,
    contributingDurationSeconds: effective.contributingDurationSeconds,
    completedLoadStatus: completed.status,
    completedLoad: completed.load,
    scheduledLoadStatus: effective.status,
    scheduledLoad: effective.load,
    remainingLoadStatus: scheduled.status,
    remainingLoad: scheduled.load,
    hasUnavailableCompletedLoad:
      items.some((item) => item.kind === "completed") &&
      (completed.status === "unavailable" || completed.status === "partial"),
    recommendedLoadStatus: recommendation.status,
    recommendedLoad: recommendation.load,
  });
}

function dateKeys(startDate: string, endDate: string) {
  const result: string[] = [];
  for (let date = startDate, guard = 0; date <= endDate && guard <= MAX_PLAN_TAB_RANGE_DAYS; ) {
    result.push(date);
    date = addDaysDateKey(date, 1);
    guard += 1;
  }
  return result;
}

function toProjectionDay(summary: z.infer<typeof planTabLoadSummarySchema>, date: string) {
  if (summary.status === "known_zero") {
    return { date, state: "known_zero" as const };
  }
  if (summary.status === "complete" && summary.commonLoad !== null) {
    return { date, state: "available" as const, load: summary.commonLoad };
  }
  return {
    date,
    state: "unavailable" as const,
    reason: summary.status === "partial" ? "partial" : "unavailable",
  } satisfies CommonLoadTrendProjectionDay;
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
  recommendation?: CommonLoadRecommendation;
}) {
  const history = input.readModel.loadHistory?.result;
  if (!history || history.status !== "available" || history.points.length === 0) {
    return { actual: [], scheduled: [], recommended: [] };
  }
  const actual = history.points.map((point) => ({
    date: point.date,
    longTermLoad: point.longTermLoad,
    recentLoad: point.recentLoad,
    loadBalance: point.loadBalance,
  }));
  const baseline = history.points.at(-1);
  if (!baseline) return { actual, scheduled: [], recommended: [] };
  const scheduledProjection = projectCommonLoadTrend({
    baseline,
    days: Object.entries(input.dayLoads)
      .filter(([date]) => date > baseline.date)
      .map(([date, summary]) => toProjectionDay(summary, date)),
  });
  const recommendedProjection = projectCommonLoadTrend({
    baseline,
    days: recommendationProjectionDays(input.recommendation).filter(
      (point) => point.date > baseline.date,
    ),
  });
  const mapProjection = (points: typeof scheduledProjection.points) =>
    points.length > 1
      ? points.map((point) => ({
          date: point.date,
          longTermLoad: point.longTermLoad,
          recentLoad: point.recentLoad,
          loadBalance: point.loadBalance,
        }))
      : [];
  return {
    actual,
    scheduled: mapProjection(scheduledProjection.points),
    recommended: mapProjection(recommendedProjection.points),
  };
}

function recommendationPoints(response: EffectivePlanLoadDto) {
  if (response.status !== "available" || response.recommendation.status === "unavailable") {
    return [];
  }
  return response.recommendation.points.map((point) => ({
    date: point.date,
    status: point.state,
    load: point.state === "complete" || point.state === "partial" ? point.load : 0,
  }));
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
  const goalMarkers = await dependencies.readGoalMarkers({
    db: input.db,
    profileId: input.profileId,
  });
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
    return [
      {
        id: item.scheduledItemId,
        source: "training_plan",
        date: item.date,
        title: itemMetadata?.title ?? "Scheduled session",
        activityCategory: itemMetadata?.activityCategory ?? null,
        plannedLoad: item.commonLoad.status === "unavailable" ? null : item.commonLoad.load,
        status: "planned",
      },
    ];
  });
  const completedItems: CompletedTrainingItem[] = effectiveItems.flatMap((item) => {
    if (item.kind !== "completed") return [];
    const itemMetadata = metadata.completed.get(item.completedActivityId);
    return [
      {
        id: item.completedActivityId,
        source: "completed_activity",
        date: item.date,
        title: itemMetadata?.title ?? "Completed activity",
        activityCategory: itemMetadata?.activityCategory ?? null,
        completedLoad: item.commonLoad.status === "unavailable" ? null : item.commonLoad.load,
      },
    ];
  });
  const timeline = today
    ? buildTrainingTimelineWindowFromLoadTimeline({
        today,
        startDate: input.request.startDate,
        endDate: input.request.endDate,
        timeline: dates.map((date) => {
          const load = dayLoads[date];
          if (!load) throw new Error("Plan-tab day load was not assembled");
          return {
            date,
            recommended_common_load: load.recommendedLoad,
            scheduled_common_load: load.remainingLoad,
            completed_common_load: load.completedLoad,
          };
        }),
        scheduledItems,
        completedItems,
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
      ...(recommendation === undefined ? {} : { recommendation }),
    }),
    recommendationPoints: recommendationPoints(effectiveLoad),
    ledgerItems: effectiveItems.map((item) => {
      const envelope = item.commonLoad;
      const unavailable = envelope.status === "unavailable";
      const loadStatus = unavailable
        ? ("unavailable" as const)
        : envelope.status === "partial"
          ? ("partial" as const)
          : envelope.load === 0
            ? ("known_zero" as const)
            : ("complete" as const);
      const metadataItem =
        item.kind === "scheduled"
          ? metadata.scheduled.get(item.scheduledItemId)
          : metadata.completed.get(item.completedActivityId);
      return {
        id: item.kind === "scheduled" ? item.scheduledItemId : item.completedActivityId,
        date: item.date,
        kind: item.kind === "completed" ? ("completed" as const) : ("planned" as const),
        title:
          metadataItem?.title ??
          (item.kind === "completed" ? "Completed activity" : "Scheduled session"),
        loadStatus,
        load: unavailable ? null : envelope.load,
        intensityStatus: loadStatus,
        intensity: unavailable ? null : envelope.intensity,
        contributingDurationStatus: loadStatus,
        contributingDurationSeconds: unavailable ? null : envelope.contributingDurationSeconds,
      };
    }),
    sourceCoverage: effectiveLoad.sourceCoverage,
    goalMarkers,
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
  return input.db.transaction(
    (tx) =>
      readPlanTabProjectionSnapshot({
        db: tx,
        profileId: input.profileId,
        request,
        asOf,
        dependencies,
      }),
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}

export const planTabCommonLoadIdentity = {
  model: COMMON_RELATIVE_LOAD_MODEL,
  version: COMMON_RELATIVE_LOAD_VERSION,
} as const;
