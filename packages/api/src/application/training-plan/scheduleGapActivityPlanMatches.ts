import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import type { ActivityPlanPrescriptionQuantificationBundle } from "@repo/core/activity-quantification";
import type { CommonLoadAggregate, CommonLoadResult } from "@repo/core/load";
import {
  type CanonicalActivityCategory,
  canonicalActivityCategorySchema,
} from "@repo/core/schemas/activity-category";
import { activityPlans } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { asc, desc, eq } from "drizzle-orm";

type ScheduleGapDbClient = Pick<DrizzleDbClient, "select">;

type ActivityPlanLike = {
  prescriptionQuantification?: ActivityPlanPrescriptionQuantificationBundle;
  id?: unknown;
  name?: unknown;
  structure?: unknown;
  created_at?: unknown;
};

export type ScheduleGapActivityPlanMatchReasonCode =
  | "near_target_load"
  | "same_activity_category"
  | "reasonable_duration"
  | "owned_plan"
  | "recently_created";

export type ScheduleGapActivityPlanMatch = {
  activity_plan_id: string;
  name: string;
  activity_category: CanonicalActivityCategory;
  common_load: CommonLoadResult | CommonLoadAggregate;
  estimated_duration_seconds: number | null;
  score: number;
  target_load_delta: number;
  absolute_load_gap: number | null;
  reason_codes: ScheduleGapActivityPlanMatchReasonCode[];
};

export type ScheduleGapActivityPlanMatches = {
  target_date: string;
  target_load_delta: number;
  matches: ScheduleGapActivityPlanMatch[];
  empty_reason:
    | "no_positive_gap"
    | "no_activity_plans"
    | "no_available_common_load"
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

function readCanonicalPlanActivityCategory(
  plan: ActivityPlanLike,
): CanonicalActivityCategory | null {
  const parsed = activityPlanStructureSchema.safeParse(plan.structure);
  if (!parsed.success) return null;
  return parsed.data.activity_category;
}

export function buildScheduleGapActivityPlanMatches(input: {
  targetDate: string;
  targetLoadDelta: number | null | undefined;
  primaryActivityCategory: string | null | undefined;
  plans: ActivityPlanLike[];
  today: string;
  limit?: number;
}): ScheduleGapActivityPlanMatches {
  const targetLoadDelta = Number(input.targetLoadDelta);
  if (!Number.isFinite(targetLoadDelta) || targetLoadDelta <= 0) {
    return {
      target_date: input.targetDate,
      target_load_delta: 0,
      matches: [],
      empty_reason: "no_positive_gap",
    };
  }

  if (input.plans.length === 0) {
    return {
      target_date: input.targetDate,
      target_load_delta: Math.round(targetLoadDelta * 10) / 10,
      matches: [],
      empty_reason: "no_activity_plans",
    };
  }

  const target = Math.round(targetLoadDelta * 10) / 10;
  const primaryActivityCategoryResult = canonicalActivityCategorySchema.safeParse(
    input.primaryActivityCategory,
  );
  const primaryActivityCategory = primaryActivityCategoryResult.success
    ? primaryActivityCategoryResult.data
    : null;
  let hasAvailableCommonLoad = false;
  const matches = input.plans
    .map<ScheduleGapActivityPlanMatch | null>((plan) => {
      const activity_category = readCanonicalPlanActivityCategory(plan);
      if (!activity_category) return null;
      const commonLoad = plan.prescriptionQuantification?.summary.commonLoad;
      if (commonLoad?.status !== "complete") return null;
      const load = readFinitePlanNumber(commonLoad.load);
      if (load === null) return null;
      hasAvailableCommonLoad = true;
      const elapsed = plan.prescriptionQuantification?.summary.duration.elapsed;
      const estimatedDurationSeconds =
        elapsed?.status === "complete" ? readFinitePlanNumber(elapsed.value) : null;
      if (primaryActivityCategory && activity_category !== primaryActivityCategory) {
        return null;
      }
      const absoluteLoadGap = Math.round(Math.abs(load - target) * 10) / 10;
      if (absoluteLoadGap > Math.max(30, target * 0.5)) {
        return null;
      }
      const reasonCodes: ScheduleGapActivityPlanMatchReasonCode[] = ["owned_plan"];
      if (absoluteLoadGap <= Math.max(10, target * 0.2)) reasonCodes.push("near_target_load");
      if (primaryActivityCategory && activity_category === primaryActivityCategory)
        reasonCodes.push("same_activity_category");
      if (estimatedDurationSeconds !== null) reasonCodes.push("reasonable_duration");
      if (isRecentlyCreated(plan.created_at, input.today)) reasonCodes.push("recently_created");

      const sameActivityCategoryBonus =
        primaryActivityCategory && activity_category === primaryActivityCategory ? 10 : 0;
      const ownedPlanBonus = 5;
      const durationAvailabilityBonus = estimatedDurationSeconds !== null ? 2 : 0;
      const score =
        Math.round(
          (100 -
            Math.min(60, absoluteLoadGap) +
            sameActivityCategoryBonus +
            ownedPlanBonus +
            durationAvailabilityBonus) *
            10,
        ) / 10;

      return {
        activity_plan_id: String(plan.id),
        name: String(plan.name ?? "Activity plan"),
        activity_category,
        common_load: commonLoad,
        estimated_duration_seconds: estimatedDurationSeconds,
        score,
        target_load_delta: target,
        absolute_load_gap: absoluteLoadGap,
        reason_codes: reasonCodes,
      };
    })
    .filter((match): match is ScheduleGapActivityPlanMatch => match !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if ((left.absolute_load_gap ?? Infinity) !== (right.absolute_load_gap ?? Infinity)) {
        return (left.absolute_load_gap ?? Infinity) - (right.absolute_load_gap ?? Infinity);
      }
      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) return nameCompare;
      return left.activity_plan_id.localeCompare(right.activity_plan_id);
    })
    .slice(0, input.limit ?? 5);

  return {
    target_date: input.targetDate,
    target_load_delta: target,
    matches,
    empty_reason:
      matches.length > 0
        ? null
        : hasAvailableCommonLoad
          ? "low_confidence"
          : "no_available_common_load",
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
      targetLoadDelta: input.scheduleRecommendation.target_load_delta,
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
      targetLoadDelta: null,
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
    targetLoadDelta:
      gapWeek.recommended_load === null || gapWeek.scheduled_load === null
        ? null
        : Math.round((gapWeek.recommended_load - gapWeek.scheduled_load) * 10) / 10,
  };
}

export async function loadOwnedActivityPlansForScheduleGap(input: {
  db: ScheduleGapDbClient;
  profileId: string;
  limit?: number;
}) {
  const limit = input.limit ?? 25;
  return input.db
    .select({
      created_at: activityPlans.created_at,
      id: activityPlans.id,
      name: activityPlans.name,
      structure: activityPlans.structure,
    })
    .from(activityPlans)
    .where(eq(activityPlans.profile_id, input.profileId))
    .orderBy(desc(activityPlans.created_at), asc(activityPlans.id))
    .limit(limit);
}
