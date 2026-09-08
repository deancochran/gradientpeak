import { materializeAthletePerformanceTargetFacts } from "@repo/core";
import { describe, expect, it, vi } from "vitest";

import type { PublishedThresholdHistoryItem } from "../../repositories/threshold-overview-repository";
import {
  type GoalPortfolioReadDependencies,
  GoalProgressNotFoundError,
  type GoalProgressReadDependencies,
  readGoalPortfolio,
  readGoalProgress,
} from "./read-goal-progress";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const BASELINE_THRESHOLD_ID = "44444444-4444-4444-8444-444444444444";
const CURRENT_THRESHOLD_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-02-20T00:00:00.000Z");

function goalRow(
  targetPayload: Record<string, unknown> = {
    type: "threshold",
    metric: "power",
    activity_category: "bike",
    value: 280,
  },
) {
  return {
    id: GOAL_ID,
    profile_id: PROFILE_ID,
    target_date: "2026-04-11",
    title: "Raise FTP",
    priority: 5,
    activity_category: "bike",
    target_payload: targetPayload,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function historyItem(
  thresholdId: string,
  value: number,
  effectiveAt: string,
): PublishedThresholdHistoryItem {
  return {
    thresholdId,
    activityCategory: "bike",
    metric: "power",
    unit: "watts",
    method: "bike_power_30m",
    value,
    confidence: 0.9,
    effectiveAt: new Date(effectiveAt),
    createdAt: new Date(effectiveAt),
    policyVersion: "threshold-policy-v1",
    sourceActivities: [
      {
        id: SOURCE_ACTIVITY_ID,
        name: `${value} W threshold ride`,
        finishedAt: new Date(effectiveAt),
      },
    ],
  };
}

function dependencies(row: unknown | null = goalRow()): GoalProgressReadDependencies & {
  readOwnedGoal: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readThresholdHistory: ReturnType<typeof vi.fn>;
} {
  const baseline = historyItem(BASELINE_THRESHOLD_ID, 200, "2025-12-31T00:00:00.000Z");
  const current = historyItem(CURRENT_THRESHOLD_ID, 240, "2026-02-20T00:00:00.000Z");
  const performanceTargets = materializeAthletePerformanceTargetFacts({
    athleteId: PROFILE_ID,
    asOf: NOW.toISOString(),
    thresholds: [
      {
        id: current.thresholdId,
        status: "available",
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        method: "bike_power_30m",
        value: current.value,
        effectiveAt: current.effectiveAt.toISOString(),
        policyVersion: "threshold-policy-v1",
        state: "confirmed",
        confidence: current.confidence,
        sourceEvaluationIds: ["evaluation-current"],
        sourceEffortIds: ["effort-current"],
        sourceActivityIds: [SOURCE_ACTIVITY_ID],
      },
    ],
  });
  return {
    readOwnedGoal: vi.fn(async () => row),
    readSnapshot: vi.fn(async () => ({
      planningTimezone: "UTC",
      currentPlanningDate: "2026-02-20",
      freshness: "fresh" as const,
      rebuildStatus: "fresh" as const,
      importStatus: "complete" as const,
      revisions: { source: 7, published: 7 },
      coverage: { startAt: null, endAt: null, lastActivityAt: null },
      computedAt: NOW.toISOString(),
      algorithmVersion: "athlete-state-projection-v1",
      baseline: null,
      performanceTargets,
      estimates: [],
    })),
    readThresholdHistory: vi.fn(async () => ({
      items: [current, baseline],
      nextCursor: null,
    })),
  };
}

describe("readGoalProgress", () => {
  it("reads the canonical goal and threshold history only in the authenticated owner scope", async () => {
    const deps = dependencies();
    const result = await readGoalProgress({
      db: {} as never,
      profileId: PROFILE_ID,
      goalId: GOAL_ID,
      now: NOW,
      dependencies: deps,
    });

    expect(deps.readOwnedGoal).toHaveBeenCalledWith({}, { goalId: GOAL_ID, profileId: PROFILE_ID });
    expect(deps.readSnapshot).toHaveBeenCalledWith({
      db: {},
      profileId: PROFILE_ID,
      now: NOW,
    });
    expect(deps.readThresholdHistory).toHaveBeenCalledWith(
      {},
      { profileId: PROFILE_ID, limit: 100 },
    );
    expect(result).toMatchObject({
      result: {
        status: "on_track",
        goalId: GOAL_ID,
        target: { metric: "power", unit: "watts", targetValue: 280 },
      },
      publication: { status: "available", publishedRevision: 7 },
    });
  });

  it("retains source activity provenance for the selected baseline and current threshold", async () => {
    const result = await readGoalProgress({
      db: {} as never,
      profileId: PROFILE_ID,
      goalId: GOAL_ID,
      now: NOW,
      dependencies: dependencies(),
    });

    expect(result.provenance).toMatchObject({
      baseline: {
        thresholdId: BASELINE_THRESHOLD_ID,
        sourceActivities: [{ id: SOURCE_ACTIVITY_ID, name: "200 W threshold ride" }],
      },
      current: {
        thresholdId: CURRENT_THRESHOLD_ID,
        sourceActivities: [{ id: SOURCE_ACTIVITY_ID, name: "240 W threshold ride" }],
      },
    });
  });

  it("uses canonical goal parsing rather than accepting malformed persisted payloads", async () => {
    const deps = dependencies(
      goalRow({
        type: "threshold",
        metric: "power",
        activity_category: "run",
        value: 280,
      }),
    );

    await expect(
      readGoalProgress({
        db: {} as never,
        profileId: PROFILE_ID,
        goalId: GOAL_ID,
        now: NOW,
        dependencies: deps,
      }),
    ).rejects.toThrow("objective.activity_category must match profile_goals.activity_category");
    expect(deps.readSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    [
      "heart rate",
      { type: "threshold", metric: "hr", activity_category: "bike", value: 170 },
      "heart_rate_goal",
    ],
    ["non-threshold", { type: "consistency", target_sessions_per_week: 4 }, "non_threshold_goal"],
    [
      "category/metric mismatch",
      { type: "threshold", metric: "pace", activity_category: "bike", value: 4 },
      "category_metric_mismatch",
    ],
  ] as const)("returns explicit unsupported %s results without reading threshold data", async (_label, objective, reason) => {
    const deps = dependencies(goalRow(objective));
    const result = await readGoalProgress({
      db: {} as never,
      profileId: PROFILE_ID,
      goalId: GOAL_ID,
      now: NOW,
      dependencies: deps,
    });

    expect(result).toEqual({
      result: { status: "unsupported", reason, goalId: GOAL_ID },
      provenance: null,
      publication: null,
    });
    expect(deps.readSnapshot).not.toHaveBeenCalled();
    expect(deps.readThresholdHistory).not.toHaveBeenCalled();
  });

  it("does not substitute another athlete's goal when the owner-scoped read misses", async () => {
    const deps = dependencies(null);
    await expect(
      readGoalProgress({
        db: {} as never,
        profileId: PROFILE_ID,
        goalId: GOAL_ID,
        dependencies: deps,
      }),
    ).rejects.toBeInstanceOf(GoalProgressNotFoundError);
    expect(deps.readSnapshot).not.toHaveBeenCalled();
  });
});

describe("readGoalPortfolio", () => {
  it("uses the authoritative planning date and returns one bounded priority summary", async () => {
    const readSnapshot = dependencies().readSnapshot;
    const readPortfolio = vi.fn(async () => ({
      activeGoalCount: 1,
      totalGoalCount: 2,
      selectedGoal: {
        activityCategory: "bike",
        id: GOAL_ID,
        priority: 4,
        targetDate: "2026-04-11",
        title: "Active lower-priority goal",
      },
    }));
    const portfolioDependencies: GoalPortfolioReadDependencies = { readPortfolio, readSnapshot };

    const result = await readGoalPortfolio({
      db: {} as never,
      dependencies: portfolioDependencies,
      now: NOW,
      profileId: PROFILE_ID,
    });

    expect(readPortfolio).toHaveBeenCalledWith({
      db: {},
      planningDate: "2026-02-20",
      profileId: PROFILE_ID,
    });
    expect(result).toMatchObject({
      activeGoalCount: 1,
      planningDate: "2026-02-20",
      selectedGoal: { id: GOAL_ID, title: "Active lower-priority goal" },
      totalGoalCount: 2,
    });
  });
});
