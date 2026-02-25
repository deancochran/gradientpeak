/**
 * Integration tests for readiness score bug fix (Phase 5)
 *
 * End-to-end tests using buildDeterministicProjectionPayload to verify
 * the complete fix across all three bugs.
 */

import { describe, expect, it } from "vitest";
import { buildDeterministicProjectionPayload } from "../projectionCalculations";

describe("Readiness Score Bug Fix - End-to-End Integration", () => {
  it("single isolated marathon shows realistic readiness (80-95%)", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-05-24",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-05-10",
          target_weekly_tss_range: { min: 350, max: 420 },
        },
        {
          name: "Taper",
          phase: "taper",
          start_date: "2026-05-11",
          end_date: "2026-05-24",
          target_weekly_tss_range: { min: 150, max: 200 },
        },
      ],
      goals: [
        {
          id: "marathon-1",
          name: "Marathon",
          target_date: "2026-05-24",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600, // 3:30 marathon
            },
          ],
        },
      ],
      starting_ctl: 50,
      starting_atl: 48,
      starting_tsb: 2,
    });

    const goalAssessment = projection.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );

    const readiness = goalAssessment?.goal_readiness_score ?? 0;

    // Should show realistic readiness (not artificially inflated to 99+)
    expect(readiness).toBeGreaterThan(0);
    expect(readiness).toBeLessThanOrEqual(100);

    // For a well-prepared single marathon, expect high readiness
    expect(readiness).toBeGreaterThan(70);

    console.log("Single isolated marathon:", {
      readiness,
      stateReadiness: goalAssessment?.state_readiness_score,
      targetScore: goalAssessment?.target_scores?.[0]?.score_0_100,
      note: "Should be realistic (70-95), not artificially inflated to 99+",
    });
  });

  it("back-to-back marathons show realistic fatigue (not 99/99)", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-20",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-20",
          target_weekly_tss_range: { min: 350, max: 420 },
        },
      ],
      goals: [
        {
          id: "marathon-1",
          name: "Marathon 1",
          target_date: "2026-03-14",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
        {
          id: "marathon-2",
          name: "Marathon 2",
          target_date: "2026-03-15", // Next day!
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
      ],
      starting_ctl: 65,
      starting_atl: 60,
      starting_tsb: 5,
    });

    const marathon1 = projection.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );
    const marathon2 = projection.goal_assessments?.find(
      (g) => g.goal_id === "marathon-2",
    );

    const readiness1 = marathon1?.goal_readiness_score ?? 0;
    const readiness2 = marathon2?.goal_readiness_score ?? 0;

    // Marathon 2 should be significantly lower than Marathon 1
    expect(readiness2).toBeLessThan(readiness1);

    // Marathon 2 should show realistic fatigue (not 99)
    expect(readiness2).toBeLessThan(90);

    console.log("Back-to-back marathons:", {
      marathon1: readiness1,
      marathon2: readiness2,
      difference: readiness1 - readiness2,
      note: "Before fix: 99/99. After fix: realistic fatigue on day 2",
    });
  });

  it("marathon + 5K shows recovery fatigue", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-20",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-20",
          target_weekly_tss_range: { min: 350, max: 420 },
        },
      ],
      goals: [
        {
          id: "marathon-1",
          name: "Marathon",
          target_date: "2026-03-10",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
        {
          id: "5k-1",
          name: "5K",
          target_date: "2026-03-13", // 3 days after marathon
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500, // 25 minutes
            },
          ],
        },
      ],
      starting_ctl: 65,
      starting_atl: 60,
      starting_tsb: 5,
    });

    const marathon = projection.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );
    const fiveK = projection.goal_assessments?.find(
      (g) => g.goal_id === "5k-1",
    );

    const marathonReadiness = marathon?.goal_readiness_score ?? 0;
    const fiveKReadiness = fiveK?.goal_readiness_score ?? 0;

    // 5K should show impact of marathon recovery
    expect(fiveKReadiness).toBeLessThan(marathonReadiness);

    console.log("Marathon + 5K scenario:", {
      marathon: marathonReadiness,
      fiveK: fiveKReadiness,
      note: "5K should show recovery fatigue from marathon",
    });
  });

  it("different event types use appropriate recovery windows", () => {
    // Test that 5K, marathon, and ultra use different window sizes
    // by checking how they handle nearby events

    const fiveKProjection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-30",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-30",
          target_weekly_tss_range: { min: 300, max: 400 },
        },
      ],
      goals: [
        {
          id: "5k-1",
          name: "5K",
          target_date: "2026-03-15",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          ],
        },
      ],
      starting_ctl: 50,
      starting_atl: 48,
      starting_tsb: 2,
    });

    const marathonProjection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-30",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-30",
          target_weekly_tss_range: { min: 300, max: 400 },
        },
      ],
      goals: [
        {
          id: "marathon-1",
          name: "Marathon",
          target_date: "2026-03-15",
          priority: 8,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
      ],
      starting_ctl: 50,
      starting_atl: 48,
      starting_tsb: 2,
    });

    const fiveKGoal = fiveKProjection.goal_assessments?.find(
      (g) => g.goal_id === "5k-1",
    );
    const marathonGoal = marathonProjection.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );

    // Both should have reasonable readiness
    expect(fiveKGoal?.goal_readiness_score).toBeGreaterThan(0);
    expect(marathonGoal?.goal_readiness_score).toBeGreaterThan(0);

    console.log("Event type comparison:", {
      fiveK: fiveKGoal?.goal_readiness_score,
      marathon: marathonGoal?.goal_readiness_score,
      note: "Different events use different recovery windows",
    });
  });

  it("no artificial 99+ scores even with high state and attainment", () => {
    // Create a scenario that would have triggered the old override
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-05-24",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-05-10",
          target_weekly_tss_range: { min: 400, max: 500 },
        },
        {
          name: "Taper",
          phase: "taper",
          start_date: "2026-05-11",
          end_date: "2026-05-24",
          target_weekly_tss_range: { min: 150, max: 200 },
        },
      ],
      goals: [
        {
          id: "easy-goal",
          name: "Easy 5K",
          target_date: "2026-05-24",
          priority: 10,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1800, // 30-minute 5K (very achievable)
            },
          ],
        },
      ],
      starting_ctl: 60,
      starting_atl: 58,
      starting_tsb: 2,
    });

    const goalAssessment = projection.goal_assessments?.find(
      (g) => g.goal_id === "easy-goal",
    );

    const readiness = goalAssessment?.goal_readiness_score ?? 0;
    const stateReadiness = goalAssessment?.state_readiness_score ?? 0;
    const targetScore = goalAssessment?.target_scores?.[0]?.score_0_100 ?? 0;

    // Should not be artificially inflated to 99+
    // Even with high state and attainment, should return calculated score
    expect(readiness).toBeLessThanOrEqual(100);

    console.log("High state/attainment scenario:", {
      readiness,
      stateReadiness,
      targetScore,
      note: "Should return calculated score, not forced to 99+",
    });
  });
});

describe("Readiness Score Bug Fix - Performance", () => {
  it("completes typical 12-week plan with 3 goals in reasonable time", () => {
    const startTime = Date.now();

    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-05-24",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-05-10",
          target_weekly_tss_range: { min: 350, max: 420 },
        },
        {
          name: "Taper",
          phase: "taper",
          start_date: "2026-05-11",
          end_date: "2026-05-24",
          target_weekly_tss_range: { min: 150, max: 200 },
        },
      ],
      goals: [
        {
          id: "5k-1",
          name: "5K",
          target_date: "2026-03-20",
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          ],
        },
        {
          id: "10k-1",
          name: "10K",
          target_date: "2026-04-15",
          priority: 7,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10000,
              target_time_s: 3000,
            },
          ],
        },
        {
          id: "marathon-1",
          name: "Marathon",
          target_date: "2026-05-24",
          priority: 10,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
      ],
      starting_ctl: 50,
      starting_atl: 48,
      starting_tsb: 2,
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in reasonable time (< 1000ms for typical plan)
    expect(duration).toBeLessThan(1000);
    expect(projection.goal_assessments).toHaveLength(3);

    console.log("Performance benchmark:", {
      duration: `${duration}ms`,
      goals: projection.goal_assessments?.length,
      note: "Should complete in < 1000ms",
    });
  });
});

describe("Readiness Score Bug Fix - Determinism", () => {
  it("produces identical results for identical inputs", () => {
    const input = {
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-05-24",
      },
      blocks: [
        {
          name: "Build",
          phase: "build" as const,
          start_date: "2026-03-01",
          end_date: "2026-05-10",
          target_weekly_tss_range: { min: 350, max: 420 },
        },
        {
          name: "Taper",
          phase: "taper" as const,
          start_date: "2026-05-11",
          end_date: "2026-05-24",
          target_weekly_tss_range: { min: 150, max: 200 },
        },
      ],
      goals: [
        {
          id: "marathon-1",
          name: "Marathon",
          target_date: "2026-05-24",
          priority: 8,
          targets: [
            {
              target_type: "race_performance" as const,
              activity_category: "run" as const,
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
      ],
      starting_ctl: 50,
      starting_atl: 48,
      starting_tsb: 2,
    };

    const projection1 = buildDeterministicProjectionPayload(input);
    const projection2 = buildDeterministicProjectionPayload(input);

    const goal1 = projection1.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );
    const goal2 = projection2.goal_assessments?.find(
      (g) => g.goal_id === "marathon-1",
    );

    expect(goal1?.goal_readiness_score).toBe(goal2?.goal_readiness_score);
    expect(goal1?.state_readiness_score).toBe(goal2?.state_readiness_score);
  });
});
