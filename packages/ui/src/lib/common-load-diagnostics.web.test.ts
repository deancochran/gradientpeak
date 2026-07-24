import { type CommonLoadResult, commonLoadResultSchema } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import {
  getAggregateCommonLoadDiagnostic,
  getCommonLoadDiagnostic,
} from "./common-load-diagnostics";

type UnavailableCommonLoad = Extract<CommonLoadResult, { status: "unavailable" }>;

function unavailable(
  overrides: Partial<UnavailableCommonLoad> & Pick<UnavailableCommonLoad, "reason">,
): UnavailableCommonLoad {
  const requiresCompleteProvenance =
    overrides.reason === "intensity_out_of_range" ||
    (overrides.method === "heart_rate_zones" && overrides.reason !== "threshold_missing");
  const method =
    overrides.method === "heart_rate_zones" ? "heart_rate_zones" : "run_pace_threshold";
  const sport =
    overrides.sport ??
    (overrides.method === "power_threshold" || overrides.method === "critical_power_threshold"
      ? "bike"
      : overrides.method === "swim_pace_threshold"
        ? "swim"
        : "run");
  const completeProvenance = requiresCompleteProvenance
    ? {
        method,
        quality: {
          source: "validated_test" as const,
          observed_at: "2026-07-20T12:00:00.000Z",
          valid_at: "2026-07-20T12:00:00.000Z",
          confidence: "high" as const,
          stale: false,
          estimate: false,
          calculation_version: null,
          evidence_fingerprint: "quality",
        },
        thresholdEvidence:
          method === "heart_rate_zones"
            ? {
                type: "lthr_bpm" as const,
                value: 170,
                unit: "beats_per_minute" as const,
                source: "validated_test" as const,
                observedAt: "2026-07-20T12:00:00.000Z",
                validAt: "2026-07-20T12:00:00.000Z",
                freshness: "current" as const,
                calculationVersion: null,
                sourceFingerprint: "lthr",
              }
            : {
                type: "threshold_speed_mps" as const,
                value: 4,
                unit: "meters_per_second" as const,
                source: "validated_test" as const,
                observedAt: "2026-07-20T12:00:00.000Z",
                validAt: "2026-07-20T12:00:00.000Z",
                freshness: "current" as const,
                calculationVersion: null,
                sourceFingerprint: "run-threshold",
              },
        evidenceFingerprint: "activity",
      }
    : {};
  const result = commonLoadResultSchema.parse({
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    sport,
    method: null,
    quality: null,
    thresholdEvidence: null,
    sessionRpeEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-07-24T12:00:00.000Z",
    contributingDurationSeconds: null,
    ...completeProvenance,
    ...overrides,
  });
  if (result.status !== "unavailable") throw new Error("Expected unavailable fixture");
  return result;
}

describe("getCommonLoadDiagnostic", () => {
  it("specializes missing thresholds by canonical method", () => {
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "threshold_missing", method: "heart_rate_zones" }),
      ),
    ).toMatchObject({
      summary: expect.stringContaining("sport-specific LTHR is missing"),
      action: expect.stringContaining("Add a current"),
    });
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "threshold_missing", method: "power_threshold" }),
      ).summary,
    ).toContain("FTP");
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "threshold_missing", method: "critical_power_threshold" }),
      ).summary,
    ).toContain("Critical Power");
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "threshold_missing", method: "run_pace_threshold" }),
      ).summary,
    ).toContain("run threshold pace");
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "threshold_missing", method: "swim_pace_threshold" }),
      ).summary,
    ).toContain("swim threshold pace");
  });

  it("explains why an average HR summary cannot replace a stream and reports truthful HR coverage", () => {
    expect(
      getCommonLoadDiagnostic(
        unavailable({ reason: "activity_data_missing", method: "heart_rate_zones" }),
        { hasHeartRateSummary: true },
      ).summary,
    ).toContain("Average heart rate alone is insufficient");

    expect(
      getCommonLoadDiagnostic(
        unavailable({
          reason: "insufficient_coverage",
          method: "heart_rate_zones",
          contributingDurationSeconds: 1_200,
          eligibleDurationSeconds: 3_600,
          sourceTimeCoverage: 1 / 3,
        }),
      ),
    ).toMatchObject({ coveragePercent: 33, summary: expect.stringContaining("33%") });
  });

  it.each([
    "duration_missing",
    "invalid_data",
    "private_data",
    "unsupported_modality",
    "intensity_out_of_range",
  ] as const)("keeps %s explicit", (reason) => {
    expect(getCommonLoadDiagnostic(unavailable({ reason }))).toMatchObject({
      summary: expect.any(String),
      action: expect.any(String),
    });
  });

  it("identifies a stale method-specific threshold", () => {
    const stale = unavailable({
      reason: "stale_threshold",
      sport: "bike",
      method: "power_threshold",
      quality: {
        source: "validated_test",
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: true,
        estimate: false,
        calculation_version: null,
        evidence_fingerprint: "quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "validated_test",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "stale",
        calculationVersion: null,
        sourceFingerprint: "ftp",
      },
      evidenceFingerprint: "activity",
    });
    expect(getCommonLoadDiagnostic(stale).summary).toBe("FTP is stale for this activity.");
  });

  it("uses one matching unavailable segment but does not combine multi-segment coverage", () => {
    const coverage = unavailable({
      reason: "insufficient_coverage",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1_200,
      eligibleDurationSeconds: 3_600,
      sourceTimeCoverage: 1 / 3,
    });
    expect(getAggregateCommonLoadDiagnostic({ segmentCommonLoads: [coverage] })).toMatchObject({
      coveragePercent: 33,
      summary: expect.stringContaining("33%"),
    });
    expect(
      getAggregateCommonLoadDiagnostic({ segmentCommonLoads: [coverage, coverage] }),
    ).toMatchObject({
      coveragePercent: null,
      summary: expect.stringContaining("across activity segments"),
    });
  });
});
