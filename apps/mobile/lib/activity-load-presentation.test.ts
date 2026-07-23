import { describe, expect, it } from "vitest";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getCommonLoadPresentation,
  getThresholdNextAction,
} from "./activity-load-presentation";

describe("activity load presentation", () => {
  const provenance = {
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    sport: "run" as const,
    method: "run_pace_threshold" as const,
    quality: {
      source: "validated_test" as const,
      observed_at: "2026-07-20T12:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-run",
    },
    thresholdEvidence: {
      type: "threshold_speed_mps" as const,
      value: 4,
      unit: "meters_per_second" as const,
      source: "validated_test" as const,
      observedAt: "2026-07-20T12:00:00.000Z",
      validAt: "2026-07-20T12:00:00.000Z",
      freshness: "current" as const,
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-run",
    },
    evidenceFingerprint: "activity-run",
    computedAsOf: "2026-07-21T12:00:00.000Z",
  };

  it("uses explicit modern method labels", () => {
    expect(getActivityLoadLabels("heart_rate_threshold").load).toBe("Estimated HR Load");
    expect(getActivityLoadLabels("critical_power_threshold")).toEqual({
      load: "Estimated CP Load",
      intensity: "CP IF",
    });
    expect(getActivityLoadLabels("power_threshold")).toEqual({
      load: "TSS",
      intensity: "IF",
    });
  });

  it("describes guarded Critical Power calibration distinctly", () => {
    expect(
      formatCalibrationQuality(
        {
          source: "observed_effort",
          observed_at: "2026-07-12T12:00:00.000Z",
          stale: false,
          estimate: true,
          calculation_version: "critical-power-curve-fit-v1",
        },
        "2026-07-13T12:00:00.000Z",
      ),
    ).toContain("Multi-ride Critical Power estimate");
  });

  it("shows stale estimate provenance and sport guidance", () => {
    expect(
      formatCalibrationQuality(
        {
          source: "observed_effort",
          observed_at: "2026-01-01T00:00:00.000Z",
          stale: true,
          estimate: true,
        },
        "2026-04-11T00:00:00.000Z",
      ),
    ).toBe("20-minute effort estimate · 100d old · stale");
    expect(getThresholdNextAction("swim")).toContain("Record a qualifying 20-minute swim effort");
  });

  it("formats validated common Load with a qualitative Intensity", () => {
    expect(
      getCommonLoadPresentation({
        status: "available",
        ...provenance,
        load: 64,
        intensity: 0.8,
        contributingDurationSeconds: 3600,
        estimated: false,
      }),
    ).toEqual({
      status: "available",
      load: "64",
      intensity: "Tempo · 0.80",
      unavailableText: null,
    });
  });

  it("marks partial common Load incomplete and rejects invalid input", () => {
    expect(
      getCommonLoadPresentation({
        status: "partial",
        ...provenance,
        load: 32,
        intensity: 0.8,
        contributingDurationSeconds: 1800,
        eligibleDurationSeconds: 3600,
        sourceTimeCoverage: 0.5,
        reason: "activity_data_partial",
      }),
    ).toMatchObject({
      status: "partial",
      load: "32 · Incomplete",
      intensity: "Tempo · 0.80 · Incomplete",
    });
    expect(getCommonLoadPresentation({ status: "available", load: 0 })).toBeNull();
  });

  it("distinguishes private and unsupported unavailable Load", () => {
    const unavailable = {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      sport: "other" as const,
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-07-21T12:00:00.000Z",
      contributingDurationSeconds: null,
    };
    expect(getCommonLoadPresentation({ ...unavailable, reason: "private_data" })).toMatchObject({
      status: "unavailable",
      unavailableText: "Private",
    });
    expect(
      getCommonLoadPresentation({ ...unavailable, reason: "unsupported_modality" }),
    ).toMatchObject({ status: "unavailable", unavailableText: null });
  });
});
