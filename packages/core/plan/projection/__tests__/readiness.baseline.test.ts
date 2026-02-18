/**
 * Baseline tests for readiness score calculation
 *
 * These tests capture the CURRENT behavior before the bug fix.
 * They document the issues we're fixing:
 * - Bug #1: Artificial 99+ score inflation
 * - Bug #2: Missing post-event fatigue
 * - Bug #3: Static 12-day peak windows
 */

import { describe, expect, it } from "vitest";
import { computeProjectionPointReadinessScores } from "../readiness";
import {
  createMockGoal,
  createMockProjectionPoint,
  createRaceTarget,
  createTestScenario,
  RACE_PRESETS,
} from "./readiness.test-utils";

describe("Readiness Baseline - Single Isolated Goal", () => {
  it("should show high readiness for well-prepared single marathon", () => {
    // 12-week scenario with good CTL progression
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 84,
      startingCtl: 40,
      startingAtl: 38,
      ctlProgression: "peak",
    });

    const marathonDate = "2026-05-23"; // Day 83
    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal(marathonDate, [marathonTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathonIndex = points.findIndex((p) => p.date === marathonDate);
    const marathonReadiness = scores[marathonIndex];

    // Should show high readiness (80-95%)
    expect(marathonReadiness).toBeGreaterThanOrEqual(80);
    expect(marathonReadiness).toBeLessThanOrEqual(95);
  });
});

describe("Readiness Baseline - Back-to-Back Marathons (Bug #1 & #2)", () => {
  it("currently shows 99/99 for consecutive marathons (WRONG)", () => {
    // Two marathons scheduled 1 day apart
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5), // Marathon 1
      createMockProjectionPoint("2026-03-15", 65, 68, -3), // Marathon 2 (day after)
      createMockProjectionPoint("2026-03-16", 65, 70, -5), // Day 3
    ];

    const marathon1Target = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );
    const marathon2Target = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [
      createMockGoal("2026-03-14", [marathon1Target]),
      createMockGoal("2026-03-15", [marathon2Target]),
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 88,
      goals,
    });

    // CURRENT BEHAVIOR (WRONG):
    // Both marathons show very high readiness due to:
    // 1. No post-event fatigue modeling
    // 2. Artificial 99+ override in computeGoalReadinessScore

    // Document current behavior
    console.log("Current back-to-back marathon scores:", {
      marathon1: scores[0],
      marathon2: scores[1],
      day3: scores[2],
    });

    // After fix, we expect:
    // - Marathon 1: ~88% (well-prepared)
    // - Marathon 2: ~44% (severe fatigue from day 1)
    // - Day 3: ~40% (still recovering)

    // For now, just verify the test runs
    expect(scores).toHaveLength(3);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBeGreaterThan(0);
  });
});

describe("Readiness Baseline - Marathon + 5K (Bug #2)", () => {
  it("currently doesn't show recovery fatigue for 5K after marathon", () => {
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5), // Marathon
      createMockProjectionPoint("2026-03-15", 65, 68, -3), // Day 2
      createMockProjectionPoint("2026-03-16", 65, 66, -1), // Day 3
      createMockProjectionPoint("2026-03-17", 65, 64, 1), // 5K race (day 4)
    ];

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );
    const fiveKTarget = createRaceTarget(
      "run",
      RACE_PRESETS["5K"].distance,
      RACE_PRESETS["5K"].times.moderate,
    );

    const goals = [
      createMockGoal("2026-03-14", [marathonTarget]),
      createMockGoal("2026-03-17", [fiveKTarget]),
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // CURRENT BEHAVIOR (WRONG):
    // 5K shows high readiness, ignoring marathon recovery needs

    console.log("Current marathon + 5K scores:", {
      marathon: scores[0],
      day2: scores[1],
      day3: scores[2],
      fiveK: scores[3],
    });

    // After fix, we expect:
    // - Marathon: ~85%
    // - Day 2: ~45% (severe fatigue)
    // - Day 3: ~50% (still recovering)
    // - 5K (day 4): ~52% (still affected by marathon)

    expect(scores).toHaveLength(4);
  });
});

describe("Readiness Baseline - Different Event Types (Bug #3)", () => {
  it("currently uses same 12-day window for all event types", () => {
    // Test that 5K, marathon, and ultra all use the same peak window
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 30,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    // 5K race
    const fiveKTarget = createRaceTarget(
      "run",
      RACE_PRESETS["5K"].distance,
      RACE_PRESETS["5K"].times.moderate,
    );
    const fiveKGoals = [createMockGoal("2026-03-15", [fiveKTarget])];
    const fiveKScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: fiveKGoals,
    });

    // Marathon race
    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );
    const marathonGoals = [createMockGoal("2026-03-15", [marathonTarget])];
    const marathonScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: marathonGoals,
    });

    // Ultra race
    const ultraTarget = createRaceTarget(
      "run",
      RACE_PRESETS["100_mile"].distance,
      RACE_PRESETS["100_mile"].times.moderate,
    );
    const ultraGoals = [createMockGoal("2026-03-15", [ultraTarget])];
    const ultraScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: ultraGoals,
    });

    // CURRENT BEHAVIOR (WRONG):
    // All events use hardcoded 12-day peak window
    // After fix, we expect:
    // - 5K: ~10-day window
    // - Marathon: ~15-day window
    // - Ultra: ~21-day window

    console.log("Current peak window behavior:", {
      fiveK: fiveKScores[14], // Day 15 (race day)
      marathon: marathonScores[14],
      ultra: ultraScores[14],
    });

    expect(fiveKScores).toHaveLength(30);
    expect(marathonScores).toHaveLength(30);
    expect(ultraScores).toHaveLength(30);
  });
});

describe("Readiness Baseline - Determinism", () => {
  it("should produce identical results for identical inputs", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 14,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );
    const goals = [createMockGoal("2026-03-14", [marathonTarget])];

    const scores1 = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const scores2 = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    expect(scores1).toEqual(scores2);
  });
});
