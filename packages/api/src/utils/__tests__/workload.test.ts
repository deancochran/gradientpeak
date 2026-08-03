import {
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import { buildCanonicalDailyLoads, buildWorkloadEnvelopes } from "../workload";

const start = new Date("2026-02-01T00:00:00.000Z");
const end = new Date("2026-02-28T00:00:00.000Z");

function observation(commonLoad: CommonLoadResult) {
  return quantifyCompletedActivityObservation({
    activityCategory: "bike",
    source: {
      activityId: "activity-1",
      segmentId: "segment-1",
      provider: null,
      externalId: null,
      artifactId: null,
      capability: "unknown",
      parserVersion: null,
      decodedContractVersion: null,
      materializerVersion: null,
      segmentsRevision: null,
      segmentRevision: null,
      summaryVersion: 1,
      sourceSessionIndex: null,
      sourceMessageIndex: null,
      rawType: null,
      rawSport: null,
      rawSubSport: null,
    },
    timing: {
      coverage: "complete",
      source: "unknown",
      basis: "unknown",
      startedAt: "2026-02-01T12:00:00.000Z",
      finishedAt: "2026-02-01T13:00:00.000Z",
      elapsedSeconds: 3600,
      activeSeconds: 3600,
      movingSeconds: 3600,
    },
    distance: { meters: 20_000, source: "unknown", basis: "unknown" },
    intensity: {
      averageHeartRateBpm: null,
      averagePowerWatts: 200,
      averageSpeedMetersPerSecond: null,
      normalizedSpeedMetersPerSecond: null,
    },
    commonLoad,
  });
}

function observationBundle(commonLoad: CommonLoadResult) {
  return createObservationQuantificationBundle({ members: [observation(commonLoad)] });
}

function unavailableCommonLoad(): CommonLoadResult {
  return {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    activity_category: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-02-01T12:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  };
}

describe("workload utils", () => {
  it("does not manufacture a numeric workload when Common Load is absent", () => {
    const result = buildCanonicalDailyLoads([], start, end);

    expect(result).toMatchObject({ source: "none", complete: false, series: [] });
    expect(buildWorkloadEnvelopes([], start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "missing_quantification",
    });
  });

  it("preserves unavailable Common Load as an unavailable workload envelope", () => {
    const result = buildWorkloadEnvelopes(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          observationQuantification: observationBundle(unavailableCommonLoad()),
        },
      ],
      start,
      end,
    );

    expect(result.acwr).toMatchObject({ value: null, reasonCode: "incomplete_common_load" });
    expect(result.monotony).toMatchObject({ value: null, reasonCode: "incomplete_common_load" });
  });

  it("rejects a quantification from an incompatible Common Load model version", () => {
    const compatible = observationBundle(unavailableCommonLoad());
    const incompatible = {
      ...compatible,
      summary: {
        ...compatible.summary,
        commonLoad: { ...compatible.summary.commonLoad, version: "0" },
      },
    };

    const result = buildWorkloadEnvelopes(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          observationQuantification: incompatible,
        },
      ],
      start,
      end,
    );

    expect(result.acwr).toMatchObject({
      value: null,
      reasonCode: "incompatible_common_load_identity",
    });
  });

  it("builds one compatible Common Load series without TSS or IF aliases", () => {
    const commonLoad = calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      intensity: 0.8,
      contributingDurationSeconds: 3600,
      quality: {
        source: "manual",
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "1",
        evidence_fingerprint: "quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "manual",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current",
        calculationVersion: "1",
        sourceFingerprint: "threshold",
      },
      evidenceFingerprint: "activity",
      computedAsOf: "2026-02-01T12:00:00.000Z",
      estimated: false,
    });
    const result = buildCanonicalDailyLoads(
      [
        {
          started_at: "2026-02-01T12:00:00.000Z",
          observationQuantification: observationBundle(commonLoad),
        },
      ],
      start,
      end,
      {
        knownRestDates: Array.from({ length: 27 }, (_, index) =>
          new Date(Date.UTC(2026, 1, index + 2)).toISOString().slice(0, 10),
        ),
      },
    );

    expect(result).toMatchObject({
      complete: true,
      source: "common_load",
      exactIdentity: {
        family: "common_load",
        method: "gradientpeak_relative_load",
        version: "1",
      },
    });
    expect(result).not.toHaveProperty("tss");
    expect(result).not.toHaveProperty("intensityFactor");
  });

  it("returns an explicit duplicate-subject rejection before workload arithmetic", () => {
    const commonLoad = calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      intensity: 0.8,
      contributingDurationSeconds: 3600,
      quality: {
        source: "manual",
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "1",
        evidence_fingerprint: "quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "manual",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current",
        calculationVersion: "1",
        sourceFingerprint: "threshold",
      },
      evidenceFingerprint: "activity",
      computedAsOf: "2026-02-01T12:00:00.000Z",
      estimated: false,
    });
    const duplicated = observationBundle(commonLoad);
    const deliveries = [
      { started_at: "2026-02-01T12:00:00.000Z", observationQuantification: duplicated },
      { started_at: "2026-02-02T12:00:00.000Z", observationQuantification: duplicated },
    ];
    const result = buildCanonicalDailyLoads(deliveries, start, end);

    expect(result).toMatchObject({
      complete: false,
      source: "common_load",
      series: [],
      exactIdentity: null,
      rejectionReason: "duplicate_subject",
    });
    expect(buildWorkloadEnvelopes(deliveries, start, end).acwr).toMatchObject({
      value: null,
      reasonCode: "duplicate_subject",
    });
  });
});
