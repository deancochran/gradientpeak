import {
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import type { CommonLoadResult } from "@repo/core/load";
import { describe, expect, it, vi } from "vitest";
import { getTrendsDashboard } from "./get-dashboard";
import { buildVolumeTrends } from "./volumeTrends";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function observationQuantification(commonLoad: CommonLoadResult) {
  const observationSegmentId = `${segmentId}-observation`;
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
    activityId: segmentId,
  });
  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [segmentId, observationSegmentId],
      revisionFingerprint: `revision-${segmentId}`,
      details: { kind: "trends-test", segmentId },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: "measured",
        value: 3600,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "measured",
        value: 3600,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole: "measured",
        value: 3600,
        unit: "seconds",
      },
    },
    distance: {
      status: "available",
      evidenceRole: "measured",
      value: 10_000,
      unit: "meters",
    },
    intensity: {
      observed: {
        status: "unavailable",
        evidenceRole: "measured",
        values: [],
        reason: "not_observed",
      },
    },
    completedProvenance: {
      activityId: segmentId,
      segmentId: observationSegmentId,
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: commonLoad.computedAsOf,
      computedAt: commonLoad.computedAsOf,
      calculationVersion: "trends-dashboard-test-v1",
    },
    commonLoad,
  });
}

function activity(activity_category: "bike" | "run" = "bike") {
  return {
    id: activityId,
    profile_id: profileId,
    name: "Tempo",
    started_at: new Date("2026-04-01T07:00:00.000Z"),
    finished_at: new Date("2026-04-01T08:00:00.000Z"),
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete" as const,
    distance_meters: 10_000,
    avg_heart_rate: 145,
    max_heart_rate: 160,
    segments: [
      {
        id: segmentId,
        activity_id: activityId,
        ordinal: 0,
        role: "activity" as const,
        activity_category,
        start_offset_ms: 0,
        end_offset_ms: 3_600_000,
        timing_coverage: "complete" as const,
        active_ms: 3_600_000,
        moving_ms: 3_600_000,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
          distanceMeters: 10_000,
          averagePowerWatts: 220,
          averageSpeedMetersPerSecond: 6.5,
          averageHeartRateBpm: 145,
          normalizedPowerResult: unavailableNormalizedPowerResult,
        },
      },
    ],
  };
}

describe("getTrendsDashboard", () => {
  it("builds parity sections once from the same normalized category-filtered rows", async () => {
    const commonLoad = {
      status: "available" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      activity_category: "bike" as const,
      method: "power_threshold" as const,
      load: 50,
      intensity: Math.sqrt(0.5),
      contributingDurationSeconds: 3600,
      quality: {
        source: "manual" as const,
        observed_at: "2026-01-01T00:00:00.000Z",
        valid_at: "2026-01-01T00:00:00.000Z",
        confidence: "high" as const,
        stale: false,
        estimate: false,
        calculation_version: "1",
        evidence_fingerprint: "threshold-evidence",
      },
      thresholdEvidence: {
        type: "ftp_watts" as const,
        value: 250,
        unit: "watts" as const,
        source: "manual" as const,
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current" as const,
        calculationVersion: "1",
        sourceFingerprint: "threshold-evidence",
      },
      evidenceFingerprint: "activity-evidence",
      computedAsOf: "2026-04-01T08:00:00.000Z",
      estimated: false,
    };
    const quantification = observationQuantification(commonLoad);
    const observationBundle = createObservationQuantificationBundle({
      members: [quantification],
    });
    const buildDerivedSummaries = vi.fn().mockResolvedValue(
      new Map([
        [
          segmentId,
          {
            common_load: commonLoad,
            observationQuantification: observationBundle,
          },
        ],
      ]),
    );
    const repository = { loadDashboardActivities: vi.fn().mockResolvedValue([activity()]) };
    const result = await getTrendsDashboard({
      buildDerivedSummaries,
      repository,
      store: {} as never,
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      groupBy: "day",
      type: "bike",
    });
    expect(result).toMatchObject({
      volume: { totals: { totalDistance: 10_000, totalTime: 3_600, totalActivities: 1 } },
      performance: { dataPoints: [{ activityId: segmentId, avgPower: 220 }] },
      consistency: { totalActivities: 1, totalDays: 2 },
    });
    expect(buildDerivedSummaries).toHaveBeenCalledOnce();
    expect(buildDerivedSummaries.mock.calls[0]?.[0].activities).toHaveLength(1);
  });

  it("returns empty section semantics without deriving and excludes other categories", async () => {
    const buildDerivedSummaries = vi.fn();
    const repository = { loadDashboardActivities: vi.fn().mockResolvedValue([activity("run")]) };
    const result = await getTrendsDashboard({
      buildDerivedSummaries,
      repository,
      store: {} as never,
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      groupBy: "day",
      type: "bike",
    });
    expect(result).toMatchObject({
      volume: { dataPoints: [], totals: null },
      performance: { dataPoints: [] },
      zones: { weeklyData: [] },
      consistency: { totalActivities: 0, totalDays: 0 },
    });
    expect(buildDerivedSummaries).not.toHaveBeenCalled();
  });

  it("does not convert missing quantification into zero trend quantities", async () => {
    const buildDerivedSummaries = vi.fn().mockResolvedValue(new Map());
    const repository = { loadDashboardActivities: vi.fn().mockResolvedValue([activity()]) };

    const result = await getTrendsDashboard({
      buildDerivedSummaries,
      repository,
      store: {} as never,
      profileId,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-01T23:59:59.999Z"),
      groupBy: "day",
    });

    expect(result).toMatchObject({
      volume: {
        dataPoints: [],
        unavailableDataPoints: [{ status: "unavailable", observationQuantification: null }],
        totals: null,
        aggregate: { status: "unavailable", totalDistance: null, totalTime: null },
      },
      performance: {
        dataPoints: [{ distance: null, duration: null, observationQuantification: null }],
      },
      zones: {
        weeklyData: [
          {
            status: "unavailable",
            totalCommonLoad: null,
            observationQuantification: null,
            coverage: { totalActivities: 1, quantifiedActivities: 0 },
          },
        ],
      },
    });
  });

  it("surfaces duplicate completed subjects instead of silently deduplicating trend delivery", () => {
    const commonLoad = {
      status: "unavailable" as const,
      model: "gradientpeak_relative_load" as const,
      version: "1" as const,
      activity_category: "bike" as const,
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-04-01T08:00:00.000Z",
      contributingDurationSeconds: null,
      reason: "activity_data_missing" as const,
    };
    const duplicated = observationQuantification(commonLoad);

    expect(() =>
      buildVolumeTrends(
        [
          {
            id: "delivery-a",
            started_at: new Date("2026-04-01T07:00:00.000Z"),
            distance_meters: null,
            moving_seconds: null,
            duration_seconds: null,
          },
          {
            id: "delivery-b",
            started_at: new Date("2026-04-01T09:00:00.000Z"),
            distance_meters: null,
            moving_seconds: null,
            duration_seconds: null,
          },
        ],
        "day",
        new Map([
          [
            "delivery-a",
            {
              observationQuantification: createObservationQuantificationBundle({
                members: [duplicated],
              }),
            },
          ],
          [
            "delivery-b",
            {
              observationQuantification: createObservationQuantificationBundle({
                members: [duplicated],
              }),
            },
          ],
        ]),
      ),
    ).toThrow(/Duplicate activity quantification subject identity/);
  });
});
