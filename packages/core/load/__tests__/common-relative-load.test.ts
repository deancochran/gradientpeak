import {
  aggregateCommonLoad as aggregateFromRoot,
  commonLoadResultSchema as resultSchemaFromRoot,
} from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadMethod,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
} from "../index";

const computedAsOf = "2026-07-21T12:00:00.000Z";

const thresholdByMethod = {
  power_threshold: { type: "ftp_watts", value: 250, unit: "watts" },
  critical_power_threshold: { type: "critical_power_watts", value: 260, unit: "watts" },
  run_pace_threshold: {
    type: "threshold_speed_mps",
    value: 4,
    unit: "meters_per_second",
  },
  swim_pace_threshold: {
    type: "swim_threshold_speed_mps",
    value: 1.4,
    unit: "meters_per_second",
  },
  heart_rate_zones: { type: "lthr_bpm", value: 170, unit: "beats_per_minute" },
} as const;

const sportByMethod = {
  power_threshold: "bike",
  critical_power_threshold: "bike",
  run_pace_threshold: "run",
  swim_pace_threshold: "swim",
  heart_rate_zones: "run",
} as const;

function metadata(method: CommonLoadMethod = "power_threshold") {
  return {
    sport: sportByMethod[method],
    method,
    quality: {
      source: "validated_test" as const,
      observed_at: "2026-07-20T12:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: `quality-${method}`,
    },
    thresholdEvidence: {
      ...thresholdByMethod[method],
      source: "validated_test" as const,
      observedAt: "2026-07-20T12:00:00.000Z",
      validAt: "2026-07-20T12:00:00.000Z",
      freshness: "current" as const,
      calculationVersion: "threshold-v1",
      sourceFingerprint: `threshold-${method}`,
    },
    evidenceFingerprint: `activity-${method}`,
    computedAsOf,
    estimated: false,
  };
}

function available(
  durationSeconds: number,
  intensity: number,
  method: CommonLoadMethod = "power_threshold",
): CommonLoadResult {
  return calculateAvailableCommonLoad({
    ...metadata(method),
    contributingDurationSeconds: durationSeconds,
    intensity,
  });
}

function partial(options: {
  load: number | null;
  intensity: number | null;
  durationSeconds?: number;
  eligibleDurationSeconds?: number;
  sourceTimeCoverage?: number;
}): CommonLoadResult {
  const provenance = metadata("run_pace_threshold");
  const { estimated: _estimated, ...retainedProvenance } = provenance;
  const {
    load,
    intensity,
    durationSeconds = 1800,
    sourceTimeCoverage = 0.5,
    eligibleDurationSeconds = sourceTimeCoverage === 0
      ? 3600
      : durationSeconds / sourceTimeCoverage,
  } = options;
  return commonLoadResultSchema.parse({
    status: "partial",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    ...retainedProvenance,
    load,
    intensity,
    contributingDurationSeconds: durationSeconds,
    eligibleDurationSeconds,
    sourceTimeCoverage,
    reason: "activity_data_partial",
  });
}

function unavailable(options: {
  duration: number | null;
  reason?: "duration_missing" | "private_data";
}) {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport: "swim",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds: options.duration,
    reason: options.reason ?? "private_data",
  });
}

function unavailableWithCompleteProvenance(
  reason:
    | "activity_data_missing"
    | "duration_missing"
    | "intensity_out_of_range"
    | "stale_threshold",
) {
  const { estimated: _estimated, ...provenance } = metadata("run_pace_threshold");
  return {
    status: "unavailable" as const,
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    ...provenance,
    contributingDurationSeconds: null,
    reason,
  };
}

describe("common relative Load activity contract and calculation", () => {
  it("exports the same stable contract and helpers from the load subpath and package root", () => {
    expect(resultSchemaFromRoot).toBe(commonLoadResultSchema);
    expect(aggregateFromRoot).toBe(aggregateCommonLoad);
  });

  it("calculates one hour at threshold as 100 Load without rounding", () => {
    const result = available(3600, 1);

    expect(result).toMatchObject({
      status: "available",
      model: "gradientpeak_relative_load",
      version: "1",
      load: 100,
      intensity: 1,
      contributingDurationSeconds: 3600,
      method: "power_threshold",
      evidenceFingerprint: "activity-power_threshold",
    });
  });

  it("retains nullable provenance and evidence fields in partial and unavailable states", () => {
    expect(partial({ load: null, intensity: null })).toMatchObject({
      status: "partial",
      quality: expect.any(Object),
      thresholdEvidence: expect.any(Object),
      evidenceFingerprint: "activity-run_pace_threshold",
      computedAsOf,
    });
    expect(unavailable({ duration: null, reason: "duration_missing" })).toMatchObject({
      status: "unavailable",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf,
    });
  });

  it.each([
    [0, 1],
    [-1, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [3600, -0.01],
    [3600, 1.500_001],
    [3600, Number.NaN],
    [3600, Number.POSITIVE_INFINITY],
  ])("rejects invalid duration %s or intensity %s instead of clamping", (duration, intensity) => {
    expect(() => available(duration, intensity)).toThrow();
  });

  it("accepts both numeric intensity bounds", () => {
    expect(available(3600, 0)).toMatchObject({ load: 0, intensity: 0 });
    expect(available(3600, 1.5)).toMatchObject({ load: 225, intensity: 1.5 });
  });

  it("requires coherent partial numeric state, provenance, coverage, method, and evidence", () => {
    const validPartial = partial({ load: 12.5, intensity: 0.5 });
    expect(commonLoadResultSchema.safeParse({ ...validPartial, intensity: null }).success).toBe(
      false,
    );
    expect(commonLoadResultSchema.safeParse({ ...validPartial, load: 3.125 }).success).toBe(false);
    for (const field of [
      "method",
      "quality",
      "thresholdEvidence",
      "evidenceFingerprint",
    ] as const) {
      expect(commonLoadResultSchema.safeParse({ ...validPartial, [field]: null }).success).toBe(
        false,
      );
    }
    expect(
      commonLoadResultSchema.safeParse({ ...validPartial, sourceTimeCoverage: 1.01 }).success,
    ).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({ ...validPartial, eligibleDurationSeconds: 4000 }).success,
    ).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({ ...validPartial, eligibleDurationSeconds: 0 }).success,
    ).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({ ...validPartial, sourceTimeCoverage: 0 }).success,
    ).toBe(false);

    const unknownPartial = partial({ load: null, intensity: null });
    expect(
      commonLoadResultSchema.safeParse({
        ...unknownPartial,
        method: null,
        quality: null,
        thresholdEvidence: null,
        evidenceFingerprint: null,
      }).success,
    ).toBe(true);
    expect(commonLoadResultSchema.safeParse({ ...unknownPartial, method: null }).success).toBe(
      false,
    );
    expect(
      commonLoadResultSchema.safeParse({
        ...unknownPartial,
        contributingDurationSeconds: 0,
        sourceTimeCoverage: 0,
      }).success,
    ).toBe(true);

    const validAvailable = available(3600, 1);
    expect(commonLoadResultSchema.safeParse({ ...validAvailable, sport: "run" }).success).toBe(
      false,
    );
    expect(
      commonLoadResultSchema.safeParse({
        ...validPartial,
        thresholdEvidence: metadata("power_threshold").thresholdEvidence,
      }).success,
    ).toBe(false);
  });

  it("enforces unavailable reasons against contradictory or orphan provenance", () => {
    const complete = unavailableWithCompleteProvenance("activity_data_missing");
    expect(commonLoadResultSchema.safeParse(complete).success).toBe(true);
    expect(commonLoadResultSchema.safeParse({ ...complete, quality: null }).success).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({
        ...complete,
        reason: "duration_missing",
        method: null,
        quality: null,
        thresholdEvidence: null,
        evidenceFingerprint: null,
      }).success,
    ).toBe(true);

    expect(
      commonLoadResultSchema.safeParse({
        ...complete,
        reason: "threshold_missing",
        quality: null,
        evidenceFingerprint: null,
      }).success,
    ).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({
        ...complete,
        reason: "threshold_missing",
        quality: null,
        thresholdEvidence: null,
        evidenceFingerprint: null,
      }).success,
    ).toBe(true);

    const stale = unavailableWithCompleteProvenance("stale_threshold");
    expect(commonLoadResultSchema.safeParse(stale).success).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({
        ...stale,
        quality: { ...stale.quality, stale: true },
        thresholdEvidence: { ...stale.thresholdEvidence, freshness: "stale" },
      }).success,
    ).toBe(true);

    const outOfRange = unavailableWithCompleteProvenance("intensity_out_of_range");
    expect(commonLoadResultSchema.safeParse(outOfRange).success).toBe(true);
    expect(
      commonLoadResultSchema.safeParse({ ...outOfRange, evidenceFingerprint: null }).success,
    ).toBe(false);

    const unsupported = {
      ...unavailable({ duration: null }),
      reason: "unsupported_modality" as const,
    };
    expect(commonLoadResultSchema.safeParse(unsupported).success).toBe(true);
    expect(
      commonLoadResultSchema.safeParse({ ...unsupported, method: "swim_pace_threshold" }).success,
    ).toBe(false);
    expect(
      commonLoadResultSchema.safeParse({
        ...complete,
        quality: { ...complete.quality, source: "provider" },
      }).success,
    ).toBe(false);
  });
});

describe("common relative Load aggregation", () => {
  it("preserves Load and Intensity when constant-intensity work is split", () => {
    for (const intensity of [0, 0.25, 0.7, 1, 1.5]) {
      const combined = aggregateCommonLoad([available(7200, intensity)]);
      const split = aggregateCommonLoad([
        available(600, intensity),
        available(1800, intensity),
        available(4800, intensity),
      ]);

      expect(split.status).toBe("complete");
      expect(combined.status).toBe("complete");
      if (split.status !== "complete" || combined.status !== "complete") {
        throw new Error("Expected complete aggregates");
      }
      expect(split.load).toBeCloseTo(200 * intensity ** 2, 12);
      expect(split.intensity).toBeCloseTo(intensity, 12);
      expect(split.load).toBeCloseTo(combined.load, 12);
      expect(split.intensity).toBeCloseTo(combined.intensity, 12);
      expect(split.contributingDurationSeconds).toBe(combined.contributingDurationSeconds);
    }
  });

  it("is invariant to observation order", () => {
    const shortEasy = available(1800, 0.5);
    const threshold = available(3600, 1);
    const shortHard = available(900, 1.4);

    expect(aggregateCommonLoad([shortEasy, threshold, shortHard])).toEqual(
      aggregateCommonLoad([shortHard, shortEasy, threshold]),
    );
  });

  it("derives equivalent Intensity rather than taking an arithmetic activity mean", () => {
    const result = aggregateCommonLoad([available(3600, 0.5), available(10_800, 1)]);

    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected complete aggregate");
    expect(result.load).toBe(325);
    expect(result.intensity).toBeCloseTo(Math.sqrt(325 / 400), 12);
    expect(result.intensity).not.toBe(0.75);
  });

  it("adds supported cross-sport methods within model version 1", () => {
    const result = aggregateCommonLoad([
      available(3600, 1, "power_threshold"),
      available(3600, 1, "critical_power_threshold"),
      available(3600, 1, "run_pace_threshold"),
      available(3600, 1, "swim_pace_threshold"),
      available(3600, 1, "heart_rate_zones"),
    ]);

    expect(result).toMatchObject({
      status: "complete",
      load: 500,
      intensity: 1,
      contributingActivityCount: 5,
      totalActivityCount: 5,
      activityCountCoverage: 1,
    });
  });

  it("abstains from arithmetic when any model version is incompatible", () => {
    const result = aggregateCommonLoad([
      available(3600, 1),
      {
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: "2",
        knownEligibleDurationSeconds: 7200,
      },
    ]);

    expect(result).toEqual({
      status: "unavailable",
      reason: "incompatible_version",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      contributingDurationSeconds: 0,
      knownDurationSeconds: 10_800,
      contributingActivityCount: 0,
      partialActivityCount: 0,
      unavailableActivityCount: 2,
      totalActivityCount: 2,
      activityCountCoverage: 0,
      knownDurationCoverage: 0,
      unknownDurationActivityCount: 0,
    });
    expect("load" in result).toBe(false);
  });

  it("preserves only knowable duration facts when incompatible observations omit duration", () => {
    const result = aggregateCommonLoad([
      available(3600, 1),
      { model: "other_relative_load", version: "1", knownEligibleDurationSeconds: null },
    ]);

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_version",
      knownDurationSeconds: 3600,
      knownDurationCoverage: 0,
      unknownDurationActivityCount: 1,
      unavailableActivityCount: 2,
    });
  });

  it("sums known partial Load while preserving incomplete count and duration coverage", () => {
    const result = aggregateCommonLoad([
      available(3600, 1),
      partial({ load: 12.5, intensity: 0.5 }),
      unavailable({ duration: 3600 }),
      unavailable({ duration: null, reason: "duration_missing" }),
    ]);

    expect(result).toMatchObject({
      status: "partial",
      load: 112.5,
      intensity: Math.sqrt(112.5 / 150),
      contributingDurationSeconds: 5400,
      knownDurationSeconds: 10_800,
      contributingActivityCount: 2,
      partialActivityCount: 1,
      unavailableActivityCount: 2,
      totalActivityCount: 4,
      activityCountCoverage: 0.5,
      knownDurationCoverage: 0.5,
      unknownDurationActivityCount: 1,
    });
    if (result.status !== "partial") throw new Error("Expected partial aggregate");
    if (result.knownDurationSeconds === null)
      throw new Error("Expected known duration denominator");
    expect(result.knownDurationSeconds).toBe(3600 + 1800 / 0.5 + 3600);
    expect(result.knownDurationCoverage).toBe(
      result.contributingDurationSeconds / result.knownDurationSeconds,
    );
  });

  it("retains a known eligible duration denominator at zero partial coverage", () => {
    const zeroCoverage = partial({
      load: null,
      intensity: null,
      durationSeconds: 0,
      sourceTimeCoverage: 0,
    });
    const result = aggregateCommonLoad([available(3600, 1), zeroCoverage]);

    expect(result).toMatchObject({
      status: "partial",
      knownDurationSeconds: 7200,
      contributingDurationSeconds: 3600,
      knownDurationCoverage: 0.5,
      unknownDurationActivityCount: 0,
      partialActivityCount: 1,
    });
  });

  it("keeps partial and unavailable unknown Load absent rather than converting it to zero", () => {
    const result = aggregateCommonLoad([
      partial({ load: null, intensity: null }),
      unavailable({ duration: null, reason: "duration_missing" }),
    ]);

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "no_load_data",
      contributingActivityCount: 0,
      partialActivityCount: 1,
      totalActivityCount: 2,
      activityCountCoverage: 0,
      knownDurationSeconds: 3600,
      knownDurationCoverage: 0,
      unknownDurationActivityCount: 1,
    });
    expect("load" in result).toBe(false);
  });

  it("enforces aggregate status, count, coverage, duration, Load, and Intensity invariants", () => {
    const complete = aggregateCommonLoad([available(3600, 1)]);
    expect(complete.status).toBe("complete");
    if (complete.status !== "complete") throw new Error("Expected complete aggregate");

    expect(
      commonLoadAggregateSchema.safeParse({ ...complete, activityCountCoverage: 0.5 }).success,
    ).toBe(false);
    expect(
      commonLoadAggregateSchema.safeParse({ ...complete, knownDurationSeconds: 7200 }).success,
    ).toBe(false);
    expect(
      commonLoadAggregateSchema.safeParse({ ...complete, unavailableActivityCount: 1 }).success,
    ).toBe(false);
    expect(
      commonLoadAggregateSchema.safeParse({ ...complete, partialActivityCount: 1 }).success,
    ).toBe(false);
    expect(commonLoadAggregateSchema.safeParse({ ...complete, load: 99 }).success).toBe(false);
    expect(commonLoadAggregateSchema.safeParse({ ...complete, status: "partial" }).success).toBe(
      false,
    );

    const withTwoImpliedAvailable = aggregateCommonLoad([
      available(3600, 1),
      available(1800, 0.5),
      partial({ load: null, intensity: null }),
      unavailable({ duration: 3600 }),
    ]);
    expect(withTwoImpliedAvailable.status).toBe("partial");
    expect(
      commonLoadAggregateSchema.safeParse({
        ...withTwoImpliedAvailable,
        contributingActivityCount: 1,
        activityCountCoverage: 0.25,
      }).success,
    ).toBe(false);
  });

  it("keeps a large mathematically bounded RMS at 1.5 without accepting true overshoot", () => {
    const result = aggregateCommonLoad([
      available(1e300, 1.5),
      available(8e299, 1.5),
      available(3e299, 1.5),
    ]);

    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected complete aggregate");
    expect(result.load).toBeTypeOf("number");
    expect(Number.isFinite(result.load)).toBe(true);
    expect(result.intensity).toBe(1.5);

    const outOfRangeIntensity = 1.5 + Number.EPSILON * 32;
    expect(
      commonLoadAggregateSchema.safeParse({
        ...result,
        intensity: outOfRangeIntensity,
        load: (result.contributingDurationSeconds / 3600) * outOfRangeIntensity ** 2 * 100,
      }).success,
    ).toBe(false);
  });

  it("represents an empty in-scope set without fabricating observed zero", () => {
    const result = aggregateCommonLoad([]);

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "no_load_data",
      totalActivityCount: 0,
      activityCountCoverage: 0,
      knownDurationSeconds: null,
      knownDurationCoverage: null,
    });
    expect(commonLoadAggregateSchema.safeParse(result).success).toBe(true);
    expect("load" in result).toBe(false);
  });
});
