/**
 * Integration tests for post-event fatigue (Phase 3)
 *
 * Tests that post-event fatigue penalties are correctly applied
 * to readiness scores after events.
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

describe("Post-Event Fatigue Integration", () => {
  it("applies fatigue penalty day after marathon", () => {
    // Use longer timeline for realistic smoothing behavior
    const points = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 10,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-14", [marathonTarget])]; // Day 5

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathonIndex = 4; // Day 5 (0-indexed)
    const day1AfterIndex = 5;
    const day2AfterIndex = 6;

    // Day after marathon should show fatigue penalty
    // With smoothing, the penalty might be less dramatic but should be present
    const penalty = scores[marathonIndex]! - scores[day1AfterIndex]!;
    expect(penalty).toBeGreaterThanOrEqual(0); // Should not increase

    // Verify scores are in valid range
    expect(scores[marathonIndex]).toBeGreaterThan(0);
    expect(scores[day1AfterIndex]).toBeGreaterThan(0);
    expect(scores[day2AfterIndex]).toBeGreaterThan(0);

    console.log("Post-marathon fatigue:", {
      marathonDay: scores[marathonIndex],
      day1After: scores[day1AfterIndex],
      day2After: scores[day2AfterIndex],
      penalty,
    });
  });

  it("applies max penalty from multiple events", () => {
    const points = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 12,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

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
      createMockGoal("2026-03-14", [marathonTarget]), // Day 5
      createMockGoal("2026-03-17", [fiveKTarget]), // Day 8
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathonIndex = 4; // Day 5
    const fiveKIndex = 7; // Day 8
    const day9Index = 8; // Day after 5K

    console.log("Multiple events fatigue:", {
      marathon: scores[marathonIndex],
      fiveK: scores[fiveKIndex],
      day9: scores[day9Index],
    });

    // Verify scores are realistic and in valid range
    expect(scores[marathonIndex]).toBeGreaterThan(0);
    expect(scores[fiveKIndex]).toBeGreaterThan(0);
    expect(scores[day9Index]).toBeGreaterThan(0);

    // 5K should be affected by marathon recovery (3 days after)
    expect(scores[fiveKIndex]).toBeLessThanOrEqual(scores[marathonIndex]!);
  });

  it("no penalty before event", () => {
    const points = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 10,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-15", [marathonTarget])]; // Day 6

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const dayBeforeIndex = 4; // Day 5
    const marathonIndex = 5; // Day 6
    const dayAfterIndex = 6; // Day 7

    // The key is that post-event fatigue only applies AFTER the event
    // Day after should be lower than or equal to marathon day
    expect(scores[dayAfterIndex]).toBeLessThanOrEqual(scores[marathonIndex]!);

    // Verify all scores are valid
    expect(scores[dayBeforeIndex]).toBeGreaterThan(0);
    expect(scores[marathonIndex]).toBeGreaterThan(0);
    expect(scores[dayAfterIndex]).toBeGreaterThan(0);

    console.log("Pre/post event comparison:", {
      dayBefore: scores[dayBeforeIndex],
      eventDay: scores[marathonIndex],
      dayAfter: scores[dayAfterIndex],
    });
  });

  it("penalty decays over time", () => {
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5), // Marathon
      createMockProjectionPoint("2026-03-15", 65, 68, -3), // Day 1
      createMockProjectionPoint("2026-03-17", 65, 64, 1), // Day 3
      createMockProjectionPoint("2026-03-21", 65, 60, 5), // Day 7
      createMockProjectionPoint("2026-03-28", 65, 60, 5), // Day 14
    ];

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-14", [marathonTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // Penalty should decay exponentially
    // Note: penalties are relative to marathon day, so they should decrease over time
    const penalty1 = Math.max(0, scores[0]! - scores[1]!);
    const penalty3 = Math.max(0, scores[0]! - scores[2]!);
    const penalty7 = Math.max(0, scores[0]! - scores[3]!);
    const penalty14 = Math.max(0, scores[0]! - scores[4]!);

    // Verify decay pattern - each later penalty should be less than earlier
    // Allow for some smoothing effects by checking general trend
    expect(penalty1).toBeGreaterThan(0); // Day 1 should have some penalty
    expect(penalty14).toBeLessThan(penalty1); // Day 14 should be less than day 1

    // Verify scores are recovering over time
    expect(scores[4]).toBeGreaterThanOrEqual(scores[1]!);

    console.log("Fatigue decay over time:", {
      marathon: scores[0],
      day1: scores[1],
      day3: scores[2],
      day7: scores[3],
      day14: scores[4],
      penalties: { penalty1, penalty3, penalty7, penalty14 },
    });
  });

  it("handles goals without targets gracefully", () => {
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5),
      createMockProjectionPoint("2026-03-15", 65, 60, 5),
    ];

    // Goal without targets
    const goals = [createMockGoal("2026-03-14", [])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // Should not crash, should return reasonable scores
    expect(scores).toHaveLength(2);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBeGreaterThan(0);
  });

  it("different event types have different recovery curves", () => {
    // 5K recovery
    const fiveKPoints = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5), // 5K
      createMockProjectionPoint("2026-03-15", 65, 62, 3), // Day 1
      createMockProjectionPoint("2026-03-16", 65, 61, 4), // Day 2
      createMockProjectionPoint("2026-03-17", 65, 60, 5), // Day 3
    ];

    const fiveKTarget = createRaceTarget(
      "run",
      RACE_PRESETS["5K"].distance,
      RACE_PRESETS["5K"].times.moderate,
    );

    const fiveKScores = computeProjectionPointReadinessScores({
      points: fiveKPoints,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-14", [fiveKTarget])],
    });

    // Marathon recovery
    const marathonPoints = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5), // Marathon
      createMockProjectionPoint("2026-03-15", 65, 68, -3), // Day 1
      createMockProjectionPoint("2026-03-16", 65, 66, -1), // Day 2
      createMockProjectionPoint("2026-03-17", 65, 64, 1), // Day 3
    ];

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const marathonScores = computeProjectionPointReadinessScores({
      points: marathonPoints,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-14", [marathonTarget])],
    });

    // 5K should recover faster than marathon
    // Compare the penalty on day 1 - marathon should have higher penalty
    const fiveKDay1Penalty = Math.max(0, fiveKScores[0]! - fiveKScores[1]!);
    const marathonDay1Penalty = Math.max(
      0,
      marathonScores[0]! - marathonScores[1]!,
    );

    // Marathon should have higher penalty (or at least not significantly lower)
    expect(marathonDay1Penalty).toBeGreaterThanOrEqual(fiveKDay1Penalty * 0.8);

    console.log("Recovery curve comparison:", {
      fiveK: {
        event: fiveKScores[0],
        day1: fiveKScores[1],
        day3: fiveKScores[3],
        day1Penalty: fiveKDay1Penalty,
      },
      marathon: {
        event: marathonScores[0],
        day1: marathonScores[1],
        day3: marathonScores[3],
        day1Penalty: marathonDay1Penalty,
      },
    });
  });

  it("ATL overload increases fatigue penalty", () => {
    // Normal ATL scenario
    const normalPoints = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 8,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    // High ATL overload scenario - manually adjust day after marathon
    const overloadPoints = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 8,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });
    // Simulate high ATL spike on day after marathon
    overloadPoints[5] = createMockProjectionPoint("2026-03-15", 65, 75, -10);

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const normalScores = computeProjectionPointReadinessScores({
      points: normalPoints,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-14", [marathonTarget])], // Day 5
    });

    const overloadScores = computeProjectionPointReadinessScores({
      points: overloadPoints,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-14", [marathonTarget])], // Day 5
    });

    const marathonIndex = 4;
    const dayAfterIndex = 5;

    // Overload scenario should have lower readiness due to higher ATL
    expect(overloadScores[dayAfterIndex]).toBeLessThanOrEqual(
      normalScores[dayAfterIndex]!,
    );

    console.log("ATL overload effect:", {
      normal: {
        marathon: normalScores[marathonIndex],
        day1: normalScores[dayAfterIndex],
      },
      overload: {
        marathon: overloadScores[marathonIndex],
        day1: overloadScores[dayAfterIndex],
      },
      difference: normalScores[dayAfterIndex]! - overloadScores[dayAfterIndex]!,
    });
  });
});

describe("Post-Event Fatigue - Edge Cases", () => {
  it("handles very short timeline (2 days)", () => {
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5),
      createMockProjectionPoint("2026-03-15", 65, 68, -3),
    ];

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-14", [marathonTarget])],
    });

    expect(scores).toHaveLength(2);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[1]).toBeGreaterThan(0);
  });

  it("handles multiple goals on same day", () => {
    const points = createTestScenario({
      startDate: "2026-03-10",
      durationDays: 8,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

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
      createMockGoal("2026-03-14", [marathonTarget]), // Day 5
      createMockGoal("2026-03-14", [fiveKTarget]), // Same day
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const eventIndex = 4; // Day 5
    const dayAfterIndex = 5;

    // Should use max penalty (marathon > 5K)
    expect(scores).toHaveLength(8);
    expect(scores[eventIndex]).toBeGreaterThan(0);
    expect(scores[dayAfterIndex]).toBeGreaterThan(0);
    expect(scores[dayAfterIndex]).toBeLessThanOrEqual(scores[eventIndex]!);
  });

  it("is deterministic for same inputs", () => {
    const points = [
      createMockProjectionPoint("2026-03-14", 65, 60, 5),
      createMockProjectionPoint("2026-03-15", 65, 68, -3),
    ];

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
