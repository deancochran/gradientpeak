import {
  assessCapabilities,
  deriveGoalRequirementSet,
  evaluateGoalGaps,
  parseProfileGoalRecord,
} from "@repo/core";
import { activities, profileGoals, profileMetrics } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

const ACTIVITY_LOOKBACK_DAYS = 90;
const ACTIVITY_LIMIT = 120;
const METRIC_LIMIT = 20;
const SELECTED_METRIC_TYPES = ["ftp", "vo2_max"] as const;

export type AthleteIntelligenceScheduleState = "not_requested" | "unsupported";

function toIsoDate(value: Date) {
  return value.toISOString();
}

/**
 * Builds the dynamic athlete-intelligence response from bounded profile-scoped reads.
 * Schedule context is explicitly unsupported in this MVP and therefore never queried.
 */
export async function evaluateAthleteIntelligence(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  goalId: string;
  includeScheduleContext?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [goalRow] = await input.db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(and(eq(profileGoals.id, input.goalId), eq(profileGoals.profile_id, input.profileId)))
    .limit(1);

  if (!goalRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }

  const lookbackStart = new Date(now);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - ACTIVITY_LOOKBACK_DAYS);

  const [activityRows, metricRows] = await Promise.all([
    input.db
      .select({
        type: activities.type,
        started_at: activities.started_at,
        duration_seconds: activities.duration_seconds,
        distance_meters: activities.distance_meters,
        max_power: activities.max_power,
        max_speed_mps: activities.max_speed_mps,
        avg_swolf: activities.avg_swolf,
      })
      .from(activities)
      .where(
        and(eq(activities.profile_id, input.profileId), gte(activities.started_at, lookbackStart)),
      )
      .orderBy(desc(activities.started_at))
      .limit(ACTIVITY_LIMIT),
    input.db
      .select({
        metric_type: profileMetrics.metric_type,
        recorded_at: profileMetrics.recorded_at,
        value: profileMetrics.value,
      })
      .from(profileMetrics)
      .where(
        and(
          eq(profileMetrics.profile_id, input.profileId),
          inArray(profileMetrics.metric_type, SELECTED_METRIC_TYPES),
        ),
      )
      .orderBy(desc(profileMetrics.recorded_at))
      .limit(METRIC_LIMIT),
  ]);

  const goal = parseProfileGoalRecord(goalRow);
  const assessedAt = toIsoDate(now);
  const requirements = deriveGoalRequirementSet({ goal, asOf: assessedAt });
  const capabilities = assessCapabilities({
    athleteId: input.profileId,
    assessedAt,
    goalActivityCategory: goal.activity_category,
    activities: activityRows.map((activity) => ({
      type: activity.type,
      startedAt: toIsoDate(activity.started_at),
      durationSeconds: activity.duration_seconds,
      distanceMeters: activity.distance_meters,
      maxPower: activity.max_power,
      maxSpeedMps: activity.max_speed_mps,
      avgSwolf: activity.avg_swolf,
    })),
    metrics: metricRows
      .filter(
        (metric): metric is typeof metric & { metric_type: "ftp" | "vo2_max" } =>
          metric.value > 0 && (metric.metric_type === "ftp" || metric.metric_type === "vo2_max"),
      )
      .map((metric) => ({
        metricType: metric.metric_type,
        recordedAt: toIsoDate(metric.recorded_at),
        value: metric.value,
      })),
  });

  return {
    goalId: goal.id,
    requirements,
    capabilities,
    gaps: evaluateGoalGaps({ requirements, capabilities }),
    schedule: {
      state: (input.includeScheduleContext
        ? "unsupported"
        : "not_requested") as AthleteIntelligenceScheduleState,
    },
  };
}

export const athleteIntelligenceReadLimits = {
  activityLookbackDays: ACTIVITY_LOOKBACK_DAYS,
  activityLimit: ACTIVITY_LIMIT,
  metricLimit: METRIC_LIMIT,
  selectedMetricTypes: SELECTED_METRIC_TYPES,
} as const;
