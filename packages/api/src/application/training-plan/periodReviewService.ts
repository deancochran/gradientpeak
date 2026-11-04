import {
  addDaysDateOnlyUtc,
  buildPlanPeriodReview,
  canonicalActivityCategorySchema,
  planPeriodReviewRequestSchema,
  planPeriodReviewSchema,
  resolvePlanPeriodReviewRanges,
} from "@repo/core";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { type PlanTabProjection, readPlanTabProjection } from "./planTabProjectionService";

type Db = ReturnType<typeof getRequiredDb>;
const unavailable = { status: "unavailable" as const, value: null, knownSubtotal: null };

const compositionMetricSchema = z
  .object({
    status: z.enum(["complete", "partial", "known_zero", "unavailable"]),
    value: z.number().finite().nonnegative().nullable(),
  })
  .strict();
const categoryCompositionSchema = z
  .object({
    activityCategory: canonicalActivityCategorySchema,
    sessions: compositionMetricSchema,
    activeDays: compositionMetricSchema,
    load: compositionMetricSchema,
    durationSeconds: compositionMetricSchema,
    distanceMeters: compositionMetricSchema,
    elevationGainMeters: compositionMetricSchema,
    longestSessionDurationSeconds: compositionMetricSchema,
  })
  .strict();
const trainingCompositionSummarySchema = z
  .object({
    coverage: z.enum(["complete", "partial", "unavailable"]),
    sessions: compositionMetricSchema,
    activeDays: compositionMetricSchema,
    categories: z.array(categoryCompositionSchema).max(8),
  })
  .strict();
export const trainingCompositionSchema = z
  .object({
    selected: z
      .object({
        actual: trainingCompositionSummarySchema,
        planned: trainingCompositionSummarySchema,
      })
      .strict(),
    comparison: z
      .object({
        actual: trainingCompositionSummarySchema,
        planned: trainingCompositionSummarySchema,
      })
      .strict(),
  })
  .strict();
export type TrainingComposition = z.infer<typeof trainingCompositionSchema>;

export const planPeriodReviewResponseSchema = z
  .object({
    ...planPeriodReviewSchema.shape,
    asOf: z.string().datetime({ offset: true }),
    planningTimezone: z.string().min(1).nullable(),
    publishedRevision: z.number().int().nonnegative().nullable(),
    algorithmVersion: z.string().min(1).nullable(),
    periodState: z.enum(["historical", "current", "future", "unavailable"]),
    trainingComposition: trainingCompositionSchema,
    thresholdEvidence: z
      .object({ status: z.literal("unavailable"), reason: z.literal("not_composed") })
      .strict(),
    recoveryContext: z
      .object({ status: z.literal("unavailable"), reason: z.literal("not_composed") })
      .strict(),
  })
  .strict();
export type PlanPeriodReviewResponse = z.infer<typeof planPeriodReviewResponseSchema>;

export type PlanPeriodReviewDependencies = {
  readProjection: (input: {
    db: Db;
    profileId: string;
    request: { startDate: string; endDate: string };
    asOf: Date;
  }) => Promise<PlanTabProjection>;
};

const defaultDependencies: PlanPeriodReviewDependencies = { readProjection: readPlanTabProjection };

function sourceStatus(value: { status: "complete" | "partial" } | null) {
  return value?.status ?? "unavailable";
}

function periodState(today: string | null, startDate: string, endDate: string) {
  if (!today) return "unavailable" as const;
  if (startDate > today) return "future" as const;
  if (endDate < today) return "historical" as const;
  return "current" as const;
}

function itemEvidence(
  items: PlanTabProjection["ledgerItems"],
  field: "contributingDurationSeconds" | "intensity",
  statusField: "contributingDurationStatus" | "intensityStatus",
  source: "complete" | "partial" | "unavailable",
) {
  if (source === "unavailable") return unavailable;
  const knownSubtotal = items.reduce((total, item) => total + (item[field] ?? 0), 0);
  if (source === "partial" || items.some((item) => item[statusField] === "partial"))
    return {
      status: "partial" as const,
      value: knownSubtotal,
      knownSubtotal: knownSubtotal || null,
    };
  if (items.some((item) => item[statusField] === "unavailable" || item[field] === null))
    return unavailable;
  const value = items.reduce((total, item) => total + (item[field] ?? 0), 0);
  return {
    status: value === 0 ? ("known_zero" as const) : ("complete" as const),
    value,
    knownSubtotal: null,
  };
}

function intensityEvidence(
  items: PlanTabProjection["ledgerItems"],
  source: "complete" | "partial" | "unavailable",
) {
  const duration = itemEvidence(
    items,
    "contributingDurationSeconds",
    "contributingDurationStatus",
    source,
  );
  if (duration.status === "unavailable") return unavailable;
  if (items.some((item) => item.intensityStatus === "unavailable" || item.intensity === null)) {
    return unavailable;
  }
  if (duration.value === 0) {
    return duration.status === "partial"
      ? { status: "partial" as const, value: 0, knownSubtotal: null }
      : { status: "known_zero" as const, value: 0, knownSubtotal: null };
  }
  const value =
    items.reduce(
      (total, item) => total + (item.intensity ?? 0) * (item.contributingDurationSeconds ?? 0),
      0,
    ) / duration.value;
  return {
    status:
      duration.status === "partial" || items.some((item) => item.intensityStatus === "partial")
        ? ("partial" as const)
        : ("complete" as const),
    value,
    knownSubtotal: null,
  };
}

function retainPartialSubtotal<
  Value extends { status: string; value: number | null; knownSubtotal: number | null },
>(value: Value): Value {
  return value.status === "partial" && value.value === null && value.knownSubtotal !== null
    ? { ...value, value: value.knownSubtotal }
    : value;
}

function categoryCounts(items: PlanTabProjection["ledgerItems"]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const category = item.activityCategory ?? "unknown";
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

type CompositionMetric = z.infer<typeof compositionMetricSchema>;

function metricForSource(
  source: "complete" | "partial" | "unavailable",
  value: number,
): CompositionMetric {
  if (source === "unavailable") return { status: "unavailable", value: null };
  if (source === "partial") return { status: "partial", value };
  return { status: value === 0 ? "known_zero" : "complete", value };
}

function aggregateCompositionMetric(values: CompositionMetric[]): CompositionMetric {
  const known = values.flatMap((entry) => (entry.value === null ? [] : [entry.value]));
  if (known.length === 0) return { status: "unavailable", value: null };
  const value = known.reduce((total, entry) => total + entry, 0);
  if (known.length !== values.length || values.some((entry) => entry.status === "partial")) {
    return { status: "partial", value };
  }
  return { status: value === 0 ? "known_zero" : "complete", value };
}

function longestCompositionMetric(values: CompositionMetric[]): CompositionMetric {
  const known = values.flatMap((entry) => (entry.value === null ? [] : [entry.value]));
  if (known.length === 0) return { status: "unavailable", value: null };
  const value = Math.max(...known);
  if (known.length !== values.length || values.some((entry) => entry.status === "partial")) {
    return { status: "partial", value };
  }
  return { status: value === 0 ? "known_zero" : "complete", value };
}

function applyCompositionSource(
  metric: CompositionMetric,
  source: "complete" | "partial" | "unavailable",
): CompositionMetric {
  if (source === "unavailable") return { status: "unavailable", value: null };
  if (source === "partial" && metric.value !== null)
    return { status: "partial", value: metric.value };
  return metric;
}

function itemCategoryDoses(item: PlanTabProjection["ledgerItems"][number]) {
  if (item.categoryDoses && item.categoryDoses.length > 0) return item.categoryDoses;
  if (item.kind === "completed") return [];
  const category = canonicalActivityCategorySchema.safeParse(item.activityCategory);
  if (!category.success) return [];
  return [
    {
      activityCategory: category.data,
      durationSeconds: {
        status: item.contributingDurationStatus,
        value: item.contributingDurationSeconds,
      },
      distanceMeters: { status: "unavailable" as const, value: null },
      elevationGainMeters: { status: "unavailable" as const, value: null },
    },
  ];
}

export function buildTrainingComposition(input: {
  items: PlanTabProjection["ledgerItems"];
  startDate: string;
  endDate: string;
  kind: "completed" | "planned";
  source: "complete" | "partial" | "unavailable";
}) {
  const items = input.items.filter(
    (item) =>
      item.kind === input.kind && item.date >= input.startDate && item.date <= input.endDate,
  );
  const compositionSource =
    input.source === "unavailable"
      ? ("unavailable" as const)
      : input.source === "partial" || items.some((item) => item.categoryDoseStatus !== "complete")
        ? ("partial" as const)
        : ("complete" as const);
  const groups = new Map<
    z.infer<typeof canonicalActivityCategorySchema>,
    Array<{
      id: string;
      date: string;
      load: CompositionMetric;
      durationSeconds: CompositionMetric;
      distanceMeters: CompositionMetric;
      elevationGainMeters: CompositionMetric;
    }>
  >();
  for (const item of items) {
    const doses = itemCategoryDoses(item);
    for (const dose of doses) {
      const entries = groups.get(dose.activityCategory) ?? [];
      entries.push({
        id: item.id,
        date: item.date,
        load:
          doses.length === 1
            ? { status: item.loadStatus, value: item.load }
            : { status: "unavailable", value: null },
        durationSeconds: dose.durationSeconds,
        distanceMeters: dose.distanceMeters,
        elevationGainMeters: dose.elevationGainMeters,
      });
      groups.set(dose.activityCategory, entries);
    }
  }
  const categories = [...groups.entries()]
    .map(([activityCategory, entries]) => {
      const sessions = new Set(entries.map((entry) => entry.id)).size;
      const activeDays = new Set(entries.map((entry) => entry.date)).size;
      return {
        activityCategory,
        sessions: metricForSource(compositionSource, sessions),
        activeDays: metricForSource(compositionSource, activeDays),
        load: applyCompositionSource(
          aggregateCompositionMetric(entries.map((entry) => entry.load)),
          compositionSource,
        ),
        durationSeconds: applyCompositionSource(
          aggregateCompositionMetric(entries.map((entry) => entry.durationSeconds)),
          compositionSource,
        ),
        distanceMeters: applyCompositionSource(
          aggregateCompositionMetric(entries.map((entry) => entry.distanceMeters)),
          compositionSource,
        ),
        elevationGainMeters: applyCompositionSource(
          aggregateCompositionMetric(entries.map((entry) => entry.elevationGainMeters)),
          compositionSource,
        ),
        longestSessionDurationSeconds: applyCompositionSource(
          longestCompositionMetric(entries.map((entry) => entry.durationSeconds)),
          compositionSource,
        ),
      };
    })
    .sort(
      (left, right) =>
        (right.sessions.value ?? 0) - (left.sessions.value ?? 0) ||
        left.activityCategory.localeCompare(right.activityCategory),
    )
    .slice(0, 8);
  return trainingCompositionSummarySchema.parse({
    coverage: compositionSource,
    sessions: metricForSource(input.source, items.length),
    activeDays: metricForSource(input.source, new Set(items.map((item) => item.date)).size),
    categories,
  });
}

export function buildPeriodTrainingComposition(input: {
  projection: PlanTabProjection;
  ranges: ReturnType<typeof resolvePlanPeriodReviewRanges>;
  selectedPeriodState: "historical" | "current" | "future" | "unavailable";
}) {
  const activities = sourceStatus(input.projection.sourceCoverage.activities);
  const scheduledItems = sourceStatus(input.projection.sourceCoverage.scheduledItems);
  return trainingCompositionSchema.parse({
    selected: {
      actual: buildTrainingComposition({
        items: input.projection.ledgerItems,
        startDate: input.ranges.selected.startDate,
        endDate: input.ranges.selected.endDate,
        kind: "completed",
        source: input.selectedPeriodState === "future" ? "unavailable" : activities,
      }),
      planned: buildTrainingComposition({
        items: input.projection.ledgerItems,
        startDate: input.ranges.selected.startDate,
        endDate: input.ranges.selected.endDate,
        kind: "planned",
        source: scheduledItems,
      }),
    },
    comparison: {
      actual: buildTrainingComposition({
        items: input.projection.ledgerItems,
        startDate: input.ranges.comparison.startDate,
        endDate: input.ranges.comparison.endDate,
        kind: "completed",
        source: activities,
      }),
      planned: buildTrainingComposition({
        items: input.projection.ledgerItems,
        startDate: input.ranges.comparison.startDate,
        endDate: input.ranges.comparison.endDate,
        kind: "planned",
        source: scheduledItems,
      }),
    },
  });
}

/**
 * Bounded read-only composition over the existing Plan projection. It deliberately
 * does not join threshold or recovery stores: those sources lack a shared snapshot
 * boundary with the projection, so their status is explicit rather than speculative.
 */
export async function readPlanPeriodReview(input: {
  db: Db;
  profileId: string;
  request: z.input<typeof planPeriodReviewRequestSchema>;
  asOf?: Date;
  dependencies?: PlanPeriodReviewDependencies;
}): Promise<PlanPeriodReviewResponse> {
  const request = planPeriodReviewRequestSchema.parse(input.request);
  const ranges = resolvePlanPeriodReviewRanges(request);
  const asOf = input.asOf ?? new Date();
  const projection = await (input.dependencies ?? defaultDependencies).readProjection({
    db: input.db,
    profileId: input.profileId,
    request: { startDate: ranges.readRange.startDate, endDate: ranges.readRange.endDate },
    asOf,
  });
  const activities = sourceStatus(projection.sourceCoverage.activities);
  const scheduledItems = sourceStatus(projection.sourceCoverage.scheduledItems);
  const facts = [];
  for (
    let date = ranges.readRange.startDate;
    date <= ranges.readRange.endDate;
    date = addDaysDateOnlyUtc(date, 1)
  ) {
    const load = projection.dayLoads[date];
    const completed = projection.ledgerItems.filter(
      (item) => item.date === date && item.kind === "completed",
    );
    const planned = projection.ledgerItems.filter(
      (item) => item.date === date && item.kind === "planned",
    );
    const actualIsFuture = projection.today !== null && date > projection.today;
    facts.push({
      date,
      completedLoad:
        actualIsFuture || !load
          ? unavailable
          : {
              status: load.completedLoadStatus,
              value: load.completedLoad,
              knownSubtotal: load.knownCompletedLoadSubtotal ?? null,
            },
      committedLoad: !load
        ? unavailable
        : {
            status: load.remainingLoadStatus,
            value: load.remainingLoad,
            knownSubtotal: load.knownScheduledLoadSubtotal ?? null,
          },
      targetLoad: !load
        ? unavailable
        : { status: load.recommendedLoadStatus, value: load.recommendedLoad, knownSubtotal: null },
      actualSessions: completed.length,
      plannedSessions: planned.length,
      actualCategoryCounts: categoryCounts(completed),
      plannedCategoryCounts: categoryCounts(planned),
      actualDurationSeconds: actualIsFuture
        ? unavailable
        : itemEvidence(
            completed,
            "contributingDurationSeconds",
            "contributingDurationStatus",
            activities,
          ),
      plannedDurationSeconds: itemEvidence(
        planned,
        "contributingDurationSeconds",
        "contributingDurationStatus",
        scheduledItems,
      ),
      actualIntensity: actualIsFuture ? unavailable : intensityEvidence(completed, activities),
      plannedIntensity: intensityEvidence(planned, scheduledItems),
    });
  }
  const selectedPeriodState = periodState(
    projection.today,
    ranges.selected.startDate,
    ranges.selected.endDate,
  );
  const review = buildPlanPeriodReview({
    request,
    dailyFacts: facts,
    coverage: { activities, scheduledItems },
    selectedPeriodState,
    todayDate: projection.today,
    actualStateFacts: projection.fitness.actual.filter(
      (point) => projection.today === null || point.date <= projection.today,
    ),
    scheduledStateFacts: projection.fitness.scheduled,
    fitnessHistory: {
      status: projection.fitnessHistory?.status ?? "unavailable",
      maturity: projection.fitnessHistory?.maturity ?? null,
    },
  });
  const reviewWithPartialLoads = {
    ...review,
    actual: { ...review.actual, load: retainPartialSubtotal(review.actual.load) },
    projected: {
      ...review.projected,
      load: retainPartialSubtotal(review.projected.load),
      targetLoad: retainPartialSubtotal(review.projected.targetLoad),
    },
    comparison: {
      actual: {
        ...review.comparison.actual,
        load: retainPartialSubtotal(review.comparison.actual.load),
      },
      projected: {
        ...review.comparison.projected,
        load: retainPartialSubtotal(review.comparison.projected.load),
        targetLoad: retainPartialSubtotal(review.comparison.projected.targetLoad),
      },
    },
  };
  const trainingComposition = buildPeriodTrainingComposition({
    projection,
    ranges,
    selectedPeriodState,
  });
  return planPeriodReviewResponseSchema.parse({
    ...reviewWithPartialLoads,
    asOf: projection.asOf,
    planningTimezone: projection.planningTimezone,
    publishedRevision: projection.publishedRevision,
    algorithmVersion: projection.algorithmVersion,
    periodState: selectedPeriodState,
    trainingComposition,
    thresholdEvidence: { status: "unavailable", reason: "not_composed" },
    recoveryContext: { status: "unavailable", reason: "not_composed" },
  });
}
