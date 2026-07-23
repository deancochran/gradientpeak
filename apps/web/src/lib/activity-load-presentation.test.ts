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
});
