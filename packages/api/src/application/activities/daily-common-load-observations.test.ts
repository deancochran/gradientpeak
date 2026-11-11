import {
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import type { SegmentDerivedSummary } from "../../lib/activity-analysis";
import { aggregateDailyCommonLoadObservations } from "./daily-common-load-observations";

const quality = {
  source: "manual" as const,
  observed_at: "2026-01-01T00:00:00.000Z",
  valid_at: "2026-01-01T00:00:00.000Z",
  confidence: "high" as const,
  stale: false,
  estimate: false,
  calculation_version: "1",
  evidence_fingerprint: "threshold-evidence",
};

function summary(segmentId: string, load: number | null): SegmentDerivedSummary {
  const commonLoad =
    load === null
      ? ({
          status: "unavailable",
          model: "gradientpeak_relative_load",
          version: "1",
          activity_category: "bike",
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          computedAsOf: "2026-07-01T08:00:00.000Z",
          contributingDurationSeconds: null,
          reason: "threshold_missing",
        } as const)
      : ({
          status: "available",
          model: "gradientpeak_relative_load",
          version: "1",
          activity_category: "bike",
          method: "power_threshold",
          load,
          intensity: 0.8,
          contributingDurationSeconds: 1800,
          quality,
          thresholdEvidence: {
            type: "ftp_watts",
            value: 250,
            unit: "watts",
            source: "manual",
            observedAt: "2026-01-01T00:00:00.000Z",
            validAt: "2026-01-01T00:00:00.000Z",
            freshness: "current",
            calculationVersion: "1",
            sourceFingerprint: "threshold-evidence",
          },
          evidenceFingerprint: "activity-evidence",
          computedAsOf: "2026-07-01T08:00:00.000Z",
          estimated: false,
        } as const);
  return {
    activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    segment_id: segmentId,
    activity_category: "bike",
    common_load: commonLoad,
    observationQuantification: createObservationQuantificationBundle({
      members: [
        quantifyCompletedActivityObservation({
          activityCategory: "bike",
          source: {
            activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            segmentId,
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
            startedAt: "2026-07-01T08:00:00.000Z",
            finishedAt: "2026-07-01T08:30:00.000Z",
            elapsedSeconds: 1800,
            activeSeconds: 1800,
            movingSeconds: 1800,
          },
          distance: { meters: null, source: "unknown", basis: "unknown" },
          intensity: {
            averageHeartRateBpm: null,
            averagePowerWatts: null,
            averageSpeedMetersPerSecond: null,
            normalizedSpeedMetersPerSecond: null,
          },
          commonLoad,
        }),
      ],
    }),
    computed_as_of: "2026-07-01T08:00:00.000Z",
    dedupe_key: `activity-segment:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:${segmentId}:load:v1`,
    load_stream_key: null,
  };
}

describe("daily common Load observations", () => {
  it("aggregates activity segments into one day envelope", () => {
    const observations = aggregateDailyCommonLoadObservations({
      activities: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          started_at: new Date("2026-07-01T08:00:00.000Z"),
        },
      ],
      segmentSummaries: [summary("segment-1", 32), summary("segment-2", 32)],
      startDate: "2026-07-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    });

    expect(observations).toMatchObject([
      {
        date: "2026-07-01",
        aggregate: { status: "complete", load: 64, totalActivityCount: 1 },
      },
    ]);
  });

  it("retains unavailable activity coverage rather than substituting zero", () => {
    const unavailable = summary("segment-1", null);
    const observations = aggregateDailyCommonLoadObservations({
      activities: [
        { id: unavailable.activity_id, started_at: new Date("2026-07-01T08:00:00.000Z") },
      ],
      segmentSummaries: [unavailable],
      startDate: "2026-07-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    });

    expect(observations[0]?.aggregate).toMatchObject({
      status: "unavailable",
      unavailableActivityCount: 1,
    });
  });

  it("treats an arbitrary timezone as a viewer projection, not canonical history", () => {
    const activity = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      started_at: new Date("2026-07-01T00:30:00.000Z"),
    };
    const segmentSummaries = [summary("segment-1", 32)];
    const utc = aggregateDailyCommonLoadObservations({
      activities: [activity],
      segmentSummaries,
      startDate: "2026-06-30",
      endDate: "2026-07-01",
      timezone: "UTC",
    });
    const losAngeles = aggregateDailyCommonLoadObservations({
      activities: [activity],
      segmentSummaries,
      startDate: "2026-06-30",
      endDate: "2026-07-01",
      timezone: "America/Los_Angeles",
    });

    expect(utc[0]?.date).toBe("2026-07-01");
    expect(losAngeles[0]?.date).toBe("2026-06-30");
  });
});
