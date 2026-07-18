import {
  type ActivityPlanMetricsLike,
  getAuthoritativeActivityPlanMetrics,
} from "@repo/core/activity-plan";
import { type SQLWrapper, sql } from "drizzle-orm";

type ScheduleGapDbClient = {
  execute: (query: string | SQLWrapper) => unknown;
};

type LegacyPlanningReader = { from: (...args: any[]) => any };

type ActivityPlanLike = ActivityPlanMetricsLike & {
  id?: unknown;
  name?: unknown;
  activity_category?: unknown;
  estimated_duration_seconds?: unknown;
  created_at?: unknown;
};

export type ScheduleGapActivityPlanMatchReasonCode =
  | "near_target_tss"
  | "same_activity_category"
  | "reasonable_duration"
  | "owned_plan"
  | "recently_created";

export type ScheduleGapActivityPlanMatch = {
  activity_plan_id: string;
  name: string;
  activity_category: string | null;
  estimated_tss: number | null;
  estimated_duration_seconds: number | null;
  score: number;
  target_tss_delta: number;
  absolute_tss_gap: number | null;
  reason_codes: ScheduleGapActivityPlanMatchReasonCode[];
};

export type ScheduleGapActivityPlanMatches = {
  target_date: string;
  target_tss_delta: number;
  matches: ScheduleGapActivityPlanMatch[];
  empty_reason:
    | "no_positive_gap"
    | "no_activity_plans"
    | "no_estimated_tss"
    | "low_confidence"
    | null;
};

type ScheduleGapLoadComparison = {
  weeks: Array<{
    week_start: string;
    week_end: string;
    scheduled_load: number | null;
    recommended_load: number | null;
  }>;
};

type ScheduleGapRecommendation = {
  type: string;
  target_date: string;
  target_load_delta: number | null;
};

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function readFinitePlanNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 10) / 10;
    }
  }

  return null;
}

function isRecentlyCreated(value: unknown, today: string) {
  if (!value) return false;
  const created = new Date(String(value));
  const reference = new Date(`${today}T12:00:00.000Z`);
  if (Number.isNaN(created.getTime()) || Number.isNaN(reference.getTime())) return false;
  return reference.getTime() - created.getTime() <= 30 * 24 * 60 * 60 * 1000;
}

function clampDateOnOrAfter(value: string, minimum: string) {
  return value >= minimum ? value : minimum;
}

export function buildScheduleGapActivityPlanMatches(input: {
  targetDate: string;
  targetTssDelta: number | null | undefined;
  primaryCategory: string | null | undefined;
  plans: ActivityPlanLike[];
  today: string;
  limit?: number;
}): ScheduleGapActivityPlanMatches {
  const targetTssDelta = Number(input.targetTssDelta);
  if (!Number.isFinite(targetTssDelta) || targetTssDelta <= 0) {
    return {
      target_date: input.targetDate,
      target_tss_delta: 0,
      matches: [],
      empty_reason: "no_positive_gap",
    };
  }

  if (input.plans.length === 0) {
    return {
      target_date: input.targetDate,
      target_tss_delta: Math.round(targetTssDelta * 10) / 10,
      matches: [],
      empty_reason: "no_activity_plans",
    };
  }

  const target = Math.round(targetTssDelta * 10) / 10;
  const primaryCategory = input.primaryCategory ? String(input.primaryCategory) : null;
  let hasEstimatedTss = false;
  const matches = input.plans
    .map<ScheduleGapActivityPlanMatch | null>((plan) => {
      const metrics = getAuthoritativeActivityPlanMetrics(plan);
      const estimatedTss = readFinitePlanNumber(metrics.estimated_tss);
      if (estimatedTss === null) return null;
      hasEstimatedTss = true;

      const estimatedDurationSeconds =
        metrics.estimated_duration !== undefined
          ? readFinitePlanNumber(metrics.estimated_duration)
          : readFinitePlanNumber(plan.estimated_duration_seconds);
      const activityCategory =
        typeof plan.activity_category === "string" && plan.activity_category.trim().length > 0
          ? plan.activity_category
          : null;
      if (primaryCategory && activityCategory && activityCategory !== primaryCategory) {
        return null;
      }
      const absoluteTssGap = Math.round(Math.abs(estimatedTss - target) * 10) / 10;
      if (absoluteTssGap > Math.max(30, target * 0.5)) {
        return null;
      }
      const reasonCodes: ScheduleGapActivityPlanMatchReasonCode[] = ["owned_plan"];
      if (absoluteTssGap <= Math.max(10, target * 0.2)) reasonCodes.push("near_target_tss");
      if (primaryCategory && activityCategory === primaryCategory)
        reasonCodes.push("same_activity_category");
      if (estimatedDurationSeconds !== null) reasonCodes.push("reasonable_duration");
      if (isRecentlyCreated(plan.created_at, input.today)) reasonCodes.push("recently_created");

      const sameCategoryBonus = primaryCategory && activityCategory === primaryCategory ? 10 : 0;
      const ownedPlanBonus = 5;
      const durationAvailabilityBonus = estimatedDurationSeconds !== null ? 2 : 0;
      const score =
        Math.round(
          (100 -
            Math.min(60, absoluteTssGap) +
            sameCategoryBonus +
            ownedPlanBonus +
            durationAvailabilityBonus) *
            10,
        ) / 10;

      return {
        activity_plan_id: String(plan.id),
        name: String(plan.name ?? "Activity plan"),
        activity_category: activityCategory,
        estimated_tss: estimatedTss,
        estimated_duration_seconds: estimatedDurationSeconds,
        score,
        target_tss_delta: target,
        absolute_tss_gap: absoluteTssGap,
        reason_codes: reasonCodes,
      };
    })
    .filter((match): match is ScheduleGapActivityPlanMatch => match !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if ((left.absolute_tss_gap ?? Infinity) !== (right.absolute_tss_gap ?? Infinity)) {
        return (left.absolute_tss_gap ?? Infinity) - (right.absolute_tss_gap ?? Infinity);
      }
      if ((right.estimated_tss ?? 0) !== (left.estimated_tss ?? 0)) {
        return (right.estimated_tss ?? 0) - (left.estimated_tss ?? 0);
      }
      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) return nameCompare;
      return left.activity_plan_id.localeCompare(right.activity_plan_id);
    })
    .slice(0, input.limit ?? 5);

  return {
    target_date: input.targetDate,
    target_tss_delta: target,
    matches,
    empty_reason:
      matches.length > 0 ? null : hasEstimatedTss ? "low_confidence" : "no_estimated_tss",
  };
}

export function resolveScheduleGapActivityPlanMatchTarget(input: {
  today: string;
  scheduleRecommendation: ScheduleGapRecommendation | null;
  loadComparison: ScheduleGapLoadComparison | null;
}) {
  if (
    input.scheduleRecommendation?.type === "add_load" &&
    typeof input.scheduleRecommendation.target_load_delta === "number" &&
    input.scheduleRecommendation.target_load_delta > 0
  ) {
    return {
      targetDate: clampDateOnOrAfter(input.scheduleRecommendation.target_date, input.today),
      targetTssDelta: input.scheduleRecommendation.target_load_delta,
    };
  }

  const gapWeek = input.loadComparison?.weeks.find((week) => {
    if (week.week_end < input.today) return false;
    const recommended = week.recommended_load ?? 0;
    const scheduled = week.scheduled_load ?? 0;
    return recommended - scheduled > 15;
  });

  if (!gapWeek) {
    return {
      targetDate: input.scheduleRecommendation?.target_date ?? input.today,
      targetTssDelta: null,
    };
  }

  return {
    targetDate: clampDateOnOrAfter(
      input.scheduleRecommendation?.target_date &&
        input.scheduleRecommendation.target_date >= gapWeek.week_start
        ? input.scheduleRecommendation.target_date
        : gapWeek.week_start,
      input.today,
    ),
    targetTssDelta:
      Math.round(((gapWeek.recommended_load ?? 0) - (gapWeek.scheduled_load ?? 0)) * 10) / 10,
  };
}

export async function loadOwnedActivityPlansForScheduleGap(input: {
  db?: ScheduleGapDbClient;
  supabase?: LegacyPlanningReader;
  profileId: string;
  limit?: number;
}) {
  const limit = input.limit ?? 25;
  if (input.db) {
    const result = await input.db.execute(sql<any>`
      select activity_plans.*
      from activity_plans
      where activity_plans.profile_id = ${input.profileId}::uuid
      order by activity_plans.created_at desc, activity_plans.id asc
      limit ${limit}
    `);
    return getSqlRows<ActivityPlanLike>(result);
  }

  if (!input.supabase) return [];
  const { data } = await input.supabase
    .from("activity_plans")
    .select("*")
    .eq("profile_id", input.profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ActivityPlanLike[];
}
