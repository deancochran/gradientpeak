import { z } from "zod";

import {
  aggregateCommonLoadEnvelopes,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
} from "./common-relative-load";

export const COMMON_LOAD_RECOMMENDATION_POLICY_VERSION = "common_load_recommendation_v1" as const;
export const COMMON_LOAD_RECOMMENDATION_SOURCE = "applied_training_plan_prescription" as const;

const MAX_RECOMMENDATION_DAYS = 366;
const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = calendarDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Expected a valid YYYY-MM-DD calendar date",
});

const recommendationCoverageSchema = z
  .object({
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
  })
  .strict()
  .refine((coverage) => coverage.startDate <= coverage.endDate, {
    message: "Recommendation coverage start must not follow its end",
    path: ["endDate"],
  });

const recommendationPointBaseShape = {
  date: calendarDateSchema,
  sourceScheduledItemIds: z.array(z.string().uuid()).max(10_000),
};

const completeRecommendationPointSchema = z
  .object({
    ...recommendationPointBaseShape,
    state: z.literal("complete"),
    load: z.number().finite().nonnegative(),
    intensity: z.number().finite().min(0).max(1.5),
    aggregate: commonLoadAggregateSchema,
  })
  .strict()
  .superRefine((point, context) => {
    if (point.aggregate.status !== "complete") {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "Complete recommendation requires a complete aggregate",
      });
    }
    if (point.aggregate.status !== "unavailable") {
      if (point.load !== point.aggregate.load || point.intensity !== point.aggregate.intensity) {
        context.addIssue({
          code: "custom",
          message: "Recommendation values must match their aggregate",
        });
      }
    }
    if (point.sourceScheduledItemIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sourceScheduledItemIds"],
        message: "A non-zero recommendation day requires a source item",
      });
    }
  });

const partialRecommendationPointSchema = z
  .object({
    ...recommendationPointBaseShape,
    state: z.literal("partial"),
    load: z.number().finite().nonnegative(),
    intensity: z.number().finite().min(0).max(1.5),
    aggregate: commonLoadAggregateSchema,
  })
  .strict()
  .superRefine((point, context) => {
    if (point.aggregate.status !== "partial") {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "Partial recommendation requires a partial aggregate",
      });
    }
    if (point.aggregate.status !== "unavailable") {
      if (point.load !== point.aggregate.load || point.intensity !== point.aggregate.intensity) {
        context.addIssue({
          code: "custom",
          message: "Recommendation values must match their aggregate",
        });
      }
    }
    if (point.sourceScheduledItemIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sourceScheduledItemIds"],
        message: "A partial recommendation day requires a source item",
      });
    }
  });

const unavailableRecommendationPointSchema = z
  .object({
    ...recommendationPointBaseShape,
    state: z.literal("unavailable"),
    load: z.null(),
    intensity: z.null(),
    aggregate: commonLoadAggregateSchema,
  })
  .strict()
  .superRefine((point, context) => {
    if (point.aggregate.status !== "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["aggregate"],
        message: "Unavailable recommendation requires an unavailable aggregate",
      });
    }
    if (point.sourceScheduledItemIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sourceScheduledItemIds"],
        message: "An unavailable recommendation day requires a source item",
      });
    }
  });

const knownZeroRecommendationPointSchema = z
  .object({
    ...recommendationPointBaseShape,
    state: z.literal("known_zero"),
    load: z.literal(0),
    intensity: z.null(),
    sourceScheduledItemIds: z.array(z.never()).length(0),
  })
  .strict();

export const commonLoadRecommendationPointSchema = z.discriminatedUnion("state", [
  completeRecommendationPointSchema,
  partialRecommendationPointSchema,
  unavailableRecommendationPointSchema,
  knownZeroRecommendationPointSchema,
]);

const recommendationIdentityShape = {
  policyVersion: z.literal(COMMON_LOAD_RECOMMENDATION_POLICY_VERSION),
  model: z.literal(COMMON_RELATIVE_LOAD_MODEL),
  version: z.literal(COMMON_RELATIVE_LOAD_VERSION),
  source: z.literal(COMMON_LOAD_RECOMMENDATION_SOURCE),
};

const availableRecommendationBaseShape = {
  ...recommendationIdentityShape,
  computedAsOf: z.string().datetime({ offset: true }),
  planningTimezone: z.string().trim().min(1),
  trainingPlanId: z.string().uuid(),
  scheduleBatchId: z.string().uuid().nullable(),
  sourceItemCount: z.number().int().positive().max(10_000),
  coverage: recommendationCoverageSchema,
  points: z.array(commonLoadRecommendationPointSchema).min(1).max(MAX_RECOMMENDATION_DAYS),
};

function addCalendarDay(date: string): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateDenseRecommendation(
  recommendation: {
    coverage: z.infer<typeof recommendationCoverageSchema>;
    points: z.infer<typeof commonLoadRecommendationPointSchema>[];
  },
  context: z.RefinementCtx,
): void {
  let expectedDate = recommendation.coverage.startDate;
  const seenSourceIds = new Set<string>();
  for (const [index, point] of recommendation.points.entries()) {
    if (point.date !== expectedDate) {
      context.addIssue({
        code: "custom",
        path: ["points", index, "date"],
        message: "Recommendation points must be dense and ordered by date",
      });
    }
    const sortedIds = [...point.sourceScheduledItemIds].sort(compareAscii);
    if (sortedIds.some((id, idIndex) => id !== point.sourceScheduledItemIds[idIndex])) {
      context.addIssue({
        code: "custom",
        path: ["points", index, "sourceScheduledItemIds"],
        message: "Recommendation source IDs must be sorted",
      });
    }
    for (const id of point.sourceScheduledItemIds) {
      if (seenSourceIds.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["points", index, "sourceScheduledItemIds"],
          message: "A scheduled item may contribute to only one recommendation day",
        });
      }
      seenSourceIds.add(id);
    }
    expectedDate = addCalendarDay(expectedDate);
  }
  if (recommendation.points.at(-1)?.date !== recommendation.coverage.endDate) {
    context.addIssue({
      code: "custom",
      path: ["coverage", "endDate"],
      message: "Recommendation coverage must end at the final dense point",
    });
  }
}

const completeRecommendationSchema = z
  .object({
    status: z.literal("complete"),
    ...availableRecommendationBaseShape,
  })
  .strict()
  .superRefine((recommendation, context) => {
    validateDenseRecommendation(recommendation, context);
    if (
      recommendation.points.some(
        (point) => point.state === "partial" || point.state === "unavailable",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Incomplete points require partial recommendation status",
      });
    }
  });

const partialRecommendationSchema = z
  .object({
    status: z.literal("partial"),
    ...availableRecommendationBaseShape,
  })
  .strict()
  .superRefine((recommendation, context) => {
    validateDenseRecommendation(recommendation, context);
    if (
      !recommendation.points.some(
        (point) => point.state === "partial" || point.state === "unavailable",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "A fully known recommendation must use complete status",
      });
    }
  });

const unavailableRecommendationSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "invalid_input",
      "no_active_training_plan",
      "no_future_prescriptions",
      "source_incomplete",
      "range_limit_exceeded",
    ]),
    ...recommendationIdentityShape,
    computedAsOf: z.string().datetime({ offset: true }).nullable(),
    planningTimezone: z.string().trim().min(1).nullable(),
    trainingPlanId: z.string().uuid().nullable(),
    scheduleBatchId: z.string().uuid().nullable(),
    sourceItemCount: z.number().int().nonnegative().max(10_000),
    coverage: recommendationCoverageSchema.nullable(),
    points: z.tuple([]),
  })
  .strict();

const commonLoadRecommendationUnionSchema = z.discriminatedUnion("status", [
  completeRecommendationSchema,
  partialRecommendationSchema,
  unavailableRecommendationSchema,
]);
export const commonLoadRecommendationSchema = commonLoadRecommendationUnionSchema;

export const commonLoadRecommendationBuildInputSchema = z
  .object({
    computedAsOf: z.string().datetime({ offset: true }),
    planningTimezone: z.string().trim().min(1),
    planningDate: calendarDateSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    sourceStatus: z.enum(["complete", "partial"]),
    trainingPlanId: z.string().uuid().nullable(),
    scheduleBatchId: z.string().uuid().nullable(),
    items: z
      .array(
        z
          .object({
            scheduledItemId: z.string().uuid(),
            recommendationDate: calendarDateSchema,
            commonLoad: z.union([commonLoadResultSchema, commonLoadAggregateSchema]),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict()
  .refine((input) => input.startDate <= input.endDate, {
    message: "Recommendation start must not follow its end",
    path: ["endDate"],
  });

export type CommonLoadRecommendationPoint = z.infer<typeof commonLoadRecommendationPointSchema>;
export type CommonLoadRecommendation = z.infer<typeof commonLoadRecommendationSchema>;
export type CommonLoadRecommendationBuildInput = z.input<
  typeof commonLoadRecommendationBuildInputSchema
>;

function countInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function eachDate(startDate: string, endDate: string): string[] {
  return Array.from({ length: countInclusiveDays(startDate, endDate) }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function unavailableRecommendation(input: {
  reason: z.infer<typeof unavailableRecommendationSchema>["reason"];
  computedAsOf: string | null;
  planningTimezone: string | null;
  trainingPlanId: string | null;
  scheduleBatchId: string | null;
  sourceItemCount: number;
  coverage: z.infer<typeof recommendationCoverageSchema> | null;
}): CommonLoadRecommendation {
  return unavailableRecommendationSchema.parse({
    status: "unavailable",
    ...input,
    ...{
      policyVersion: COMMON_LOAD_RECOMMENDATION_POLICY_VERSION,
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      source: COMMON_LOAD_RECOMMENDATION_SOURCE,
    },
    points: [],
  });
}

/**
 * Builds a dense target series from one applied training-plan schedule. Missing source
 * prescriptions inside complete schedule coverage are known rest; unavailable prescriptions
 * remain unavailable and are never converted to zero.
 */
export function buildCommonLoadRecommendation(
  input: CommonLoadRecommendationBuildInput,
): CommonLoadRecommendation {
  const parsed = commonLoadRecommendationBuildInputSchema.safeParse(input);
  if (!parsed.success) {
    return unavailableRecommendation({
      reason: "invalid_input",
      computedAsOf: null,
      planningTimezone: null,
      trainingPlanId: null,
      scheduleBatchId: null,
      sourceItemCount: 0,
      coverage: null,
    });
  }
  const value = parsed.data;
  const requestedCoverage = { startDate: value.startDate, endDate: value.endDate };
  if (value.sourceStatus !== "complete") {
    return unavailableRecommendation({
      reason: "source_incomplete",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  if (!value.trainingPlanId) {
    return unavailableRecommendation({
      reason: "no_active_training_plan",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: null,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  const recommendationStartDate =
    value.planningDate > value.startDate ? value.planningDate : value.startDate;
  if (recommendationStartDate > value.endDate) {
    return unavailableRecommendation({
      reason: "no_future_prescriptions",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  const uniqueItemIds = new Set(value.items.map((item) => item.scheduledItemId));
  if (uniqueItemIds.size !== value.items.length) {
    return unavailableRecommendation({
      reason: "invalid_input",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  const latestFuturePrescriptionDate = value.items
    .map((item) => item.recommendationDate)
    .filter((date) => date >= recommendationStartDate)
    .sort((left, right) => compareAscii(right, left))[0];
  if (!latestFuturePrescriptionDate) {
    return unavailableRecommendation({
      reason: "no_future_prescriptions",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  const coverage = {
    startDate: recommendationStartDate,
    endDate:
      latestFuturePrescriptionDate < value.endDate ? latestFuturePrescriptionDate : value.endDate,
  };
  if (coverage.endDate < coverage.startDate) {
    return unavailableRecommendation({
      reason: "no_future_prescriptions",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage: requestedCoverage,
    });
  }
  if (countInclusiveDays(coverage.startDate, coverage.endDate) > MAX_RECOMMENDATION_DAYS) {
    return unavailableRecommendation({
      reason: "range_limit_exceeded",
      computedAsOf: value.computedAsOf,
      planningTimezone: value.planningTimezone,
      trainingPlanId: value.trainingPlanId,
      scheduleBatchId: value.scheduleBatchId,
      sourceItemCount: value.items.length,
      coverage,
    });
  }

  const itemsByDate = new Map<string, typeof value.items>();
  for (const item of value.items) {
    if (
      item.recommendationDate < coverage.startDate ||
      item.recommendationDate > coverage.endDate
    ) {
      continue;
    }
    const items = itemsByDate.get(item.recommendationDate) ?? [];
    items.push(item);
    itemsByDate.set(item.recommendationDate, items);
  }
  const points: CommonLoadRecommendationPoint[] = eachDate(
    coverage.startDate,
    coverage.endDate,
  ).map((date) => {
    const items = itemsByDate.get(date) ?? [];
    if (items.length === 0) {
      return {
        date,
        state: "known_zero",
        load: 0,
        intensity: null,
        sourceScheduledItemIds: [],
      };
    }
    const aggregate = aggregateCommonLoadEnvelopes(items.map((item) => item.commonLoad));
    const sourceScheduledItemIds = items.map((item) => item.scheduledItemId).sort(compareAscii);
    if (aggregate.status === "unavailable") {
      return {
        date,
        state: "unavailable",
        load: null,
        intensity: null,
        aggregate,
        sourceScheduledItemIds,
      };
    }
    return {
      date,
      state: aggregate.status,
      load: aggregate.load,
      intensity: aggregate.intensity,
      aggregate,
      sourceScheduledItemIds,
    };
  });
  const status = points.some((point) => point.state === "partial" || point.state === "unavailable")
    ? "partial"
    : "complete";
  return commonLoadRecommendationSchema.parse({
    status,
    policyVersion: COMMON_LOAD_RECOMMENDATION_POLICY_VERSION,
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    source: COMMON_LOAD_RECOMMENDATION_SOURCE,
    computedAsOf: value.computedAsOf,
    planningTimezone: value.planningTimezone,
    trainingPlanId: value.trainingPlanId,
    scheduleBatchId: value.scheduleBatchId,
    sourceItemCount: value.items.length,
    coverage,
    points,
  });
}
