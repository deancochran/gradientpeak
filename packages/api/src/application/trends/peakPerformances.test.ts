import {
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core";
import type { CommonLoadResult } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { buildPeakPerformances } from "./peakPerformances";

const activity = (id: string, name: string) => ({
  id,
  name,
  type: "bike",
  started_at: new Date(`2026-04-0${id}T07:00:00.000Z`),
  distance_meters: 10_000,
  moving_seconds: 3600,
  avg_speed_mps: 6,
  avg_power: 220,
});

function commonLoad(load: number) {
  return {
    status: "available" as const,
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    activity_category: "bike" as const,
    method: "power_threshold" as const,
    load,
    intensity: Math.sqrt(load / 100),
    contributingDurationSeconds: 3600,
    quality: {
      source: "manual" as const,
      observed_at: "2026-01-01T00:00:00.000Z",
      valid_at: "2026-01-01T00:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "1",
      evidence_fingerprint: "evidence",
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
      sourceFingerprint: "evidence",
    },
    evidenceFingerprint: `activity-${load}`,
    computedAsOf: "2026-04-01T08:00:00.000Z",
    estimated: false,
  };
}

function quantification(id: string, load: CommonLoadResult) {
  const segmentId = `${id}-segment`;
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({ activityId: id });
  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [id, segmentId],
      revisionFingerprint: `revision-${id}`,
      details: { kind: "peak-performance-test", id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: load.model,
      version: load.version,
      computedAt: load.computedAsOf,
      calibrationEvidenceFingerprint: load.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration: {
      elapsed: { status: "available", evidenceRole: "measured", value: 3600, unit: "seconds" },
      active: { status: "available", evidenceRole: "measured", value: 3600, unit: "seconds" },
      moving: { status: "available", evidenceRole: "measured", value: 3600, unit: "seconds" },
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
      activityId: id,
      segmentId,
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: load.computedAsOf,
      computedAt: load.computedAsOf,
      calculationVersion: "peak-performance-test-v1",
    },
    commonLoad: load,
  });
}

describe("buildPeakPerformances", () => {
  it("sorts available Common Load envelopes and omits unavailable load", () => {
    const rows = [activity("1", "Endurance"), activity("2", "VO2"), activity("3", "Recovery")];
    const endurance = quantification("1", commonLoad(85));
    const vo2 = quantification("2", commonLoad(121));
    const unavailable = quantification("3", {
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: "bike",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-04-01T08:00:00.000Z",
      contributingDurationSeconds: null,
      reason: "threshold_missing",
    });
    const result = buildPeakPerformances(
      rows,
      "common_load",
      2,
      new Map([
        [
          "1",
          {
            observationQuantification: createObservationQuantificationBundle({
              members: [endurance],
            }),
          },
        ],
        [
          "2",
          { observationQuantification: createObservationQuantificationBundle({ members: [vo2] }) },
        ],
        [
          "3",
          {
            observationQuantification: createObservationQuantificationBundle({
              members: [unavailable],
            }),
          },
        ],
      ]),
    );

    expect(
      result.performances.map(({ activityName, value, unit }) => ({ activityName, value, unit })),
    ).toEqual([
      { activityName: "VO2", value: 121, unit: "common_load" },
      { activityName: "Endurance", value: 85, unit: "common_load" },
    ]);
  });
});
