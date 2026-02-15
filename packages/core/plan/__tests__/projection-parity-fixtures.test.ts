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

    expect(result.points.slice(0, 3)).toEqual([
      {
        date: "2026-01-11",
        predicted_load_tss: 276,
        predicted_fitness_ctl: 36.3,
        predicted_fatigue_atl: 38.8,
        predicted_form_tsb: -2.6,
        readiness_score: 73,
      },
      {
        date: "2026-01-18",
        predicted_load_tss: 257,
        predicted_fitness_ctl: 36.4,
        predicted_fatigue_atl: 37,
        predicted_form_tsb: -0.6,
        readiness_score: 79,
      },
      {
        date: "2026-01-25",
        predicted_load_tss: 224.8,
        predicted_fitness_ctl: 35.2,
        predicted_fatigue_atl: 32.8,
        predicted_form_tsb: 2.4,
        readiness_score: 85,
      },
    ]);

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

    expect(result.no_history.projection_feasibility?.readiness_band).toBe(
      "high",
    );
    expect(result.no_history.projection_feasibility?.readiness_score).toBe(91);

    const peakReadiness = Math.max(
      ...result.points.map((point) => point.readiness_score),
    );
    const goalDateReadiness =
      result.points.find((point) => point.date === "2026-01-25")
        ?.readiness_score ?? 0;
    expect(goalDateReadiness).toBe(peakReadiness);
  });
});
