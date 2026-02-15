import { describe, expect, it } from "vitest";
import { scoreTargetSatisfaction } from "../scoring/targetSatisfaction";

describe("scoreTargetSatisfaction", () => {
  it("returns full score when race target time is met", () => {
    const result = scoreTargetSatisfaction({
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

    expect(result.score_0_100).toBe(100);
    expect(result.unmet_gap).toBeUndefined();
  });

  it("decays smoothly inside tolerance then sharply outside", () => {
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
    expect(outside.rationale_codes).toContain("beyond_tolerance_decay_sharp");
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

  it("scores all higher-is-better target kinds with smooth then sharp decay", () => {
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
    expect(paceOutside.rationale_codes).toContain(
      "beyond_tolerance_decay_sharp",
    );
    expect(hrInside.score_0_100).toBeGreaterThan(hrOutside.score_0_100);
    expect(hrOutside.rationale_codes).toContain("beyond_tolerance_decay_sharp");
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
});
