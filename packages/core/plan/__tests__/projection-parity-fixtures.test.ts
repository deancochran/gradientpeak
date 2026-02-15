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
});
