import { describe, expect, it } from "vitest";
import { scoreTargetSatisfaction } from "../scoring/targetSatisfaction";

describe("scoreTargetSatisfaction", () => {
  it("scores met race targets favorably versus miss cases with distribution utility", () => {
    const met = scoreTargetSatisfaction({
      target: {
        target_type: "race_performance",
        distance_m: 10000,
        target_time_s: 2400,
        activity_category: "run",
      },
      projection: {
        projected_race_time_s: 2380,
      },
    });

    const miss = scoreTargetSatisfaction({
      target: {
        target_type: "race_performance",
        distance_m: 10000,
        target_time_s: 2400,
        activity_category: "run",
      },
      projection: {
        projected_race_time_s: 2460,
      },
    });

    expect(met.score_0_100).toBeGreaterThan(50);
    expect(met.score_0_100).toBeGreaterThan(miss.score_0_100);
    expect(met.unmet_gap).toBeUndefined();
    expect(miss.unmet_gap).toBeGreaterThan(0);
    expect(met.rationale_codes).toContain("distribution_attainment_utility");
    expect(met.rationale_codes).toContain("target_met_or_exceeded_on_mean");
    expect(miss.rationale_codes).toContain("target_unmet_on_mean");
  });

  it("decreases attainment utility as the projected gap grows", () => {
    const target = {
      target_type: "power_threshold" as const,
      target_watts: 300,
      test_duration_s: 1200,
      activity_category: "bike" as const,
    };
    const inside = scoreTargetSatisfaction({
      target,
      projection: { projected_power_watts: 292 },
    });
    const outside = scoreTargetSatisfaction({
      target,
      projection: { projected_power_watts: 260 },
    });

    expect(inside.score_0_100).toBeGreaterThan(outside.score_0_100);
    expect(outside.rationale_codes).toContain("target_unmet_on_mean");
  });

  it("is monotonic for harder race targets with fixed projection", () => {
    const easier = scoreTargetSatisfaction({
      target: {
        target_type: "race_performance",
        distance_m: 42195,
        target_time_s: 12600,
        activity_category: "run",
      },
      projection: {
        projected_race_time_s: 13000,
      },
    });
    const harder = scoreTargetSatisfaction({
      target: {
        target_type: "race_performance",
        distance_m: 42195,
        target_time_s: 12000,
        activity_category: "run",
      },
      projection: {
        projected_race_time_s: 13000,
      },
    });

    expect(harder.score_0_100).toBeLessThanOrEqual(easier.score_0_100);
  });

  it("scores higher-is-better target kinds with monotonic distribution decay", () => {
    const paceInside = scoreTargetSatisfaction({
      target: {
        target_type: "pace_threshold",
        target_speed_mps: 4.2,
        test_duration_s: 1200,
        activity_category: "run",
      },
      projection: {
        projected_speed_mps: 4.1,
      },
    });
    const paceOutside = scoreTargetSatisfaction({
      target: {
        target_type: "pace_threshold",
        target_speed_mps: 4.2,
        test_duration_s: 1200,
        activity_category: "run",
      },
      projection: {
        projected_speed_mps: 3.7,
      },
    });

    const hrInside = scoreTargetSatisfaction({
      target: {
        target_type: "hr_threshold",
        target_lthr_bpm: 170,
      },
      projection: {
        projected_lthr_bpm: 168,
      },
    });
    const hrOutside = scoreTargetSatisfaction({
      target: {
        target_type: "hr_threshold",
        target_lthr_bpm: 170,
      },
      projection: {
        projected_lthr_bpm: 160,
      },
    });

    expect(paceInside.score_0_100).toBeGreaterThan(paceOutside.score_0_100);
    expect(paceOutside.rationale_codes).toContain("target_unmet_on_mean");
    expect(hrInside.score_0_100).toBeGreaterThan(hrOutside.score_0_100);
    expect(hrOutside.rationale_codes).toContain("target_unmet_on_mean");
  });

  it("is monotonic for harder higher-is-better targets with fixed projection", () => {
    const powerTargets = [260, 280, 300, 320];
    const powerScores = powerTargets.map(
      (watts) =>
        scoreTargetSatisfaction({
          target: {
            target_type: "power_threshold",
            target_watts: watts,
            test_duration_s: 1200,
            activity_category: "bike",
          },
          projection: {
            projected_power_watts: 290,
          },
        }).score_0_100,
    );

    for (let index = 1; index < powerScores.length; index += 1) {
      expect(powerScores[index] ?? 100).toBeLessThanOrEqual(
        powerScores[index - 1] ?? 0,
      );
    }
  });

  it("uses inferred readiness distributions when direct projections are missing", () => {
    const result = scoreTargetSatisfaction({
      target: {
        target_type: "power_threshold",
        target_watts: 300,
        test_duration_s: 1200,
        activity_category: "bike",
      },
      projection: {
        readiness_score: 72,
        readiness_confidence: 0.45,
      },
    });

    expect(result.rationale_codes).toContain(
      "projection_inferred_from_readiness",
    );
    expect(result.score_0_100).toBeGreaterThanOrEqual(0);
    expect(result.score_0_100).toBeLessThanOrEqual(100);
  });

  it("applies strong demand penalties for implausible above-cap targets", () => {
    const result = scoreTargetSatisfaction({
      target: {
        target_type: "pace_threshold",
        target_speed_mps: 9,
        test_duration_s: 1200,
        activity_category: "run",
      },
      projection: {
        projected_speed_mps: 8.8,
        readiness_confidence: 0.9,
      },
    });

    expect(result.rationale_codes).toContain(
      "target_demand_above_plausible_cap",
    );
    expect(result.score_0_100).toBeLessThan(70);
  });

  it("includes normalized target weight in result", () => {
    const result = scoreTargetSatisfaction({
      target: {
        target_type: "hr_threshold",
        target_lthr_bpm: 170,
        weight: 2.5,
      },
      projection: {
        projected_lthr_bpm: 171,
      },
    });

    expect(result.target_weight).toBe(2.5);
  });
});
