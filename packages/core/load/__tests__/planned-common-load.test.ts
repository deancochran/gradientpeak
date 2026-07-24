import { describe, expect, it } from "vitest";
import { adaptPlannedCommonLoadDoses, type PlannedCommonLoadDose } from "../planned-common-load";

const computedAsOf = "2026-07-23T12:00:00.000Z";

function dose(
  sport: "bike" | "run" | "swim",
  method: "power_threshold" | "run_pace_threshold" | "swim_pace_threshold",
  thresholdType: "ftp_watts" | "threshold_speed_mps" | "swim_threshold_speed_mps",
  target: PlannedCommonLoadDose["target"],
): PlannedCommonLoadDose {
  const speed = thresholdType !== "ftp_watts";
  return {
    sport,
    durationSeconds: 1_200,
    target,
    method,
    quality: {
      source: "manual",
      observed_at: "2026-07-01T00:00:00.000Z",
      valid_at: "2026-07-01T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: null,
      evidence_fingerprint: `${sport}-threshold`,
    },
    thresholdEvidence: {
      type: thresholdType,
      value: speed ? 4 : 250,
      unit: speed ? "meters_per_second" : "watts",
      source: "manual",
      observedAt: "2026-07-01T00:00:00.000Z",
      validAt: "2026-07-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: null,
      sourceFingerprint: `${sport}-threshold`,
    } as PlannedCommonLoadDose["thresholdEvidence"],
    evidenceFingerprint: `${sport}-planned-dose`,
  };
}

describe("adaptPlannedCommonLoadDoses", () => {
  it("adapts timed bike, run, and swim doses and combines their common Load", () => {
    const result = adaptPlannedCommonLoadDoses({
      computedAsOf,
      doses: [
        dose("bike", "power_threshold", "ftp_watts", {
          type: "percent_threshold",
          thresholdRatio: 1,
        }),
        dose("run", "run_pace_threshold", "threshold_speed_mps", {
          type: "speed_mps",
          value: 4,
        }),
        dose("swim", "swim_pace_threshold", "swim_threshold_speed_mps", {
          type: "speed_mps",
          value: 4,
        }),
      ],
    });
    expect(result.aggregate.status).toBe("complete");
    if (result.aggregate.status === "unavailable") throw new Error("Expected complete aggregate");
    expect(result.aggregate.load).toBeCloseTo(100, 12);
    expect(result.aggregate.intensity).toBeCloseTo(1, 12);
  });

  it("does not turn an untimed dose into zero", () => {
    const input = dose("bike", "power_threshold", "ftp_watts", {
      type: "power_watts",
      value: 200,
    });
    const result = adaptPlannedCommonLoadDoses({
      computedAsOf,
      doses: [{ ...input, durationSeconds: null }],
    });
    expect(result.doses[0]).toMatchObject({ status: "unavailable", reason: "duration_missing" });
    expect(result.aggregate).toMatchObject({ status: "unavailable", reason: "no_load_data" });
  });

  it.each([
    [0.75, "available", 0.75],
    [1.5, "available", 1.5],
    [1.51, "intensity_out_of_range", null],
    [75, "intensity_out_of_range", null],
  ] as const)("uses the percent-threshold ratio %s without clamping or reinterpreting it", (thresholdRatio, expectedStatus, expectedIntensity) => {
    const result = adaptPlannedCommonLoadDoses({
      computedAsOf,
      doses: [
        dose("bike", "power_threshold", "ftp_watts", {
          type: "percent_threshold",
          thresholdRatio,
        }),
      ],
    });
    const [resultDose] = result.doses;

    expect(resultDose).toBeDefined();
    expect(resultDose?.status).toBe(expectedStatus === "available" ? "available" : "unavailable");
    if (expectedStatus === "available") {
      expect(resultDose).toMatchObject({ status: "available", intensity: expectedIntensity });
    } else {
      expect(resultDose).toMatchObject({
        status: "unavailable",
        reason: "intensity_out_of_range",
      });
    }
  });
});
