import { describe, expect, it } from "vitest";

import {
  evaluateThresholdGoalProgress,
  type ThresholdGoalProgressInput,
} from "../thresholdGoalProgress";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const ASSESSED_AT = "2026-02-20T00:00:00.000Z";
const DEADLINE_AT = "2026-04-11T23:59:59.999Z";

function goal(
  objective: Record<string, unknown> = {
    type: "threshold",
    metric: "power",
    activity_category: "bike",
    value: 280,
  },
  activityCategory = "bike",
) {
  return {
    id: GOAL_ID,
    profile_id: PROFILE_ID,
    target_date: "2026-04-11",
    title: "Threshold goal",
    priority: 5,
    activity_category: activityCategory,
    objective,
  } as ThresholdGoalProgressInput["goal"];
}

function observation(
  thresholdId: string,
  value: number,
  effectiveAt: string,
  input: {
    activityCategory?: "bike" | "run" | "swim";
  } = {},
) {
  const activityCategory = input.activityCategory ?? "bike";
  return {
    thresholdId,
    activityCategory,
    metric: activityCategory === "bike" ? ("power" as const) : ("speed" as const),
    unit: activityCategory === "bike" ? ("watts" as const) : ("meters_per_second" as const),
    value,
    confidence: 0.9,
    effectiveAt,
    sourceActivityIds: [`activity-${thresholdId}`],
  };
}

function currentObservation(
  thresholdId: string,
  value: number,
  effectiveAt: string,
  input: {
    activityCategory?: "bike" | "run" | "swim";
    freshness?: "fresh" | "stale";
  } = {},
) {
  return {
    ...observation(thresholdId, value, effectiveAt, input),
    freshness: input.freshness ?? "fresh",
  };
}

function evaluate(
  input: Partial<ThresholdGoalProgressInput> & {
    currentValue?: number;
    currentFreshness?: "fresh" | "stale";
  } = {},
) {
  const baseline = observation("baseline", 200, "2025-12-31T00:00:00.000Z");
  const current = currentObservation("current", input.currentValue ?? 240, ASSESSED_AT, {
    freshness: input.currentFreshness ?? "fresh",
  });
  const { currentValue: _currentValue, currentFreshness: _currentFreshness, ...overrides } = input;
  return evaluateThresholdGoalProgress({
    goal: goal(),
    goalCreatedAt: CREATED_AT,
    assessedAt: ASSESSED_AT,
    deadlineAt: DEADLINE_AT,
    currentThreshold: current,
    thresholdHistory: [baseline, observation("current", input.currentValue ?? 240, ASSESSED_AT)],
    ...overrides,
  });
}

describe("threshold goal progress", () => {
  it("maps bike power goals to watts and reports observed progress without a forecast", () => {
    const result = evaluate();

    expect(result).toMatchObject({
      status: "on_track",
      reason: "observed_rate_meets_required_rate",
      target: {
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        targetValue: 280,
      },
      baseline: { thresholdId: "baseline", value: 200 },
      current: { thresholdId: "current", value: 240 },
      metrics: {
        targetGap: 40,
        remainingGap: 40,
        changeFromBaseline: 40,
        progressRatio: 0.5,
        progressPercent: 50,
      },
    });
    if (result.status === "unsupported") throw new Error("Expected supported progress");
    expect(result.metrics.observedRatePerDay).toBeCloseTo(0.8, 6);
    expect(result.metrics.requiredRatePerDay).toBeCloseTo(0.792079, 6);
    expect(result).not.toHaveProperty("forecast");
    expect(result).not.toHaveProperty("readiness");
  });

  it.each([
    ["run", 4.2, 4.0],
    ["swim", 1.45, 1.35],
  ] as const)("maps %s pace goals and facts to same-category meters per second", (category, target, current) => {
    const baseline = observation("pace-baseline", current - 0.2, "2025-12-31T00:00:00.000Z", {
      activityCategory: category,
    });
    const currentEvidence = currentObservation("pace-current", current, ASSESSED_AT, {
      activityCategory: category,
      freshness: "fresh",
    });
    const result = evaluate({
      goal: goal(
        {
          type: "threshold",
          metric: "pace",
          activity_category: category,
          value: target,
        },
        category,
      ),
      currentThreshold: currentEvidence,
      thresholdHistory: [
        baseline,
        observation("pace-current", current, ASSESSED_AT, { activityCategory: category }),
      ],
    });

    expect(result).toMatchObject({
      target: {
        activityCategory: category,
        metric: "speed",
        unit: "meters_per_second",
        targetValue: target,
      },
      current: { value: current },
    });
  });

  it("selects the latest baseline at or before goal creation instead of later evidence", () => {
    const old = observation("old", 190, "2025-11-01T00:00:00.000Z");
    const before = observation("before", 200, "2025-12-31T23:00:00.000Z");
    const after = observation("after", 210, "2026-01-02T00:00:00.000Z");
    const current = currentObservation("current", 240, ASSESSED_AT);
    const result = evaluate({
      currentThreshold: current,
      thresholdHistory: [after, old, observation("current", 240, ASSESSED_AT), before],
    });

    expect(result).toMatchObject({ baseline: { thresholdId: "before", value: 200 } });
  });

  it("falls back to the first observation after creation when no earlier baseline exists", () => {
    const first = observation("first", 210, "2026-01-02T00:00:00.000Z");
    const current = currentObservation("current", 240, ASSESSED_AT);
    const result = evaluate({
      currentThreshold: current,
      thresholdHistory: [
        observation("current", 240, ASSESSED_AT),
        observation("later", 220, "2026-01-15T00:00:00.000Z"),
        first,
      ],
    });

    expect(result).toMatchObject({ baseline: { thresholdId: "first", value: 210 } });
  });

  it("does not invent a post-creation baseline when older history is truncated", () => {
    const current = currentObservation("current", 240, ASSESSED_AT);
    const result = evaluate({
      currentThreshold: current,
      thresholdHistory: [
        observation("current", 240, ASSESSED_AT),
        observation("later", 220, "2026-01-15T00:00:00.000Z"),
      ],
      thresholdHistoryComplete: false,
    });

    expect(result).toMatchObject({
      status: "insufficient",
      reason: "baseline_threshold_unavailable",
      baseline: null,
    });
  });

  it.each([
    [280, "achieved", "target_met"],
    [240, "on_track", "observed_rate_meets_required_rate"],
    [230, "watch", "observed_rate_near_required_rate"],
    [220, "action_needed", "observed_rate_below_required_rate"],
  ] as const)("classifies %s watts as %s from observed and required rates", (value, status, reason) => {
    expect(evaluate({ currentValue: value })).toMatchObject({ status, reason });
  });

  it("returns insufficient for stale current evidence", () => {
    expect(evaluate({ currentFreshness: "stale" })).toMatchObject({
      status: "insufficient",
      reason: "current_threshold_stale",
    });
  });

  it("returns insufficient when there are not two distinct observations", () => {
    const only = currentObservation("only", 240, ASSESSED_AT);
    expect(
      evaluate({
        currentThreshold: only,
        thresholdHistory: [observation("only", 240, ASSESSED_AT)],
      }),
    ).toMatchObject({
      status: "insufficient",
      reason: "insufficient_distinct_observations",
      evidence: { observationCount: 1 },
    });
  });

  it("returns action needed after a passed deadline without inventing a projection", () => {
    const result = evaluate({
      assessedAt: "2026-05-01T00:00:00.000Z",
      currentThreshold: currentObservation("current", 240, "2026-04-20T00:00:00.000Z", {
        freshness: "fresh",
      }),
    });

    expect(result).toMatchObject({ status: "action_needed", reason: "deadline_passed" });
    expect(result).not.toHaveProperty("forecast");
  });

  it("returns explicit unsupported results for HR and non-threshold goals", () => {
    expect(
      evaluate({
        goal: goal({
          type: "threshold",
          metric: "hr",
          activity_category: "bike",
          value: 170,
        }),
      }),
    ).toEqual({ status: "unsupported", reason: "heart_rate_goal", goalId: GOAL_ID });
    expect(
      evaluate({
        goal: goal({ type: "consistency", target_sessions_per_week: 4 }, "run"),
      }),
    ).toEqual({ status: "unsupported", reason: "non_threshold_goal", goalId: GOAL_ID });
  });

  it.each([
    ["bike", "pace"],
    ["run", "power"],
    ["swim", "power"],
  ] as const)("rejects the %s/%s category and metric mismatch explicitly", (category, metric) => {
    expect(
      evaluate({
        goal: goal(
          { type: "threshold", metric, activity_category: category, value: 250 },
          category,
        ),
      }),
    ).toEqual({
      status: "unsupported",
      reason: "category_metric_mismatch",
      goalId: GOAL_ID,
    });
  });
});
