import { describe, expect, it } from "vitest";
import { buildProjectionEngineInput, deterministicUuidFromSeed } from "../..";
import { buildDeterministicProjectionPayload } from "../projection/engine";

describe("projection parity fixtures", () => {
  it("keeps deterministic fixture output stable", () => {
    const result = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-01-25",
      },
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
    });

    expect(result.points.slice(0, 3).map((point) => point.date)).toEqual([
      "2026-01-11",
      "2026-01-18",
      "2026-01-25",
    ]);
    expect(
      result.points.slice(0, 3).every((point) => point.readiness_score >= 0),
    ).toBe(true);
    expect(
      result.points.slice(0, 3).every((point) => point.readiness_score <= 100),
    ).toBe(true);

    expect(result.constraint_summary).toEqual({
      normalized_creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 5,
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
        learned_ramp_rate: {
          max_safe_ramp_rate: 40,
          confidence: "low",
          source: "default",
        },
      },
      tss_ramp_clamp_weeks: 0,
      ctl_ramp_clamp_weeks: 0,
      recovery_weeks: 0,
      starting_state: {
        starting_ctl: 35,
        starting_atl: 35,
        starting_tsb: 0,
        starting_state_is_prior: false,
      },
    });

    expect(result.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(result.readiness_confidence).toBeLessThanOrEqual(100);
    expect(result.capacity_envelope?.envelope_score).toBeGreaterThanOrEqual(0);
    expect(result.capacity_envelope?.envelope_score).toBeLessThanOrEqual(100);
    expect(result.readiness_rationale_codes?.length ?? 0).toBeGreaterThan(0);

    const peakReadiness = Math.max(
      ...result.points.map((point) => point.readiness_score),
    );
    const goalDateReadiness =
      result.points.find((point) => point.date === "2026-01-25")
        ?.readiness_score ?? 0;
    expect(goalDateReadiness).toBe(peakReadiness);
  });

  it("keeps calibration preset golden fixtures deterministic", () => {
    const baseInput: Parameters<typeof buildDeterministicProjectionPayload>[0] =
      {
        timeline: {
          start_date: "2026-01-05",
          end_date: "2026-03-15",
        },
        blocks: [
          {
            name: "Build",
            phase: "build",
            start_date: "2026-01-05",
            end_date: "2026-03-15",
            target_weekly_tss_range: { min: 220, max: 280 },
          },
        ],
        goals: [
          {
            id: "goal-1",
            name: "Spring Half",
            target_date: "2026-03-15",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 21097,
                target_time_s: 5700,
                activity_category: "run",
              },
            ],
          },
        ],
        starting_ctl: 32,
        creation_config: {
          optimization_profile: "balanced",
          max_weekly_tss_ramp_pct: 7,
          max_ctl_ramp_per_week: 3,
        },
      };

    const presets: Array<{
      key: string;
      calibration: NonNullable<typeof baseInput.creation_config>["calibration"];
    }> = [
      {
        key: "balanced_default",
        calibration: undefined,
      },
      {
        key: "conservative_durability",
        calibration: {
          readiness_composite: {
            target_attainment_weight: 0.35,
            envelope_weight: 0.35,
            durability_weight: 0.2,
            evidence_weight: 0.1,
          },
          readiness_timeline: {
            target_tsb: 10,
            form_tolerance: 16,
            fatigue_overflow_scale: 0.65,
            feasibility_blend_weight: 0.25,
            smoothing_iterations: 30,
            smoothing_lambda: 0.34,
            max_step_delta: 6,
          },
          envelope_penalties: {
            over_high_weight: 0.9,
            under_low_weight: 0.3,
            over_ramp_weight: 0.55,
          },
          durability_penalties: {
            monotony_threshold: 1.6,
            monotony_scale: 2.8,
            strain_threshold: 800,
            strain_scale: 700,
            deload_debt_scale: 8,
          },
          no_history: {
            reliability_horizon_days: 56,
            confidence_floor_high: 0.82,
            confidence_floor_mid: 0.68,
            confidence_floor_low: 0.5,
            demand_tier_time_pressure_scale: 0.85,
          },
          optimizer: {
            preparedness_weight: 11,
            risk_penalty_weight: 0.65,
            volatility_penalty_weight: 0.5,
            churn_penalty_weight: 0.45,
            lookahead_weeks: 4,
            candidate_steps: 6,
          },
        },
      },
      {
        key: "aggressive_target_attainment",
        calibration: {
          readiness_composite: {
            target_attainment_weight: 0.62,
            envelope_weight: 0.2,
            durability_weight: 0.1,
            evidence_weight: 0.08,
          },
          readiness_timeline: {
            target_tsb: 4,
            form_tolerance: 28,
            fatigue_overflow_scale: 0.2,
            feasibility_blend_weight: 0.05,
            smoothing_iterations: 12,
            smoothing_lambda: 0.16,
            max_step_delta: 14,
          },
          envelope_penalties: {
            over_high_weight: 0.35,
            under_low_weight: 0.1,
            over_ramp_weight: 0.12,
          },
          durability_penalties: {
            monotony_threshold: 2.8,
            monotony_scale: 1.2,
            strain_threshold: 1200,
            strain_scale: 1400,
            deload_debt_scale: 3,
          },
          no_history: {
            reliability_horizon_days: 28,
            confidence_floor_high: 0.7,
            confidence_floor_mid: 0.5,
            confidence_floor_low: 0.3,
            demand_tier_time_pressure_scale: 1.25,
          },
          optimizer: {
            preparedness_weight: 22,
            risk_penalty_weight: 0.18,
            volatility_penalty_weight: 0.12,
            churn_penalty_weight: 0.1,
            lookahead_weeks: 7,
            candidate_steps: 11,
          },
        },
      },
    ];

    const byPreset = new Map<
      string,
      {
        readiness_score: number;
        readiness_confidence: number;
        envelope_score: number;
        first_weeks: number[];
      }
    >();

    for (const preset of presets) {
      const runA = buildDeterministicProjectionPayload({
        ...baseInput,
        creation_config: {
          ...baseInput.creation_config,
          calibration: preset.calibration,
        },
      });
      const runB = buildDeterministicProjectionPayload({
        ...baseInput,
        creation_config: {
          ...baseInput.creation_config,
          calibration: preset.calibration,
        },
      });

      expect(runB).toEqual(runA);
      const observed = {
        readiness_score: runA.readiness_score,
        readiness_confidence: runA.readiness_confidence,
        envelope_score: runA.capacity_envelope?.envelope_score,
        first_weeks: runA.microcycles
          .slice(0, 4)
          .map((week) => week.planned_weekly_tss),
      };

      expect(observed.readiness_score).toBeGreaterThanOrEqual(0);
      expect(observed.readiness_score).toBeLessThanOrEqual(100);
      expect(observed.readiness_confidence).toBeGreaterThanOrEqual(0);
      expect(observed.readiness_confidence).toBeLessThanOrEqual(100);
      expect(observed.envelope_score).toBeGreaterThanOrEqual(0);
      expect(observed.envelope_score).toBeLessThanOrEqual(100);
      expect(observed.first_weeks).toHaveLength(4);
      expect(observed.first_weeks.every((week) => week >= 0)).toBe(true);

      byPreset.set(preset.key, {
        readiness_score: observed.readiness_score,
        readiness_confidence: observed.readiness_confidence ?? 0,
        envelope_score: observed.envelope_score ?? 0,
        first_weeks: observed.first_weeks,
      });
    }

    const balanced = byPreset.get("balanced_default")!;
    const conservative = byPreset.get("conservative_durability")!;
    const aggressive = byPreset.get("aggressive_target_attainment")!;

    expect(conservative.readiness_score).toBeLessThanOrEqual(
      balanced.readiness_score,
    );
    expect(aggressive.readiness_score).toBeGreaterThanOrEqual(
      balanced.readiness_score,
    );
    expect(conservative.first_weeks).toEqual(balanced.first_weeks);
    expect(aggressive.first_weeks).toEqual(balanced.first_weeks);
  });

  it("keeps local-preview and server recompute payload assembly in parity for low/sparse/rich/no-history fixtures", () => {
    const fixtures: Array<{
      key: "low" | "sparse" | "rich" | "no-history";
      input: any;
    }> = [
      {
        key: "low",
        input: {
          expanded_plan: {
            start_date: "2026-01-05",
            end_date: "2026-03-15",
            blocks: [
              {
                name: "Base",
                phase: "base",
                start_date: "2026-01-05",
                end_date: "2026-03-15",
                target_weekly_tss_range: { min: 150, max: 190 },
              },
            ],
            goals: [
              {
                id: "goal-low",
                name: "Low fixture goal",
                target_date: "2026-03-15",
                priority: 1,
              },
            ],
          },
          starting_ctl: 16,
          starting_atl: 19,
          normalized_creation_config: {
            optimization_profile: "sustainable",
            post_goal_recovery_days: 7,
            behavior_controls_v1: {
              aggressiveness: 0.2,
              variability: 0.25,
              spike_frequency: 0.15,
              shape_target: -0.2,
              shape_strength: 0.25,
              recovery_priority: 0.85,
              starting_fitness_confidence: 0.45,
            },
          },
        },
      },
      {
        key: "sparse",
        input: {
          expanded_plan: {
            start_date: "2026-01-05",
            end_date: "2026-04-05",
            blocks: [
              {
                name: "Build",
                phase: "build",
                start_date: "2026-01-05",
                end_date: "2026-04-05",
                target_weekly_tss_range: { min: 210, max: 260 },
              },
            ],
            goals: [
              {
                id: "goal-sparse",
                name: "Sparse fixture goal",
                target_date: "2026-04-05",
                priority: 1,
              },
            ],
          },
          starting_ctl: 33,
          starting_atl: 36,
          normalized_creation_config: {
            optimization_profile: "balanced",
            post_goal_recovery_days: 5,
            behavior_controls_v1: {
              aggressiveness: 0.45,
              variability: 0.45,
              spike_frequency: 0.35,
              shape_target: 0,
              shape_strength: 0.35,
              recovery_priority: 0.6,
              starting_fitness_confidence: 0.6,
            },
          },
        },
      },
      {
        key: "rich",
        input: {
          expanded_plan: {
            start_date: "2026-01-05",
            end_date: "2026-05-03",
            blocks: [
              {
                name: "Build",
                phase: "build",
                start_date: "2026-01-05",
                end_date: "2026-05-03",
                target_weekly_tss_range: { min: 260, max: 340 },
              },
            ],
            goals: [
              {
                id: "goal-rich",
                name: "Rich fixture goal",
                target_date: "2026-05-03",
                priority: 1,
              },
            ],
          },
          starting_ctl: 58,
          starting_atl: 62,
          normalized_creation_config: {
            optimization_profile: "outcome_first",
            post_goal_recovery_days: 3,
            behavior_controls_v1: {
              aggressiveness: 0.8,
              variability: 0.75,
              spike_frequency: 0.75,
              shape_target: 0.25,
              shape_strength: 0.8,
              recovery_priority: 0.25,
              starting_fitness_confidence: 0.8,
            },
          },
        },
      },
      {
        key: "no-history",
        input: {
          expanded_plan: {
            start_date: "2026-01-05",
            end_date: "2026-09-06",
            blocks: [
              {
                name: "Build",
                phase: "build",
                start_date: "2026-01-05",
                end_date: "2026-09-06",
                target_weekly_tss_range: { min: 220, max: 280 },
              },
            ],
            goals: [
              {
                id: "goal-none",
                name: "No history fixture goal",
                target_date: "2026-09-06",
                priority: 1,
                targets: [
                  {
                    target_type: "race_performance",
                    distance_m: 42195,
                    target_time_s: 11100,
                    activity_category: "run",
                  },
                ],
              },
            ],
          },
          no_history_context: {
            history_availability_state: "none",
            weeks_to_event: 35,
            goal_targets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: 11100,
              },
            ],
          },
          normalized_creation_config: {
            optimization_profile: "balanced",
            post_goal_recovery_days: 5,
            behavior_controls_v1: {
              aggressiveness: 0.45,
              variability: 0.45,
              spike_frequency: 0.35,
              shape_target: 0,
              shape_strength: 0.35,
              recovery_priority: 0.6,
              starting_fitness_confidence: 0.6,
            },
          },
        },
      },
    ];

    for (const fixture of fixtures) {
      const localPath = buildLocalPreviewPathLike(fixture.input);
      const serverPath = buildServerRecomputePathLike(fixture.input);
      const tolerance = 0.05;

      const localDates = localPath.points.map((point) => point.date);
      expect(localDates).toEqual(
        [...localDates].sort((a, b) => a.localeCompare(b)),
      );
      expect(serverPath.points.map((point) => point.date)).toEqual(localDates);

      for (let i = 0; i < localPath.points.length; i += 1) {
        const localPoint = localPath.points[i]!;
        const serverPoint = serverPath.points[i]!;

        expect(localPoint.date, `${fixture.key} point ${i} date`).toBe(
          serverPoint.date,
        );
        expect(
          Math.abs(localPoint.readiness_score - serverPoint.readiness_score),
          `${fixture.key} point ${i} readiness_score`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(
            localPoint.predicted_load_tss - serverPoint.predicted_load_tss,
          ),
          `${fixture.key} point ${i} predicted_load_tss`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(
            localPoint.predicted_fatigue_atl -
              serverPoint.predicted_fatigue_atl,
          ),
          `${fixture.key} point ${i} predicted_fatigue_atl`,
        ).toBeLessThanOrEqual(tolerance);
      }

      expect(localPath.constraint_summary).toEqual(
        serverPath.constraint_summary,
      );
      expect(localPath.goal_markers).toEqual(serverPath.goal_markers);
      expect(localPath.readiness_score).toBeCloseTo(
        serverPath.readiness_score,
        4,
      );
      expect(serverPath.readiness_confidence).toBeDefined();
      expect(localPath.readiness_confidence).toBeCloseTo(
        serverPath.readiness_confidence ?? 0,
        4,
      );
    }
  });
});

function buildLocalPreviewPathLike(
  input: Parameters<typeof buildProjectionEngineInput>[0],
) {
  return buildDeterministicProjectionPayload(buildProjectionEngineInput(input));
}

function buildServerRecomputePathLike(
  input: Parameters<typeof buildProjectionEngineInput>[0],
) {
  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput(input),
  );

  const expandedPlan = input.expanded_plan;

  return {
    ...deterministicProjection,
    periodization_phases: expandedPlan.blocks.map((block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_min:
        Math.round((block.target_weekly_tss_range?.min ?? 0) * 10) / 10,
      target_weekly_tss_max:
        Math.round((block.target_weekly_tss_range?.max ?? 0) * 10) / 10,
    })),
    microcycles: deterministicProjection.microcycles.map((microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    })),
  };
}
