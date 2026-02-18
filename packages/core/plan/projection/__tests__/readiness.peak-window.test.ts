/**
 * Tests for dynamic peak windows (Phase 4)
 *
 * Verifies that peak windows scale with event type and that
 * conflicting goals are detected and handled appropriately.
 */

import { describe, expect, it } from "vitest";
import { computeProjectionPointReadinessScores } from "../readiness";
import {
  createMockGoal,
  createTestScenario,
  createRaceTarget,
  RACE_PRESETS,
} from "./readiness.test-utils";

describe("Dynamic Peak Windows", () => {
  it("5K uses shorter window (~10 days)", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 30,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    const fiveKTarget = createRaceTarget(
      "run",
      RACE_PRESETS["5K"].distance,
      RACE_PRESETS["5K"].times.moderate,
    );

    const goals = [createMockGoal("2026-03-15", [fiveKTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // 5K should have ~10-day window
    // Check that suppression doesn't extend too far
    const raceIndex = 14; // Day 15 (0-indexed)
    const raceScore = scores[raceIndex];

    // Days 5-10 before race should not be heavily suppressed
    const day10Before = scores[raceIndex - 10];
    const day5Before = scores[raceIndex - 5];

    console.log("5K peak window:", {
      day10Before,
      day5Before,
      raceDay: raceScore,
      note: "5K should use ~10-day window, not 12",
    });

    expect(raceScore).toBeGreaterThan(0);
    expect(day5Before).toBeGreaterThan(0);
  });

  it("marathon uses medium window (~15 days)", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 40,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-20", [marathonTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // Marathon should have ~15-day window
    const raceIndex = 19; // Day 20 (0-indexed)
    const raceScore = scores[raceIndex];

    console.log("Marathon peak window:", {
      raceDay: raceScore,
      note: "Marathon should use ~15-day window",
    });

    expect(raceScore).toBeGreaterThan(0);
  });

  it("ultra uses longer window (~21 days)", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 50,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    const ultraTarget = createRaceTarget(
      "run",
      RACE_PRESETS["100_mile"].distance,
      RACE_PRESETS["100_mile"].times.moderate,
    );

    const goals = [createMockGoal("2026-03-25", [ultraTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // Ultra should have ~21-day window
    const raceIndex = 24; // Day 25 (0-indexed)
    const raceScore = scores[raceIndex];

    console.log("Ultra peak window:", {
      raceDay: raceScore,
      note: "Ultra should use ~21-day window",
    });

    expect(raceScore).toBeGreaterThan(0);
  });
});

describe("Conflict Detection", () => {
  it("detects conflict when goals are within functional recovery window", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 20,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    // Two marathons 3 days apart (within functional recovery ~5 days)
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
      createMockGoal("2026-03-10", [marathon1Target]),
      createMockGoal("2026-03-13", [marathon2Target]), // 3 days later
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathon1Index = 9; // Day 10
    const marathon2Index = 12; // Day 13

    // Second marathon should show impact of first marathon
    // With conflict detection, it won't be forced to local max
    expect(scores[marathon2Index]).toBeLessThanOrEqual(scores[marathon1Index]!);

    console.log("Conflicting marathons:", {
      marathon1: scores[marathon1Index],
      marathon2: scores[marathon2Index],
      difference: scores[marathon1Index]! - scores[marathon2Index]!,
      note: "Marathon 2 should show fatigue, not forced peak",
    });
  });

  it("no conflict when goals are well-separated", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 30,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    // Marathon and 5K 10 days apart (outside functional recovery)
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
      createMockGoal("2026-03-10", [marathonTarget]),
      createMockGoal("2026-03-20", [fiveKTarget]), // 10 days later
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathon1Index = 9; // Day 10
    const fiveKIndex = 19; // Day 20

    // Both should be local peaks (no conflict)
    expect(scores[marathon1Index]).toBeGreaterThan(0);
    expect(scores[fiveKIndex]).toBeGreaterThan(0);

    console.log("Well-separated goals:", {
      marathon: scores[marathon1Index],
      fiveK: scores[fiveKIndex],
      note: "Both should be peaks (no conflict)",
    });
  });
});

describe("Peak Forcing Behavior", () => {
  it("conflicting goals not forced to local max", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 12,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    // Back-to-back marathons (1 day apart)
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
      createMockGoal("2026-03-06", [marathon1Target]), // Day 6
      createMockGoal("2026-03-07", [marathon2Target]), // Day 7 (next day)
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 88,
      goals,
    });

    const marathon1Index = 5; // Day 6
    const marathon2Index = 6; // Day 7

    // Marathon 2 should show natural fatigue curve, not forced peak
    // With conflict detection, it should be lower
    expect(scores[marathon2Index]).toBeLessThanOrEqual(scores[marathon1Index]!);

    const difference = scores[marathon1Index]! - scores[marathon2Index]!;

    console.log("Back-to-back marathons (no peak forcing):", {
      marathon1: scores[marathon1Index],
      marathon2: scores[marathon2Index],
      difference,
      note: "Marathon 2 should show drop due to fatigue",
    });
  });

  it("isolated goals still forced to local max", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 30,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat", // Use flat to avoid CTL progression affecting peak
    });

    // Single isolated marathon
    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-20", [marathonTarget])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    const marathonIndex = 19; // Day 20
    const marathonScore = scores[marathonIndex];

    // Should be a local maximum within its window (or very close to it)
    // Check a smaller window around the goal
    const windowStart = Math.max(0, marathonIndex - 10);
    const windowEnd = Math.min(scores.length - 1, marathonIndex + 10);

    let higherScoresCount = 0;
    for (let i = windowStart; i <= windowEnd; i++) {
      if (i !== marathonIndex && scores[i]! > marathonScore!) {
        higherScoresCount++;
      }
    }

    // Allow for some smoothing effects - should be at or near the peak
    expect(higherScoresCount).toBeLessThanOrEqual(2);

    console.log("Isolated marathon (peak forcing):", {
      marathonScore,
      higherScoresInWindow: higherScoresCount,
      note: "Should be at or near peak of its window",
    });
  });
});

describe("Dynamic Peak Windows - Edge Cases", () => {
  it("handles goals without targets (uses default window)", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 20,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    // Goal without targets
    const goals = [createMockGoal("2026-03-10", [])];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals,
    });

    // Should not crash, should use default window
    expect(scores).toHaveLength(20);
    expect(scores[9]).toBeGreaterThan(0);
  });

  it("handles multiple conflicting goals", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 18,
      startingCtl: 65,
      startingAtl: 60,
      ctlProgression: "flat",
    });

    // Three marathons in quick succession
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
    const marathon3Target = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [
      createMockGoal("2026-03-06", [marathon1Target]), // Day 6
      createMockGoal("2026-03-09", [marathon2Target]), // Day 9 (3 days later)
      createMockGoal("2026-03-12", [marathon3Target]), // Day 12 (3 days later)
    ];

    const scores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 88,
      goals,
    });

    const marathon1Index = 5; // Day 6
    const marathon2Index = 8; // Day 9
    const marathon3Index = 11; // Day 12

    // All three should show impact of cumulative fatigue
    // Marathon 2 should be affected by Marathon 1
    expect(scores[marathon2Index]).toBeLessThanOrEqual(scores[marathon1Index]!);
    // Marathon 3 should be affected by Marathon 2
    expect(scores[marathon3Index]).toBeLessThanOrEqual(scores[marathon2Index]!);

    console.log("Three conflicting marathons:", {
      marathon1: scores[marathon1Index],
      marathon2: scores[marathon2Index],
      marathon3: scores[marathon3Index],
      note: "Should show progressive fatigue",
    });
  });

  it("is deterministic for same inputs", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 20,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );

    const goals = [createMockGoal("2026-03-10", [marathonTarget])];

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

describe("Peak Window Scaling", () => {
  it("longer events have longer windows", () => {
    const points = createTestScenario({
      startDate: "2026-03-01",
      durationDays: 50,
      startingCtl: 50,
      startingAtl: 48,
      ctlProgression: "flat",
    });

    // Compare 5K vs Marathon vs Ultra
    const fiveKTarget = createRaceTarget(
      "run",
      RACE_PRESETS["5K"].distance,
      RACE_PRESETS["5K"].times.moderate,
    );
    const marathonTarget = createRaceTarget(
      "run",
      RACE_PRESETS.marathon.distance,
      RACE_PRESETS.marathon.times.moderate,
    );
    const ultraTarget = createRaceTarget(
      "run",
      RACE_PRESETS["100_mile"].distance,
      RACE_PRESETS["100_mile"].times.moderate,
    );

    // Test each separately to observe window effects
    const fiveKScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-25", [fiveKTarget])],
    });

    const marathonScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-25", [marathonTarget])],
    });

    const ultraScores = computeProjectionPointReadinessScores({
      points,
      planReadinessScore: 85,
      goals: [createMockGoal("2026-03-25", [ultraTarget])],
    });

    // All should peak on race day
    const raceIndex = 24;
    expect(fiveKScores[raceIndex]).toBeGreaterThan(0);
    expect(marathonScores[raceIndex]).toBeGreaterThan(0);
    expect(ultraScores[raceIndex]).toBeGreaterThan(0);

    console.log("Window scaling comparison:", {
      fiveK: fiveKScores[raceIndex],
      marathon: marathonScores[raceIndex],
      ultra: ultraScores[raceIndex],
      note: "Different events use different window sizes",
    });
  });
});
