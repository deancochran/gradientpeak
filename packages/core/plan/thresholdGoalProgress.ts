import { z } from "zod";
import {
  thresholdActivityCategorySchema,
  thresholdMetricSchema,
  thresholdUnitSchema,
} from "../performance-calibration";
import { canonicalGoalSchema, type ProfileGoal } from "../schemas/goals/profile_goals";

const instantSchema = z.string().datetime({ offset: true });
const opaqueIdSchema = z.string().trim().min(1).max(256);
const DAY_SECONDS = 86_400;
const WATCH_RATE_RATIO = 0.75;

const thresholdGoalObservationBaseSchema = z
  .object({
    thresholdId: opaqueIdSchema,
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    value: z.number().finite().positive(),
    confidence: z.number().finite().min(0).max(1),
    effectiveAt: instantSchema,
    sourceActivityIds: z.array(opaqueIdSchema).min(1).max(8),
  })
  .strict()
  .superRefine((observation, context) => {
    const expected =
      observation.activityCategory === "bike"
        ? { metric: "power", unit: "watts" }
        : { metric: "speed", unit: "meters_per_second" };
    if (observation.metric !== expected.metric || observation.unit !== expected.unit) {
      context.addIssue({
        code: "custom",
        path: ["metric"],
        message: "Threshold observation identity must match its activity category",
      });
    }
  });

export const thresholdGoalObservationSchema = thresholdGoalObservationBaseSchema;
export const currentThresholdGoalObservationSchema = thresholdGoalObservationBaseSchema.safeExtend({
  freshness: z.enum(["fresh", "stale"]),
});

export const thresholdGoalProgressInputSchema = z
  .object({
    goal: canonicalGoalSchema,
    goalCreatedAt: instantSchema,
    assessedAt: instantSchema,
    deadlineAt: instantSchema,
    currentThreshold: currentThresholdGoalObservationSchema.nullable(),
    thresholdHistory: z.array(thresholdGoalObservationSchema).max(100),
    thresholdHistoryComplete: z.boolean().default(true),
  })
  .strict();

export const unsupportedThresholdGoalReasonSchema = z.enum([
  "heart_rate_goal",
  "non_threshold_goal",
  "category_metric_mismatch",
]);

export const thresholdGoalProgressStatusSchema = z.enum([
  "achieved",
  "on_track",
  "watch",
  "action_needed",
  "insufficient",
]);

export const thresholdGoalProgressReasonSchema = z.enum([
  "target_met",
  "observed_rate_meets_required_rate",
  "observed_rate_near_required_rate",
  "observed_rate_below_required_rate",
  "target_no_longer_met",
  "deadline_passed",
  "current_threshold_unavailable",
  "current_threshold_stale",
  "baseline_threshold_unavailable",
  "insufficient_distinct_observations",
  "invalid_goal_timeline",
  "invalid_evidence_timeline",
]);

const supportedThresholdGoalTargetSchema = z
  .object({
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    targetValue: z.number().finite().positive(),
    achievementValue: z.number().finite().nonnegative(),
  })
  .strict();

const thresholdGoalProgressMetricsSchema = z
  .object({
    targetGap: z.number().finite().nullable(),
    remainingGap: z.number().finite().nonnegative().nullable(),
    changeFromBaseline: z.number().finite().nullable(),
    progressRatio: z.number().finite().min(0).max(1).nullable(),
    progressPercent: z.number().finite().min(0).max(100).nullable(),
    observedRatePerDay: z.number().finite().nullable(),
    requiredRatePerDay: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const thresholdGoalProgressEvidenceSummarySchema = z
  .object({
    observationCount: z.number().int().nonnegative().max(101),
    observedSpanDays: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const supportedThresholdGoalProgressSchema = z
  .object({
    status: thresholdGoalProgressStatusSchema,
    reason: thresholdGoalProgressReasonSchema,
    goalId: opaqueIdSchema,
    assessedAt: instantSchema,
    deadlineAt: instantSchema,
    target: supportedThresholdGoalTargetSchema,
    baseline: thresholdGoalObservationSchema.nullable(),
    current: currentThresholdGoalObservationSchema.nullable(),
    metrics: thresholdGoalProgressMetricsSchema,
    evidence: thresholdGoalProgressEvidenceSummarySchema,
  })
  .strict()
  .superRefine((result, context) => {
    const reasonMatchesStatus = (() => {
      switch (result.status) {
        case "achieved":
          return result.reason === "target_met";
        case "on_track":
          return result.reason === "observed_rate_meets_required_rate";
        case "watch":
          return result.reason === "observed_rate_near_required_rate";
        case "action_needed":
          return (
            result.reason === "observed_rate_below_required_rate" ||
            result.reason === "target_no_longer_met" ||
            result.reason === "deadline_passed"
          );
        case "insufficient":
          return (
            result.reason === "current_threshold_unavailable" ||
            result.reason === "current_threshold_stale" ||
            result.reason === "baseline_threshold_unavailable" ||
            result.reason === "insufficient_distinct_observations" ||
            result.reason === "invalid_goal_timeline" ||
            result.reason === "invalid_evidence_timeline"
          );
      }
    })();
    if (!reasonMatchesStatus) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Threshold goal progress reason must match its status",
      });
    }
  });

const unsupportedThresholdGoalProgressSchema = z
  .object({
    status: z.literal("unsupported"),
    reason: unsupportedThresholdGoalReasonSchema,
    goalId: opaqueIdSchema,
  })
  .strict();

export const thresholdGoalProgressResultSchema = z.union([
  unsupportedThresholdGoalProgressSchema,
  supportedThresholdGoalProgressSchema,
]);

export type ThresholdGoalProgressInput = z.input<typeof thresholdGoalProgressInputSchema>;
export type ThresholdGoalObservation = z.infer<typeof thresholdGoalObservationSchema>;
export type CurrentThresholdGoalObservation = z.infer<typeof currentThresholdGoalObservationSchema>;
export type ThresholdGoalProgressResult = z.infer<typeof thresholdGoalProgressResultSchema>;

type SupportedThresholdGoalIdentity = {
  status: "supported";
  activityCategory: "bike" | "run" | "swim";
  metric: "power" | "speed";
  unit: "watts" | "meters_per_second";
  targetValue: number;
  achievementValue: number;
};

export type ThresholdGoalSupport =
  | SupportedThresholdGoalIdentity
  | {
      status: "unsupported";
      reason: z.infer<typeof unsupportedThresholdGoalReasonSchema>;
      goalId: string;
    };

/**
 * Maps canonical threshold goals to canonical threshold facts. A canonical pace
 * goal value is speed in meters per second (goal authoring converts pace input
 * before persistence), so both run and swim compare higher-is-better speed.
 */
export function resolveThresholdGoalSupport(goalInput: ProfileGoal): ThresholdGoalSupport {
  const goal = canonicalGoalSchema.parse(goalInput);
  if (goal.objective.type !== "threshold") {
    return { status: "unsupported", reason: "non_threshold_goal", goalId: goal.id };
  }
  if (goal.objective.metric === "hr") {
    return { status: "unsupported", reason: "heart_rate_goal", goalId: goal.id };
  }

  const supported =
    (goal.activity_category === "bike" && goal.objective.metric === "power") ||
    ((goal.activity_category === "run" || goal.activity_category === "swim") &&
      goal.objective.metric === "pace");
  if (!supported) {
    return {
      status: "unsupported",
      reason: "category_metric_mismatch",
      goalId: goal.id,
    };
  }

  const activityCategory = goal.activity_category;
  if (activityCategory !== "bike" && activityCategory !== "run" && activityCategory !== "swim") {
    return {
      status: "unsupported",
      reason: "category_metric_mismatch",
      goalId: goal.id,
    };
  }
  const metric = goal.objective.metric === "power" ? "power" : "speed";
  const unit = metric === "power" ? "watts" : "meters_per_second";
  const tolerance = goal.objective.tolerance_pct ?? 0;
  return {
    status: "supported",
    activityCategory,
    metric,
    unit,
    targetValue: goal.objective.value,
    achievementValue: goal.objective.value * (1 - tolerance),
  };
}

function toMilliseconds(instant: string): number {
  return Date.parse(instant);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function elapsedDays(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / (DAY_SECONDS * 1_000);
}

function selectBaseline(
  observations: readonly ThresholdGoalObservation[],
  goalCreatedAtMs: number,
  historyComplete: boolean,
): ThresholdGoalObservation | null {
  const ordered = [...observations].sort(
    (left, right) => toMilliseconds(left.effectiveAt) - toMilliseconds(right.effectiveAt),
  );
  const atOrBefore = ordered.filter(
    (observation) => toMilliseconds(observation.effectiveAt) <= goalCreatedAtMs,
  );
  return atOrBefore.at(-1) ?? (historyComplete ? (ordered[0] ?? null) : null);
}

function emptyMetrics() {
  return {
    targetGap: null,
    remainingGap: null,
    changeFromBaseline: null,
    progressRatio: null,
    progressPercent: null,
    observedRatePerDay: null,
    requiredRatePerDay: null,
  };
}

/**
 * Evaluates observed threshold progress only. The rates are historical and
 * required arithmetic rates; this function does not predict a future threshold
 * or a date on which the athlete will reach the goal.
 */
export function evaluateThresholdGoalProgress(
  inputValue: ThresholdGoalProgressInput,
): ThresholdGoalProgressResult {
  const input = thresholdGoalProgressInputSchema.parse(inputValue);
  const support = resolveThresholdGoalSupport(input.goal);
  if (support.status === "unsupported") {
    return thresholdGoalProgressResultSchema.parse(support);
  }

  const assessedAtMs = toMilliseconds(input.assessedAt);
  const deadlineAtMs = toMilliseconds(input.deadlineAt);
  const goalCreatedAtMs = toMilliseconds(input.goalCreatedAt);
  const matchesIdentity = (observation: ThresholdGoalObservation) =>
    observation.activityCategory === support.activityCategory &&
    observation.metric === support.metric &&
    observation.unit === support.unit &&
    toMilliseconds(observation.effectiveAt) <= assessedAtMs;
  const matchingHistory = input.thresholdHistory.filter(matchesIdentity);
  const current =
    input.currentThreshold && matchesIdentity(input.currentThreshold)
      ? input.currentThreshold
      : null;
  const baseline = selectBaseline(matchingHistory, goalCreatedAtMs, input.thresholdHistoryComplete);
  const observationIds = new Set(matchingHistory.map(({ thresholdId }) => thresholdId));
  if (current) observationIds.add(current.thresholdId);
  const target = {
    activityCategory: support.activityCategory,
    metric: support.metric,
    unit: support.unit,
    targetValue: round(support.targetValue),
    achievementValue: round(support.achievementValue),
  };
  const evidenceSummary = (observedSpanDays: number | null) => ({
    observationCount: observationIds.size,
    observedSpanDays: observedSpanDays === null ? null : round(Math.max(0, observedSpanDays)),
  });
  const result = (
    status: z.infer<typeof thresholdGoalProgressStatusSchema>,
    reason: z.infer<typeof thresholdGoalProgressReasonSchema>,
    metrics: z.infer<typeof thresholdGoalProgressMetricsSchema>,
    observedSpanDays: number | null,
  ) =>
    thresholdGoalProgressResultSchema.parse({
      status,
      reason,
      goalId: input.goal.id,
      assessedAt: input.assessedAt,
      deadlineAt: input.deadlineAt,
      target,
      baseline,
      current,
      metrics,
      evidence: evidenceSummary(observedSpanDays),
    });

  if (deadlineAtMs < goalCreatedAtMs) {
    return result("insufficient", "invalid_goal_timeline", emptyMetrics(), null);
  }
  if (!current) {
    return result("insufficient", "current_threshold_unavailable", emptyMetrics(), null);
  }

  const targetGap = round(support.targetValue - current.value);
  const remainingGap = round(Math.max(0, support.achievementValue - current.value));
  const currentOnlyMetrics = {
    ...emptyMetrics(),
    targetGap,
    remainingGap,
  };
  if (current.freshness === "stale") {
    return result("insufficient", "current_threshold_stale", currentOnlyMetrics, null);
  }
  if (current.value >= support.achievementValue) {
    const changeFromBaseline = baseline ? round(current.value - baseline.value) : null;
    const initialGap = baseline ? support.achievementValue - baseline.value : null;
    const progressRatio =
      initialGap !== null && initialGap > 0 && changeFromBaseline !== null
        ? round(Math.min(1, Math.max(0, changeFromBaseline / initialGap)))
        : null;
    return result(
      "achieved",
      "target_met",
      {
        ...currentOnlyMetrics,
        changeFromBaseline,
        progressRatio,
        progressPercent: progressRatio === null ? null : round(progressRatio * 100),
      },
      baseline
        ? elapsedDays(toMilliseconds(baseline.effectiveAt), toMilliseconds(current.effectiveAt))
        : null,
    );
  }
  if (assessedAtMs > deadlineAtMs) {
    return result("action_needed", "deadline_passed", currentOnlyMetrics, null);
  }
  if (!baseline) {
    return result("insufficient", "baseline_threshold_unavailable", currentOnlyMetrics, null);
  }
  if (baseline.thresholdId === current.thresholdId || observationIds.size < 2) {
    return result("insufficient", "insufficient_distinct_observations", currentOnlyMetrics, 0);
  }

  const rateStartMs = Math.max(goalCreatedAtMs, toMilliseconds(baseline.effectiveAt));
  const currentEffectiveAtMs = toMilliseconds(current.effectiveAt);
  const observedSpanDays = elapsedDays(rateStartMs, currentEffectiveAtMs);
  const goalSpanDays = elapsedDays(rateStartMs, deadlineAtMs);
  if (observedSpanDays <= 0 || goalSpanDays <= 0 || currentEffectiveAtMs > assessedAtMs) {
    return result(
      "insufficient",
      "invalid_evidence_timeline",
      currentOnlyMetrics,
      Math.max(0, observedSpanDays),
    );
  }

  const changeFromBaseline = current.value - baseline.value;
  const initialGap = support.achievementValue - baseline.value;
  if (initialGap <= 0) {
    return result(
      "action_needed",
      "target_no_longer_met",
      {
        ...currentOnlyMetrics,
        changeFromBaseline: round(changeFromBaseline),
        observedRatePerDay: round(changeFromBaseline / observedSpanDays),
        requiredRatePerDay: 0,
      },
      observedSpanDays,
    );
  }

  const progressRatio = Math.min(1, Math.max(0, changeFromBaseline / initialGap));
  const observedRatePerDay = changeFromBaseline / observedSpanDays;
  const requiredRatePerDay = initialGap / goalSpanDays;
  const metrics = {
    targetGap,
    remainingGap,
    changeFromBaseline: round(changeFromBaseline),
    progressRatio: round(progressRatio),
    progressPercent: round(progressRatio * 100),
    observedRatePerDay: round(observedRatePerDay),
    requiredRatePerDay: round(requiredRatePerDay),
  };

  if (observedRatePerDay >= requiredRatePerDay) {
    return result("on_track", "observed_rate_meets_required_rate", metrics, observedSpanDays);
  }
  if (observedRatePerDay > 0 && observedRatePerDay >= requiredRatePerDay * WATCH_RATE_RATIO) {
    return result("watch", "observed_rate_near_required_rate", metrics, observedSpanDays);
  }
  return result("action_needed", "observed_rate_below_required_rate", metrics, observedSpanDays);
}
