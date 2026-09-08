import { evaluateThresholdGoalProgress } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  goalPortfolioResponseSchema,
  goalProgressRequestSchema,
  goalProgressResponseSchema,
} from "./goal-progress";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const BASELINE_THRESHOLD_ID = "44444444-4444-4444-8444-444444444444";
const CURRENT_THRESHOLD_ID = "55555555-5555-4555-8555-555555555555";
const EFFECTIVE_AT = "2026-02-01T00:00:00.000Z";

function provenance(thresholdId: string, value: number, effectiveAt = EFFECTIVE_AT) {
  return {
    thresholdId,
    activityCategory: "bike" as const,
    metric: "power" as const,
    unit: "watts" as const,
    method: "bike_power_30m" as const,
    value,
    confidence: 0.9,
    effectiveAt,
    policyVersion: "threshold-policy-v1",
    sourceActivities: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Threshold ride",
        finishedAt: effectiveAt,
      },
    ],
  };
}

function supportedResult() {
  const baseline = {
    thresholdId: BASELINE_THRESHOLD_ID,
    activityCategory: "bike" as const,
    metric: "power" as const,
    unit: "watts" as const,
    value: 200,
    confidence: 0.9,
    effectiveAt: "2025-12-31T00:00:00.000Z",
    sourceActivityIds: ["33333333-3333-4333-8333-333333333333"],
  };
  const current = {
    ...baseline,
    thresholdId: CURRENT_THRESHOLD_ID,
    value: 240,
    effectiveAt: EFFECTIVE_AT,
    freshness: "fresh" as const,
  };
  const { freshness: _freshness, ...currentHistory } = current;
  return evaluateThresholdGoalProgress({
    goal: {
      id: GOAL_ID,
      profile_id: PROFILE_ID,
      target_date: "2026-04-11",
      title: "280 W",
      priority: 5,
      activity_category: "bike",
      objective: {
        type: "threshold",
        metric: "power",
        activity_category: "bike",
        value: 280,
      },
    },
    goalCreatedAt: "2026-01-01T00:00:00.000Z",
    assessedAt: EFFECTIVE_AT,
    deadlineAt: "2026-04-11T23:59:59.999Z",
    currentThreshold: current,
    thresholdHistory: [baseline, currentHistory],
  });
}

describe("goal progress contracts", () => {
  it("keeps the portfolio summary compact and rejects an impossible selected expired state", () => {
    expect(
      goalPortfolioResponseSchema.parse({
        activeGoalCount: 1,
        computedAt: EFFECTIVE_AT,
        freshness: "fresh",
        planningDate: "2026-02-20",
        publishedRevision: 7,
        selectedGoal: {
          activityCategory: "bike",
          id: GOAL_ID,
          priority: 5,
          targetDate: "2026-04-11",
          title: "Raise FTP",
        },
        totalGoalCount: 2,
      }),
    ).toMatchObject({ activeGoalCount: 1, selectedGoal: { id: GOAL_ID } });
    expect(
      goalPortfolioResponseSchema.safeParse({
        activeGoalCount: 0,
        computedAt: EFFECTIVE_AT,
        freshness: "fresh",
        planningDate: "2026-02-20",
        publishedRevision: 7,
        selectedGoal: {
          activityCategory: "bike",
          id: GOAL_ID,
          priority: 5,
          targetDate: "2026-04-11",
          title: "Raise FTP",
        },
        totalGoalCount: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts only a strict goal identifier request", () => {
    expect(goalProgressRequestSchema.parse({ goalId: GOAL_ID })).toEqual({ goalId: GOAL_ID });
    expect(
      goalProgressRequestSchema.safeParse({ goalId: GOAL_ID, profileId: PROFILE_ID }).success,
    ).toBe(false);
  });

  it("retains threshold DTO source-activity provenance for supported progress", () => {
    const result = supportedResult();
    const parsed = goalProgressResponseSchema.parse({
      result,
      provenance: {
        baseline: provenance(BASELINE_THRESHOLD_ID, 200, "2025-12-31T00:00:00.000Z"),
        current: provenance(CURRENT_THRESHOLD_ID, 240),
      },
      publication: { computedAt: EFFECTIVE_AT, status: "available", publishedRevision: 7 },
    });

    expect(parsed.provenance?.current?.sourceActivities).toEqual([
      expect.objectContaining({ name: "Threshold ride", finishedAt: EFFECTIVE_AT }),
    ]);
    expect(parsed.result).not.toHaveProperty("forecast");
    expect(parsed.result).not.toHaveProperty("readiness");
  });

  it("allows explicit unsupported results without fabricated threshold metadata", () => {
    expect(
      goalProgressResponseSchema.parse({
        result: { status: "unsupported", reason: "heart_rate_goal", goalId: GOAL_ID },
        provenance: null,
        publication: null,
      }),
    ).toEqual({
      result: { status: "unsupported", reason: "heart_rate_goal", goalId: GOAL_ID },
      provenance: null,
      publication: null,
    });
  });

  it("rejects extra fields and mismatched provenance identities", () => {
    const result = supportedResult();
    expect(
      goalProgressResponseSchema.safeParse({
        result,
        provenance: {
          baseline: provenance("wrong-threshold", 200),
          current: provenance(CURRENT_THRESHOLD_ID, 240),
        },
        publication: { computedAt: EFFECTIVE_AT, status: "available", publishedRevision: 7 },
      }).success,
    ).toBe(false);
    expect(
      goalProgressResponseSchema.safeParse({
        result: { status: "unsupported", reason: "non_threshold_goal", goalId: GOAL_ID },
        provenance: null,
        publication: null,
        forecast: {},
      }).success,
    ).toBe(false);
  });
});
