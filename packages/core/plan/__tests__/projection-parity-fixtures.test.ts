import { describe, expect, it } from "vitest";
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
      expected: {
        readiness_score: number;
        readiness_confidence: number;
        envelope_score: number;
        first_weeks: number[];
      };
    }> = [
      {
        key: "balanced_default",
        calibration: undefined,
        expected: {
          readiness_score: 63,
          readiness_confidence: 39,
          envelope_score: 96,
          first_weeks: [230, 238, 262.2, 231.6],
        },
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
        expected: {
          readiness_score: 41,
          readiness_confidence: 39,
          envelope_score: 94,
          first_weeks: [230, 238, 262.2, 231.6],
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
        expected: {
          readiness_score: 62,
          readiness_confidence: 39,
          envelope_score: 98,
          first_weeks: [230, 238, 262.2, 231.6],
        },
      },
    ];

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
      expect({
        readiness_score: runA.readiness_score,
        readiness_confidence: runA.readiness_confidence,
        envelope_score: runA.capacity_envelope?.envelope_score,
        first_weeks: runA.microcycles
          .slice(0, 4)
          .map((week) => week.planned_weekly_tss),
      }).toEqual(preset.expected);
    }
  });
});
