import { describe, expect, it } from "vitest";
import {
  buildDeterministicProjectionPayload,
  type BuildDeterministicProjectionInput,
} from "../projectionCalculations";
import { scoreTargetSatisfaction } from "../scoring/targetSatisfaction";

function maxPlannedWeeklyTss(
  projection: ReturnType<typeof buildDeterministicProjectionPayload>,
): number {
  return Math.max(
    ...projection.microcycles.map((cycle) => cycle.planned_weekly_tss),
  );
}

describe("phase 4 property suite", () => {
  it("keeps deterministic replay stable across repeated executions", () => {
    const input: BuildDeterministicProjectionInput = {
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 220, max: 280 },
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "Primary 10k",
          target_date: "2026-02-22",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 10000,
              target_time_s: 2520,
              activity_category: "run",
            },
          ],
        },
      ],
      starting_ctl: 34,
    };

    const baseline = buildDeterministicProjectionPayload(input);
    for (let replay = 0; replay < 5; replay += 1) {
      expect(buildDeterministicProjectionPayload(input)).toEqual(baseline);
    }
  });

  it("stays invariant under deterministic goal and target permutations", () => {
    const goals: BuildDeterministicProjectionInput["goals"] = [
      {
        id: "goal-1",
        name: "A Goal",
        target_date: "2026-03-08",
        priority: 1,
        targets: [
          {
            target_type: "power_threshold",
            target_watts: 290,
            test_duration_s: 1200,
            activity_category: "bike",
          },
          {
            target_type: "hr_threshold",
            target_lthr_bpm: 170,
          },
        ],
      },
      {
        id: "goal-2",
        name: "B Goal",
        target_date: "2026-03-01",
        priority: 4,
        targets: [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 2500,
            activity_category: "run",
          },
        ],
      },
      {
        id: "goal-3",
        name: "C Goal",
        target_date: "2026-02-22",
        priority: 8,
        targets: [
          {
            target_type: "pace_threshold",
            target_speed_mps: 4,
            test_duration_s: 1200,
            activity_category: "run",
          },
        ],
      },
    ];

    const shared: Omit<BuildDeterministicProjectionInput, "goals"> = {
      timeline: { start_date: "2026-01-12", end_date: "2026-03-08" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-12",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 240, max: 300 },
        },
      ],
      starting_ctl: 36,
    };

    const baseline = buildDeterministicProjectionPayload({
      ...shared,
      goals,
    });
    const permutationA = buildDeterministicProjectionPayload({
      ...shared,
      goals: [
        goals[2]!,
        { ...goals[0]!, targets: [...(goals[0]?.targets ?? [])].reverse() },
        goals[1]!,
      ],
    });
    const permutationB = buildDeterministicProjectionPayload({
      ...shared,
      goals: [goals[1]!, goals[2]!, goals[0]!],
    });

    expect(permutationA).toEqual(baseline);
    expect(permutationB).toEqual(baseline);
    expect(permutationA.readiness_score).toBe(baseline.readiness_score);
    expect(permutationB.readiness_score).toBe(baseline.readiness_score);
    expect(permutationA.readiness_confidence).toBe(
      baseline.readiness_confidence,
    );
    expect(permutationB.readiness_confidence).toBe(
      baseline.readiness_confidence,
    );
  });

  it("preserves monotonic behavior under tighter constraints", () => {
    const base: BuildDeterministicProjectionInput = {
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 250, max: 320 },
        },
      ],
      goals: [
        {
          id: "goal-main",
          name: "A race",
          target_date: "2026-03-01",
          priority: 1,
        },
      ],
      starting_ctl: 28,
    };

    const lenient = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });
    const strict = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 4,
        max_ctl_ramp_per_week: 1,
      },
    });

    expect(maxPlannedWeeklyTss(strict)).toBeLessThanOrEqual(
      maxPlannedWeeklyTss(lenient),
    );
    expect(
      strict.no_history.projection_feasibility?.readiness_score ?? 100,
    ).toBeLessThanOrEqual(
      (lenient.no_history.projection_feasibility?.readiness_score ?? 0) + 2,
    );
  });

  it("keeps harder targets from scoring higher than easier targets", () => {
    const raceTimes = [13200, 12600, 12000, 11400];
    const raceScores = raceTimes.map(
      (targetTime) =>
        scoreTargetSatisfaction({
          target: {
            target_type: "race_performance",
            distance_m: 42195,
            target_time_s: targetTime,
            activity_category: "run",
          },
          projection: {
            projected_race_time_s: 12600,
          },
        }).score_0_100,
    );

    for (let index = 1; index < raceScores.length; index += 1) {
      expect(raceScores[index] ?? 100).toBeLessThanOrEqual(
        raceScores[index - 1] ?? 0,
      );
    }

    const powerTargets = [250, 270, 290, 310];
    const powerScores = powerTargets.map(
      (targetWatts) =>
        scoreTargetSatisfaction({
          target: {
            target_type: "power_threshold",
            target_watts: targetWatts,
            test_duration_s: 1200,
            activity_category: "bike",
          },
          projection: {
            projected_power_watts: 280,
          },
        }).score_0_100,
    );

    for (let index = 1; index < powerScores.length; index += 1) {
      expect(powerScores[index] ?? 100).toBeLessThanOrEqual(
        powerScores[index - 1] ?? 0,
      );
    }
  });
});

describe("phase 4 golden scenarios", () => {
  it("impossible marathon lowers envelope and readiness deterministically", () => {
    const base: BuildDeterministicProjectionInput = {
      timeline: { start_date: "2026-01-05", end_date: "2026-04-05" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-04-05",
          target_weekly_tss_range: { min: 120, max: 160 },
        },
      ],
      goals: [
        {
          id: "goal-marathon",
          name: "Marathon",
          target_date: "2026-04-05",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 42195,
              target_time_s: 10200,
              activity_category: "run",
            },
          ],
        },
      ],
      starting_ctl: 10,
    };

    const conservative = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 4,
        max_ctl_ramp_per_week: 1,
      },
    });
    const aggressive = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect("mode_applied" in aggressive).toBe(false);
    expect("overrides_applied" in aggressive).toBe(false);
    expect(aggressive.capacity_envelope?.envelope_score ?? 100).toBeLessThan(
      conservative.capacity_envelope?.envelope_score ?? 0,
    );
    expect(aggressive.readiness_rationale_codes).toContain(
      "readiness_penalty_capacity_envelope_outside",
    );
    expect(aggressive.readiness_score).toBeGreaterThanOrEqual(0);
    expect(aggressive.readiness_score).toBeLessThanOrEqual(100);
  });

  it("handles overlapping A goals deterministically", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: { start_date: "2026-01-05", end_date: "2026-03-08" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 240, max: 300 },
        },
      ],
      goals: [
        {
          id: "goal-a1",
          name: "A Goal 1",
          target_date: "2026-03-01",
          priority: 1,
        },
        {
          id: "goal-a2",
          name: "A Goal 2",
          target_date: "2026-03-08",
          priority: 1,
        },
      ],
      starting_ctl: 32,
    });

    expect(projection.goal_assessments?.length).toBe(2);
    expect(
      projection.goal_assessments?.every((goal) => goal.priority === 1),
    ).toBe(true);
    expect(projection.risk_flags ?? []).toContain(
      `feasibility_band_${projection.feasibility_band}`,
    );
  });

  it("scores conflicting multi-target goal deterministically with bounded aggregate score", () => {
    const input: BuildDeterministicProjectionInput = {
      timeline: { start_date: "2026-01-05", end_date: "2026-02-23" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-02-23",
          target_weekly_tss_range: { min: 200, max: 250 },
        },
      ],
      goals: [
        {
          id: "goal-multi",
          name: "Conflicting Goal",
          target_date: "2026-02-23",
          priority: 1,
          targets: [
            {
              target_type: "hr_threshold",
              target_lthr_bpm: 140,
            },
            {
              target_type: "power_threshold",
              target_watts: 420,
              test_duration_s: 1200,
              activity_category: "bike",
            },
          ],
        },
      ],
      starting_ctl: 26,
    };

    const projection = buildDeterministicProjectionPayload(input);
    const replay = buildDeterministicProjectionPayload(input);

    const targetScores = projection.goal_assessments?.[0]?.target_scores ?? [];
    const goalScore =
      projection.goal_assessments?.[0]?.target_scores.reduce(
        (sum, target) => sum + target.score_0_100,
        0,
      ) ?? 0;

    expect(targetScores.length).toBe(2);
    expect(targetScores.map((target) => target.kind).sort()).toEqual([
      "hr_threshold",
      "power_threshold",
    ]);
    expect(goalScore).toBeGreaterThan(0);
    expect(goalScore).toBeLessThanOrEqual(200);
    expect(replay.goal_assessments).toEqual(projection.goal_assessments);
  });

  it("keeps feasible baseline parity between equivalent single-mode configs", () => {
    const base: BuildDeterministicProjectionInput = {
      timeline: { start_date: "2026-01-05", end_date: "2026-01-25" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-01-25",
          target_weekly_tss_range: { min: 280, max: 320 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "Race",
          target_date: "2026-01-25",
          priority: 1,
        },
      ],
      starting_ctl: 35,
    };

    const configA = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
      },
    });
    const configB = buildDeterministicProjectionPayload({
      ...base,
      creation_config: {
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
      },
    });

    expect(configB.points).toEqual(configA.points);
    expect(configB.microcycles).toEqual(configA.microcycles);
    expect(configB.caps_applied).toEqual(configA.caps_applied);
  });

  it("keeps sparse-history realism lower than rich-history baseline", () => {
    const commonInput: Omit<
      BuildDeterministicProjectionInput,
      "no_history_context"
    > = {
      timeline: { start_date: "2026-01-05", end_date: "2026-03-02" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-02",
          target_weekly_tss_range: { min: 140, max: 180 },
        },
      ],
      goals: [
        {
          id: "goal-10k",
          name: "10k",
          target_date: "2026-04-12",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 10000,
              target_time_s: 2520,
              activity_category: "run",
            },
          ],
        },
      ],
      starting_ctl: 24,
    };

    const richHistory = buildDeterministicProjectionPayload({
      ...commonInput,
      no_history_context: {
        history_availability_state: "rich",
        goal_tier: "medium",
        weeks_to_event: 14,
        context_summary: {
          history_availability_state: "rich",
          recent_consistency_marker: "high",
          effort_confidence_marker: "high",
          profile_metric_completeness_marker: "high",
          signal_quality: 0.92,
          recommended_baseline_tss_range: { min: 120, max: 210 },
          recommended_recent_influence_range: { min: -0.1, max: 0.2 },
          recommended_sessions_per_week_range: { min: 5, max: 7 },
          rationale_codes: ["history_rich"],
        },
      },
    });

    const sparseHistory = buildDeterministicProjectionPayload({
      ...commonInput,
      no_history_context: {
        history_availability_state: "sparse",
        goal_tier: "medium",
        weeks_to_event: 14,
        context_summary: {
          history_availability_state: "sparse",
          recent_consistency_marker: "low",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "moderate",
          signal_quality: 0.38,
          recommended_baseline_tss_range: { min: 80, max: 170 },
          recommended_recent_influence_range: { min: -0.4, max: 0.4 },
          recommended_sessions_per_week_range: { min: 3, max: 5 },
          rationale_codes: ["history_sparse"],
        },
      },
    });

    const richFeasibility = richHistory.no_history.projection_feasibility!;
    const sparseFeasibility = sparseHistory.no_history.projection_feasibility!;
    const richWidth =
      (richFeasibility.projection_uncertainty?.tss_high ?? 0) -
      (richFeasibility.projection_uncertainty?.tss_low ?? 0);
    const sparseWidth =
      (sparseFeasibility.projection_uncertainty?.tss_high ?? 0) -
      (sparseFeasibility.projection_uncertainty?.tss_low ?? 0);

    expect(sparseHistory.readiness_score).toBeGreaterThanOrEqual(0);
    expect(sparseHistory.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(sparseHistory.readiness_confidence).toBeLessThanOrEqual(100);
    expect(sparseFeasibility.readiness_score ?? 100).toBeLessThanOrEqual(
      richFeasibility.readiness_score ?? 0,
    );
    expect(sparseWidth).toBeGreaterThan(richWidth);
  });
});
