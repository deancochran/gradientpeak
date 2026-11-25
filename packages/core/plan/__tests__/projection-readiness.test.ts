import { describe, expect, it } from "vitest";
import { computeCapacityEnvelope } from "../projection/capacity-envelope";
import {
  computeCompositeReadiness,
  computeDurabilityScore,
  computePlanningConfidence,
  computeProjectionFeasibilityMetadata,
  computeProjectionPointReadinessScores,
} from "../projection/readiness";

describe("computeProjectionFeasibilityMetadata", () => {
  it("returns high readiness when demand is met with low clamp pressure", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyLoadTarget: 420,
      feasiblePeakWeeklyLoadApplied: 420,
      loadRampClampWeeks: 0,
      longTermLoadRampClampWeeks: 0,
      confidence: 0.85,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("high");
    expect(result.demand_gap.unmet_weekly_load).toBe(0);
    expect(result.projection_uncertainty?.load_likely).toBe(420);
  });

  it("returns lower readiness and limiters when demand exceeds caps", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyLoadTarget: 560,
      feasiblePeakWeeklyLoadApplied: 400,
      loadRampClampWeeks: 6,
      longTermLoadRampClampWeeks: 5,
      confidence: 0.4,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("low");
    expect(result.dominant_limiters).toContain("required_growth_exceeds_caps");
    expect(result.dominant_limiters).toContain("load_ramp_cap_pressure");
    expect(result.dominant_limiters).toContain("longTermLoad_ramp_cap_pressure");
    expect(result.low_readiness_limiter_mode).toBe("timeline_limited");
    expect(result.dominant_limiters).toContain("timeline_limited_goal_too_soon");
    expect(result.readiness_rationale_codes).toContain("readiness_limiter_timeline_limited");
  });

  it("flags low readiness as capacity-limited when demand stays unmet without timeline pressure", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyLoadTarget: 320,
      feasiblePeakWeeklyLoadApplied: 40,
      loadRampClampWeeks: 0,
      longTermLoadRampClampWeeks: 0,
      confidence: 0.78,
      projectionWeeks: 52,
    });

    expect(result.readiness_band).toBe("low");
    expect(result.low_readiness_limiter_mode).toBe("capacity_limited");
    expect(result.dominant_limiters).toContain("capacity_limited_sustainable_capacity");
    expect(result.readiness_rationale_codes).toContain("readiness_limiter_capacity_limited");
  });
});

describe("computeCapacityEnvelope", () => {
  it("lowers envelope score when loads and ramps exceed bounds", () => {
    const realistic = computeCapacityEnvelope({
      weeks: [
        { projected_weekly_load: 220, projected_ramp_pct: 4 },
        { projected_weekly_load: 235, projected_ramp_pct: 6 },
        { projected_weekly_load: 245, projected_ramp_pct: 5 },
      ],
      starting_longTermLoad: 32,
      evidence_state: "rich",
    });
    const unrealistic = computeCapacityEnvelope({
      weeks: [
        { projected_weekly_load: 360, projected_ramp_pct: 24 },
        { projected_weekly_load: 420, projected_ramp_pct: 22 },
        { projected_weekly_load: 480, projected_ramp_pct: 20 },
      ],
      starting_longTermLoad: 32,
      evidence_state: "rich",
    });

    expect(realistic.envelope_score).toBeGreaterThan(unrealistic.envelope_score);
    expect(unrealistic.envelope_score).toBeLessThan(70);
    expect(unrealistic.limiting_factors).toContain("over_high");
    expect(unrealistic.limiting_factors).toContain("over_ramp");
    expect((unrealistic.limiting_factor_scores?.over_high ?? 0) > 0).toBe(true);
  });

  it("changes smoothly for nearby evidence scores and elite-load boundaries", () => {
    const lowerEvidence = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 460, projected_ramp_pct: 6 }],
      starting_longTermLoad: 92,
      evidence_score: 0.59,
    });
    const higherEvidence = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 460, projected_ramp_pct: 6 }],
      starting_longTermLoad: 92,
      evidence_score: 0.61,
    });
    const justBelowElite = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 645, projected_ramp_pct: 7 }],
      starting_longTermLoad: 92,
      evidence_score: 0.75,
    });
    const justAboveElite = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 655, projected_ramp_pct: 7 }],
      starting_longTermLoad: 94,
      evidence_score: 0.75,
    });

    expect(
      Math.abs(higherEvidence.envelope_score - lowerEvidence.envelope_score),
    ).toBeLessThanOrEqual(5);
    expect(
      Math.abs(justAboveElite.envelope_score - justBelowElite.envelope_score),
    ).toBeLessThanOrEqual(5);
  });
});

describe("computeCompositeReadiness", () => {
  it("remains deterministic and bounded", () => {
    const envelope = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 220, projected_ramp_pct: 4 }],
      starting_longTermLoad: 30,
      evidence_state: "sparse",
    });
    const durability = computeDurabilityScore({ weekly_load: [210, 220, 215] });
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

  it("changes readiness confidence smoothly for nearby evidence levels", () => {
    const envelope = computeCapacityEnvelope({
      weeks: [{ projected_weekly_load: 220, projected_ramp_pct: 4 }],
      starting_longTermLoad: 30,
      evidence_state: "rich",
    });

    const lower = computeCompositeReadiness({
      target_attainment_score: 78,
      durability_score: 80,
      evidence_score: 60,
      envelope,
      evidence_state: "sparse",
    });
    const higher = computeCompositeReadiness({
      target_attainment_score: 78,
      durability_score: 80,
      evidence_score: 64,
      envelope,
      evidence_state: "sparse",
    });

    expect(higher.readiness_confidence).toBeGreaterThan(lower.readiness_confidence);
    expect(higher.readiness_confidence - lower.readiness_confidence).toBeLessThanOrEqual(6);
  });
});

describe("computePlanningConfidence", () => {
  it("drops continuously with clamp pressure and unmet demand", () => {
    const strong = computePlanningConfidence({
      evidence_score: 78,
      evidence_state: "rich",
      unmet_ratio: 0.04,
      clamp_pressure: 0.05,
      projection_weeks: 14,
      goal_count: 1,
      adherence_confidence: 0.82,
    });
    const constrained = computePlanningConfidence({
      evidence_score: 78,
      evidence_state: "rich",
      unmet_ratio: 0.18,
      clamp_pressure: 0.24,
      projection_weeks: 14,
      goal_count: 2,
      adherence_confidence: 0.82,
    });

    expect(strong.score).toBeGreaterThan(constrained.score);
    expect(constrained.rationale_codes).toContain("planning_confidence_penalty_clamp_pressure");
  });
});

describe("computeProjectionPointReadinessScores", () => {
  it("keeps point readiness independent of goal priority labels", () => {
    const points = [
      {
        date: "2026-01-05",
        predicted_fitness_longTermLoad: 22,
        predicted_fatigue_recentLoad: 21,
        predicted_form_loadBalance: 1,
      },
      {
        date: "2026-01-12",
        predicted_fitness_longTermLoad: 28,
        predicted_fatigue_recentLoad: 25,
        predicted_form_loadBalance: 3,
      },
      {
        date: "2026-01-19",
        predicted_fitness_longTermLoad: 31,
        predicted_fatigue_recentLoad: 26,
        predicted_form_loadBalance: 5,
      },
      {
        date: "2026-01-26",
        predicted_fitness_longTermLoad: 33,
        predicted_fatigue_recentLoad: 27,
        predicted_form_loadBalance: 6,
      },
    ];

    const highPriority = computeProjectionPointReadinessScores({
      points,
      goals: [
        { target_date: "2026-01-19", priority: 10 },
        { target_date: "2026-01-26", priority: 9 },
      ],
    });

    const lowPriority = computeProjectionPointReadinessScores({
      points,
      goals: [
        { target_date: "2026-01-19", priority: 1 },
        { target_date: "2026-01-26", priority: 0 },
      ],
    });

    expect(highPriority).toEqual(lowPriority);
  });

  it("anchors terminal readiness to plan readiness without globally clipping", () => {
    const scores = computeProjectionPointReadinessScores({
      points: [
        {
          date: "2026-01-05",
          predicted_fitness_longTermLoad: 20,
          predicted_fatigue_recentLoad: 18,
          predicted_form_loadBalance: 2,
        },
        {
          date: "2026-01-12",
          predicted_fitness_longTermLoad: 34,
          predicted_fatigue_recentLoad: 24,
          predicted_form_loadBalance: 10,
        },
        {
          date: "2026-01-19",
          predicted_fitness_longTermLoad: 38,
          predicted_fatigue_recentLoad: 20,
          predicted_form_loadBalance: 18,
        },
      ],
      planReadinessScore: 47,
      goals: [{ target_date: "2026-01-19", priority: 1 }],
    });

    expect(scores.length).toBe(3);
    expect(scores.at(-1)).toBe(47);
    expect(Math.max(...scores)).toBeLessThanOrEqual(47);
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it("does not force non-terminal goal day to equal plan readiness", () => {
    const scores = computeProjectionPointReadinessScores({
      points: [
        {
          date: "2026-01-05",
          predicted_fitness_longTermLoad: 20,
          predicted_fatigue_recentLoad: 22,
          predicted_form_loadBalance: -2,
        },
        {
          date: "2026-01-12",
          predicted_fitness_longTermLoad: 29,
          predicted_fatigue_recentLoad: 26,
          predicted_form_loadBalance: 3,
        },
        {
          date: "2026-01-19",
          predicted_fitness_longTermLoad: 33,
          predicted_fatigue_recentLoad: 24,
          predicted_form_loadBalance: 9,
        },
        {
          date: "2026-01-26",
          predicted_fitness_longTermLoad: 38,
          predicted_fatigue_recentLoad: 27,
          predicted_form_loadBalance: 11,
        },
      ],
      planReadinessScore: 62,
      goals: [{ target_date: "2026-01-12", priority: 1 }],
    });

    expect(scores.length).toBe(4);
    expect(scores[1] ?? 0).toBeLessThan(62);
    expect(scores[3] ?? 0).toBe(62);
  });
});
