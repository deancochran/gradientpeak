import { calculateAvailableCommonLoad } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  formatCalibrationQuality,
  getActivityLoadLabels,
  getCommonLoadPresentation,
  getThresholdNextAction,
} from "./activity-load-presentation";

describe("activity load presentation", () => {
  it("uses common Load and Intensity labels for every calculation method", () => {
    expect(getActivityLoadLabels()).toEqual({ load: "Load", intensity: "Intensity" });
  });

  it("distinguishes complete, partial, and unavailable common Load", () => {
    const available = calculateAvailableCommonLoad({
      sport: "bike",
      method: "power_threshold",
      quality: {
        source: "validated_test",
        observed_at: "2026-07-20T12:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "validated_test",
        observedAt: "2026-07-20T12:00:00.000Z",
        validAt: "2026-07-20T12:00:00.000Z",
        freshness: "current",
        calculationVersion: null,
        sourceFingerprint: "threshold-power",
      },
      evidenceFingerprint: "activity-load",
      computedAsOf: "2026-07-21T12:00:00.000Z",
      estimated: false,
      contributingDurationSeconds: 3_600,
      intensity: 0.8,
    });
    if (available.status !== "available") {
      throw new Error("Expected available common Load fixture");
    }
    const { estimated: _estimated, status: _status, ...provenance } = available;
    const partial = {
      ...provenance,
      status: "partial",
      eligibleDurationSeconds: 7_200,
      sourceTimeCoverage: 0.5,
      reason: "activity_data_partial",
    };

    expect(getCommonLoadPresentation(available)).toMatchObject({
      status: "available",
      load: "64",
      intensity: "0.80",
    });
    expect(getCommonLoadPresentation(partial).explanation).toContain("Partial common Load");
    expect(getCommonLoadPresentation({ status: "unavailable" }).explanation).toContain(
      "no current result",
    );
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

  it("labels a stale 20-minute calibration as an estimate with age and source", () => {
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
  });

  it("provides concise sport-specific threshold actions", () => {
    expect(getThresholdNextAction("bike")).toContain("Record qualifying bike activities");
    expect(getThresholdNextAction("run")).toContain("Record a qualifying 20-minute run effort");
    expect(getThresholdNextAction("swim")).toContain("Record a qualifying 20-minute swim effort");
    expect(getThresholdNextAction("strength")).toContain("sport-specific LTHR");
  });

  it("adapts canonical HR diagnostics with activity context", () => {
    const heartRateUnavailable = {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      sport: "run" as const,
      method: "heart_rate_zones" as const,
      quality: {
        source: "validated_test" as const,
        observed_at: "2026-07-20T12:00:00.000Z",
        valid_at: "2026-07-20T12:00:00.000Z",
        confidence: "high" as const,
        stale: false,
        estimate: false,
        calculation_version: null,
        evidence_fingerprint: "lthr-quality",
      },
      thresholdEvidence: {
        type: "lthr_bpm" as const,
        value: 170,
        unit: "beats_per_minute" as const,
        source: "validated_test" as const,
        observedAt: "2026-07-20T12:00:00.000Z",
        validAt: "2026-07-20T12:00:00.000Z",
        freshness: "current" as const,
        calculationVersion: null,
        sourceFingerprint: "lthr",
      },
      sessionRpeEvidence: null,
      evidenceFingerprint: "activity",
      computedAsOf: "2026-07-21T12:00:00.000Z",
      contributingDurationSeconds: 1_200,
    };

    expect(
      getCommonLoadPresentation(
        { ...heartRateUnavailable, reason: "activity_data_missing" },
        { hasHeartRateSummary: true },
      ).diagnostic?.summary,
    ).toContain("Average heart rate alone is insufficient");
    expect(
      getCommonLoadPresentation({
        ...heartRateUnavailable,
        reason: "insufficient_coverage",
        eligibleDurationSeconds: 3_600,
        sourceTimeCoverage: 1 / 3,
      }).diagnostic,
    ).toMatchObject({ coveragePercent: 33, summary: expect.stringContaining("at least 50%") });
    expect(
      getCommonLoadPresentation({
        ...heartRateUnavailable,
        contributingDurationSeconds: null,
        quality: null,
        thresholdEvidence: null,
        evidenceFingerprint: null,
        reason: "threshold_missing",
      }).diagnostic?.summary,
    ).toContain("sport-specific LTHR is missing");
  });

  it("uses a canonical unavailable HR segment for an unavailable parent aggregate", () => {
    const segment = {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      sport: "run" as const,
      method: "heart_rate_zones" as const,
      quality: null,
      thresholdEvidence: null,
      sessionRpeEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-07-21T12:00:00.000Z",
      contributingDurationSeconds: null,
      reason: "threshold_missing" as const,
    };
    const aggregate = {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      contributingDurationSeconds: 0,
      knownDurationSeconds: 3_600,
      contributingActivityCount: 0,
      partialActivityCount: 0,
      unavailableActivityCount: 1,
      totalActivityCount: 1,
      activityCountCoverage: 0,
      knownDurationCoverage: 0,
      unknownDurationActivityCount: 0,
      reason: "no_load_data" as const,
    };
    expect(
      getCommonLoadPresentation(aggregate, { segmentCommonLoads: [segment] }).diagnostic?.summary,
    ).toContain("sport-specific LTHR is missing");
  });
});
