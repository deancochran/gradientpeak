import { describe, expect, it } from "vitest";
import { scoreTargetSatisfaction } from "../scoring/targetSatisfaction";

interface CalibrationCase {
  targetTimeSeconds: number;
  projectedTimeSeconds: number;
  observedAttained: 0 | 1;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("target attainment calibration", () => {
  it("keeps predicted attainment distributions directionally calibrated against observed outcomes", () => {
    const cases: CalibrationCase[] = [
      {
        targetTimeSeconds: 2520,
        projectedTimeSeconds: 2490,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 2520,
        projectedTimeSeconds: 2510,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 2520,
        projectedTimeSeconds: 2535,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 2520,
        projectedTimeSeconds: 2555,
        observedAttained: 0,
      },
      {
        targetTimeSeconds: 10800,
        projectedTimeSeconds: 10680,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 10800,
        projectedTimeSeconds: 10820,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 10800,
        projectedTimeSeconds: 10920,
        observedAttained: 0,
      },
      {
        targetTimeSeconds: 10800,
        projectedTimeSeconds: 11100,
        observedAttained: 0,
      },
      {
        targetTimeSeconds: 4200,
        projectedTimeSeconds: 4175,
        observedAttained: 1,
      },
      {
        targetTimeSeconds: 4200,
        projectedTimeSeconds: 4230,
        observedAttained: 0,
      },
      {
        targetTimeSeconds: 4200,
        projectedTimeSeconds: 4260,
        observedAttained: 0,
      },
      {
        targetTimeSeconds: 4200,
        projectedTimeSeconds: 4300,
        observedAttained: 0,
      },
    ];

    const predictions = cases.map((sample) => {
      const scored = scoreTargetSatisfaction({
        target: {
          target_type: "race_performance",
          distance_m: 10000,
          target_time_s: sample.targetTimeSeconds,
          activity_category: "run",
        },
        projection: {
          projected_race_time_s: sample.projectedTimeSeconds,
          readiness_confidence: 0.72,
        },
      });

      return {
        predictedProbability: scored.score_0_100 / 100,
        observed: sample.observedAttained,
      };
    });

    const observedRate =
      predictions.reduce((sum, sample) => sum + sample.observed, 0) /
      predictions.length;

    const brierScore = mean(
      predictions.map(({ predictedProbability, observed }) =>
        Math.pow(predictedProbability - observed, 2),
      ),
    );

    const baselineBrierScore = mean(
      predictions.map(({ observed }) => Math.pow(observedRate - observed, 2)),
    );

    expect(brierScore).toBeLessThan(baselineBrierScore);

    const ranked = [...predictions].sort(
      (left, right) => left.predictedProbability - right.predictedProbability,
    );
    const quartileSize = Math.max(1, Math.floor(ranked.length / 4));
    const lowQuartile = ranked.slice(0, quartileSize);
    const highQuartile = ranked.slice(-quartileSize);

    expect(
      mean(highQuartile.map((sample) => sample.observed)),
    ).toBeGreaterThanOrEqual(
      mean(lowQuartile.map((sample) => sample.observed)),
    );
  });
});
