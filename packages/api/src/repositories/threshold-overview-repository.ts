import {
  getThresholdActivityCategoryPolicy,
  type ThresholdActivityCategory,
  type ThresholdMethod,
  type ThresholdMetric,
  thresholdActivityCategorySchema,
  thresholdMethodSchema,
  thresholdMetricSchema,
  thresholdUnitSchema,
} from "@repo/core/performance-calibration";
import { activities, thresholdEvaluationEfforts, thresholdEvaluations, thresholds } from "@repo/db";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

type ThresholdUnit = z.infer<typeof thresholdUnitSchema>;

export type ThresholdHistoryCursor = {
  effectiveAt: Date;
  createdAt: Date;
  thresholdId: string;
};

export type PublishedThresholdHistoryItem = {
  thresholdId: string;
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  unit: ThresholdUnit;
  method: ThresholdMethod;
  value: number;
  confidence: number;
  effectiveAt: Date;
  createdAt: Date;
  policyVersion: string;
  sourceActivities: Array<{ id: string; name: string; finishedAt: Date }>;
};

export async function readPublishedThresholdHistory(
  db: DrizzleQueryExecutor,
  input: { profileId: string; limit: number; cursor?: ThresholdHistoryCursor },
): Promise<{ items: PublishedThresholdHistoryItem[]; nextCursor: ThresholdHistoryCursor | null }> {
  const rows = await db
    .select({
      thresholdId: thresholds.id,
      activityCategory: thresholds.activity_category,
      metric: thresholds.metric,
      unit: thresholds.unit,
      method: thresholds.method,
      value: thresholds.value,
      confidence: thresholds.confidence,
      effectiveAt: thresholds.effective_at,
      createdAt: thresholds.created_at,
      policyVersion: thresholds.policy_version,
      evaluationId: thresholds.evaluation_id,
    })
    .from(thresholds)
    .where(
      and(
        eq(thresholds.profile_id, input.profileId),
        input.cursor
          ? or(
              lt(thresholds.effective_at, input.cursor.effectiveAt),
              and(
                eq(thresholds.effective_at, input.cursor.effectiveAt),
                lt(thresholds.created_at, input.cursor.createdAt),
              ),
              and(
                eq(thresholds.effective_at, input.cursor.effectiveAt),
                eq(thresholds.created_at, input.cursor.createdAt),
                lt(thresholds.id, input.cursor.thresholdId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(thresholds.effective_at), desc(thresholds.created_at), desc(thresholds.id))
    .limit(input.limit + 1);

  const page = rows.slice(0, input.limit);
  if (page.length === 0) return { items: [], nextCursor: null };

  const provenance = await db
    .select({
      evaluationId: thresholdEvaluationEfforts.evaluation_id,
      activityId: activities.id,
      activityName: activities.name,
      finishedAt: activities.finished_at,
    })
    .from(thresholdEvaluationEfforts)
    .innerJoin(
      thresholdEvaluations,
      and(
        eq(thresholdEvaluations.id, thresholdEvaluationEfforts.evaluation_id),
        eq(thresholdEvaluations.profile_id, input.profileId),
      ),
    )
    .innerJoin(
      activities,
      and(
        eq(activities.id, thresholdEvaluationEfforts.activity_id),
        eq(activities.profile_id, input.profileId),
      ),
    )
    .where(
      inArray(
        thresholdEvaluationEfforts.evaluation_id,
        page.map((row) => row.evaluationId),
      ),
    );

  const activitiesByEvaluation = new Map<
    string,
    Array<{ id: string; name: string; finishedAt: Date }>
  >();
  for (const row of provenance) {
    const sourceActivities = activitiesByEvaluation.get(row.evaluationId) ?? [];
    if (!sourceActivities.some((activity) => activity.id === row.activityId)) {
      sourceActivities.push({
        id: row.activityId,
        name: row.activityName,
        finishedAt: row.finishedAt,
      });
    }
    activitiesByEvaluation.set(row.evaluationId, sourceActivities);
  }

  const items = page.map((row) => {
    const sourceActivities = activitiesByEvaluation.get(row.evaluationId) ?? [];
    if (sourceActivities.length === 0) {
      throw new Error("Published threshold has no live source activity provenance");
    }
    const activityCategory = thresholdActivityCategorySchema.parse(row.activityCategory);
    const metric = thresholdMetricSchema.parse(row.metric);
    const unit = thresholdUnitSchema.parse(row.unit);
    const method = thresholdMethodSchema.parse(row.method);
    const policy = getThresholdActivityCategoryPolicy(activityCategory, metric);
    if (unit !== policy.unit || method !== policy.method) {
      throw new Error(
        "Published threshold history row does not match its canonical policy identity",
      );
    }
    return {
      thresholdId: row.thresholdId,
      activityCategory,
      metric,
      unit,
      method,
      value: row.value,
      confidence: row.confidence,
      effectiveAt: row.effectiveAt,
      createdAt: row.createdAt,
      policyVersion: row.policyVersion,
      sourceActivities,
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? {
            effectiveAt: last.effectiveAt,
            createdAt: last.createdAt,
            thresholdId: last.thresholdId,
          }
        : null,
  };
}
