import {
  advanceAthleteStateTo,
  athletePerformanceTargetFactsSchema,
  athletePlanningContextSchema,
  athleteStateBaselineSchema,
  createAthletePlanningContextFromSnapshot,
  createUnavailableAthletePerformanceTargetFacts,
  formatDateOnlyInTimeZone,
} from "@repo/core";
import { profileMetricTypeSchema } from "@repo/core/athlete-inputs";
import { commonLoadHistoryResultSchema } from "@repo/core/load";
import { publicActivityCategorySchema, publicProfileMetricsRowSchema } from "@repo/db";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../../db";
import {
  ATHLETE_READ_MODEL_TIMELINE_LIMIT,
  readAthleteObservationTimeline,
  readAthleteReadModelContextSources,
} from "../../repositories/athlete-read-model-repository";
import { getCommonLoadHistory } from "../activities/common-load-history";
import {
  athleteActivityAnalyticsRequestSchema,
  athleteActivityAnalyticsSchema,
  getAthleteActivityAnalytics,
} from "./activity-analytics";
import {
  projectionFreshnessSchema,
  projectionRebuildStatusSchema,
  readPublishedAthleteStateSnapshot,
} from "./published-athlete-state";
import { buildTrendInsights, trendInsightsSectionSchema } from "./trend-insights";

export const ATHLETE_READ_MODEL_VERSION = "athlete-read-model-v1" as const;

const observationTimelineRequestSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    metricTypes: z
      .array(profileMetricTypeSchema)
      .max(profileMetricTypeSchema.options.length)
      .optional(),
    limit: z.number().int().min(1).max(ATHLETE_READ_MODEL_TIMELINE_LIMIT).default(100),
  })
  .strict()
  .superRefine((input, context) => {
    const start = Date.parse(input.startAt);
    const end = Date.parse(input.endAt);
    if (end < start) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must not precede startAt",
      });
    } else if (end - start > 365 * 86_400_000) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Observation timeline range must not exceed 365 days",
      });
    }
  });

export const athleteReadModelSectionsSchema = z
  .object({
    publishedState: z.boolean().optional(),
    status: z.boolean().optional(),
    currentBaseline: z
      .object({ includePlanningContext: z.boolean().default(false) })
      .strict()
      .optional(),
    loadHistory: z.boolean().optional(),
    profileObservations: observationTimelineRequestSchema.optional(),
    activityAnalytics: athleteActivityAnalyticsRequestSchema.optional(),
    trendInsights: athleteActivityAnalyticsRequestSchema
      .extend({
        observationLimit: z
          .number()
          .int()
          .min(1)
          .max(ATHLETE_READ_MODEL_TIMELINE_LIMIT)
          .default(100),
      })
      .optional(),
  })
  .strict()
  .refine((sections) => Object.values(sections).some(Boolean), {
    message: "At least one AthleteReadModel section must be requested",
  });

export const athleteReadModelRequestSchema = z
  .object({
    profileId: z.string().uuid(),
    sections: athleteReadModelSectionsSchema,
  })
  .strict();

const performanceEstimateSchema = z
  .object({
    capabilityKind: z.string().min(1),
    activityCategory: publicActivityCategorySchema,
    value: z.number().nonnegative(),
    unit: z.string().min(1),
    confidence: z.number().min(0).max(1),
    effectiveAt: z.string().datetime({ offset: true }),
    evidenceWindowStartAt: z.string().datetime({ offset: true }).nullable(),
    evidenceWindowEndAt: z.string().datetime({ offset: true }).nullable(),
    algorithmVersion: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    computedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const publishedStateSectionSchema = z
  .object({
    publishedAt: z.string().datetime({ offset: true }),
    baseline: athleteStateBaselineSchema,
    estimates: z.array(performanceEstimateSchema).max(100),
    performanceTargets: athletePerformanceTargetFactsSchema,
  })
  .strict()
  .nullable();

const statusSectionSchema = z
  .object({
    freshness: projectionFreshnessSchema,
    rebuildStatus: projectionRebuildStatusSchema,
    importStatus: z.enum(["complete", "active", "failed"]),
    sourceRevision: z.number().int().nonnegative().nullable(),
    publishedRevision: z.number().int().nonnegative().nullable(),
    coverage: z
      .object({
        startAt: z.string().datetime({ offset: true }).nullable(),
        endAt: z.string().datetime({ offset: true }).nullable(),
        lastActivityAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
  })
  .strict();

const currentBaselineSectionSchema = z
  .object({
    planningTimezone: z.string().min(1),
    currentPlanningDate: z.iso.date(),
    baseline: athleteStateBaselineSchema.nullable(),
    planningContext: athletePlanningContextSchema.nullable(),
  })
  .strict();

const loadHistorySectionSchema = z
  .object({
    publishedRevision: z.number().int().positive(),
    algorithmVersion: z.string().min(1),
    result: commonLoadHistoryResultSchema,
  })
  .strict()
  .nullable();

const profileObservationsSectionSchema = z
  .object({
    range: z
      .object({
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    items: z.array(publicProfileMetricsRowSchema).max(ATHLETE_READ_MODEL_TIMELINE_LIMIT),
    truncated: z.boolean(),
  })
  .strict();

export const athleteReadModelSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_READ_MODEL_VERSION),
    profileId: z.string().uuid(),
    asOf: z.string().datetime({ offset: true }),
    publishedRevision: z.number().int().nonnegative().nullable(),
    algorithmVersion: z.string().min(1).nullable(),
    publishedState: publishedStateSectionSchema.optional(),
    status: statusSectionSchema.optional(),
    currentBaseline: currentBaselineSectionSchema.optional(),
    loadHistory: loadHistorySectionSchema.optional(),
    profileObservations: profileObservationsSectionSchema.optional(),
    activityAnalytics: athleteActivityAnalyticsSchema.optional(),
    trendInsights: trendInsightsSectionSchema.optional(),
  })
  .strict();

export type AthleteReadModel = z.infer<typeof athleteReadModelSchema>;

const CURRENT_CONTEXT_OBSERVATION_TYPES = new Set([
  "weight_kg",
  "resting_hr",
  "hrv_rmssd",
  "body_fat_percentage",
  "sleep_hours",
  "hydration_level",
  "stress_score",
  "soreness_level",
  "wellness_score",
]);

function provenanceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

export async function readAthleteReadModel(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  sections: z.output<typeof athleteReadModelSectionsSchema>;
  now?: Date;
  lockStateForUpdate?: boolean;
}): Promise<AthleteReadModel> {
  const now = input.now ?? new Date();
  const published = await readPublishedAthleteStateSnapshot({
    db: input.db,
    profileId: input.profileId,
    now,
    advanceBaselineToReadTime: false,
    ...(input.lockStateForUpdate === undefined
      ? {}
      : { lockStateForUpdate: input.lockStateForUpdate }),
  });
  const result: Record<string, unknown> = {
    contractVersion: ATHLETE_READ_MODEL_VERSION,
    profileId: input.profileId,
    asOf: now.toISOString(),
    publishedRevision: published.revisions.published,
    algorithmVersion: published.algorithmVersion,
  };

  if (input.sections.publishedState) {
    result.publishedState =
      published.baseline && published.performanceTargets && published.computedAt
        ? {
            publishedAt: published.computedAt,
            baseline: published.baseline,
            estimates: published.estimates.map((estimate) => ({
              capabilityKind: estimate.capability_kind,
              activityCategory: estimate.activity_category,
              value: estimate.value,
              unit: estimate.unit,
              confidence: estimate.confidence,
              effectiveAt: estimate.effective_at.toISOString(),
              evidenceWindowStartAt: estimate.evidence_window_start_at?.toISOString() ?? null,
              evidenceWindowEndAt: estimate.evidence_window_end_at?.toISOString() ?? null,
              algorithmVersion: estimate.algorithm_version,
              sourceRevision: estimate.source_revision,
              computedAt: estimate.computed_at.toISOString(),
            })),
            performanceTargets: published.performanceTargets,
          }
        : null;
  }

  if (input.sections.status) {
    result.status = {
      freshness: published.freshness,
      rebuildStatus: published.rebuildStatus,
      importStatus: published.importStatus,
      sourceRevision: published.revisions.source,
      publishedRevision: published.revisions.published,
      coverage: published.coverage,
    };
  }

  if (input.sections.currentBaseline) {
    const contextAsOf = published.computedAt ?? now.toISOString();
    const currentBaseline =
      published.baseline && Date.parse(published.baseline.asOf) < now.getTime()
        ? advanceAthleteStateTo(published.baseline, now.toISOString(), {
            fromDay: formatDateOnlyInTimeZone(
              new Date(published.baseline.asOf),
              published.planningTimezone,
            ),
            toDay: published.currentPlanningDate,
          }).state
        : published.baseline;
    let planningContext: z.infer<typeof athletePlanningContextSchema> | null = null;
    if (input.sections.currentBaseline.includePlanningContext) {
      const contextSources = await readAthleteReadModelContextSources(input.db, {
        profileId: input.profileId,
        asOf: new Date(contextAsOf),
      });
      if (!contextSources.profile) throw new Error("Profile not found");
      const observationMetrics = contextSources.observations
        .filter((metric) => CURRENT_CONTEXT_OBSERVATION_TYPES.has(metric.metric_type))
        .map((metric) => ({
          ...metric,
          provenance: provenanceRecord(metric.provenance),
        }));
      const performanceTargets =
        published.performanceTargets ??
        createUnavailableAthletePerformanceTargetFacts(contextAsOf, input.profileId);
      planningContext = createAthletePlanningContextFromSnapshot({
        asOf: contextAsOf,
        profile: {
          dob: contextSources.profile.dob,
          gender: contextSources.profile.gender,
          preferred_units: contextSources.profile.preferredUnits,
        },
        profileMetrics: observationMetrics,
        activityEfforts: [],
        currentFitness: published.baseline
          ? {
              longTermLoad: published.baseline.longTermLoad,
              recentLoad: published.baseline.recentLoad,
              loadBalance: published.baseline.loadBalance,
              recorded_at: published.baseline.asOf,
            }
          : null,
        performanceTargets,
        coverage: {
          profileMetrics: contextSources.observationsTruncated ? "possibly_truncated" : "complete",
          activityEfforts: "complete",
        },
      });
    }
    result.currentBaseline = {
      planningTimezone: published.planningTimezone,
      currentPlanningDate: published.currentPlanningDate,
      baseline: currentBaseline,
      planningContext,
    };
  }

  if (input.sections.loadHistory) {
    result.loadHistory =
      published.freshness === "fresh" &&
      published.importStatus === "complete" &&
      published.revisions.published !== null &&
      published.revisions.published > 0 &&
      published.algorithmVersion
        ? {
            publishedRevision: published.revisions.published,
            algorithmVersion: published.algorithmVersion,
            result: await getCommonLoadHistory({
              asOf: now,
              db: input.db as never,
              profileId: input.profileId,
              currentPlanningDate: published.currentPlanningDate,
              planningTimezone: published.planningTimezone,
            }),
          }
        : null;
  }

  if (input.sections.profileObservations) {
    const request = input.sections.profileObservations;
    const timeline = await readAthleteObservationTimeline(input.db, {
      profileId: input.profileId,
      startAt: new Date(request.startAt),
      endAt: new Date(request.endAt),
      limit: request.limit,
      ...(request.metricTypes === undefined ? {} : { metricTypes: request.metricTypes }),
    });
    result.profileObservations = {
      range: { startAt: request.startAt, endAt: request.endAt },
      items: timeline.items,
      truncated: timeline.truncated,
    };
  }

  if (input.sections.activityAnalytics) {
    result.activityAnalytics = await getAthleteActivityAnalytics({
      db: input.db,
      profileId: input.profileId,
      request: input.sections.activityAnalytics,
    });
  }

  if (input.sections.trendInsights) {
    const request = input.sections.trendInsights;
    const [timeline, analytics, loadHistory] = await Promise.all([
      readAthleteObservationTimeline(input.db, {
        profileId: input.profileId,
        startAt: new Date(request.startAt),
        endAt: new Date(request.endAt),
        limit: request.observationLimit,
      }),
      getAthleteActivityAnalytics({
        db: input.db,
        profileId: input.profileId,
        request,
      }),
      published.freshness === "fresh" &&
      published.importStatus === "complete" &&
      published.revisions.published !== null &&
      published.revisions.published > 0 &&
      published.algorithmVersion
        ? getCommonLoadHistory({
            asOf: now,
            db: input.db as never,
            profileId: input.profileId,
            currentPlanningDate: published.currentPlanningDate,
            planningTimezone: published.planningTimezone,
          })
        : Promise.resolve(null),
    ]);
    result.trendInsights = buildTrendInsights({
      analytics,
      loadHistory,
      observations: timeline.items,
    });
  }

  return athleteReadModelSchema.parse(result);
}
