import { describe, expect, it } from "vitest";
import { computeCapacityEnvelope } from "../projection/capacity-envelope";
import {
  computeCompositeReadiness,
  computeDurabilityScore,
  computeProjectionFeasibilityMetadata,
  computeProjectionPointReadinessScores,
} from "../projection/readiness";

describe("computeProjectionFeasibilityMetadata", () => {
  it("returns high readiness when demand is met with low clamp pressure", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyTssTarget: 420,
      feasiblePeakWeeklyTssApplied: 420,
      tssRampClampWeeks: 0,
      ctlRampClampWeeks: 0,
      confidence: 0.85,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("high");
    expect(result.demand_gap.unmet_weekly_tss).toBe(0);
    expect(result.projection_uncertainty?.tss_likely).toBe(420);
  });

  it("returns lower readiness and limiters when demand exceeds caps", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyTssTarget: 560,
      feasiblePeakWeeklyTssApplied: 400,
      tssRampClampWeeks: 6,
      ctlRampClampWeeks: 5,
      confidence: 0.4,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("low");
    expect(result.dominant_limiters).toContain("required_growth_exceeds_caps");
    expect(result.dominant_limiters).toContain("tss_ramp_cap_pressure");
    expect(result.dominant_limiters).toContain("ctl_ramp_cap_pressure");
  });
});

describe("computeCapacityEnvelope", () => {
  it("lowers envelope score when loads and ramps exceed bounds", () => {
    const realistic = computeCapacityEnvelope({
      weeks: [
        { projected_weekly_tss: 220, projected_ramp_pct: 4 },
        { projected_weekly_tss: 235, projected_ramp_pct: 6 },
        { projected_weekly_tss: 245, projected_ramp_pct: 5 },
      ],
      starting_ctl: 32,
      evidence_state: "rich",
    });
    const unrealistic = computeCapacityEnvelope({
      weeks: [
        { projected_weekly_tss: 360, projected_ramp_pct: 24 },
        { projected_weekly_tss: 420, projected_ramp_pct: 22 },
        { projected_weekly_tss: 480, projected_ramp_pct: 20 },
      ],
      starting_ctl: 32,
      evidence_state: "rich",
    });

    expect(realistic.envelope_score).toBeGreaterThan(
      unrealistic.envelope_score,
    );
    expect(unrealistic.envelope_state).toBe("outside");
    expect(unrealistic.limiting_factors).toContain("over_high");
    expect(unrealistic.limiting_factors).toContain("over_ramp");
  });
});

describe("computeCompositeReadiness", () => {
  it("remains deterministic and bounded", () => {
    const envelope = computeCapacityEnvelope({
      weeks: [{ projected_weekly_tss: 220, projected_ramp_pct: 4 }],
      starting_ctl: 30,
      evidence_state: "sparse",
    });
    const durability = computeDurabilityScore({ weekly_tss: [210, 220, 215] });
    const first = computeCompositeReadiness({
      target_attainment_score: 78,
      durability_score: durability,
      evidence_score: 64,
      envelope,
      evidence_state: "sparse",
    });
    const second = computeCompositeReadiness({
      target_attainment_score: 78,
      durability_score: durability,
      evidence_score: 64,
      envelope,
      evidence_state: "sparse",
    });

    expect(first).toEqual(second);
    expect(first.readiness_score).toBeGreaterThanOrEqual(0);
    expect(first.readiness_score).toBeLessThanOrEqual(100);
    expect(first.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(first.readiness_confidence).toBeLessThanOrEqual(100);
  });
});

describe("computeProjectionPointReadinessScores", () => {
  it("caps timeline readiness at plan readiness when provided", () => {
    const scores = computeProjectionPointReadinessScores({
      points: [
        {
          date: "2026-01-05",
          predicted_fitness_ctl: 20,
          predicted_fatigue_atl: 18,
          predicted_form_tsb: 2,
        },
        {
          date: "2026-01-12",
          predicted_fitness_ctl: 34,
          predicted_fatigue_atl: 24,
          predicted_form_tsb: 10,
        },
        {
          date: "2026-01-19",
          predicted_fitness_ctl: 38,
          predicted_fatigue_atl: 20,
          predicted_form_tsb: 18,
        },
      ],
      planReadinessScore: 47,
      goals: [{ target_date: "2026-01-19", priority: 1 }],
    });

    expect(scores.length).toBe(3);
    expect(Math.max(...scores)).toBeLessThanOrEqual(47);
    expect(scores[2]).toBe(47);
  });
});
