import { describe, expect, it } from "vitest";

import { activityPrescriptionQuantificationSchema } from "../../activity-quantification";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  getNormalizedIntensity,
} from "../../load/common-relative-load";
import {
  completedActivityObservationInputSchema,
  quantifyCompletedActivityObservation,
} from "../observation-quantification";

const computedAsOf = "2026-07-31T12:00:00.000Z";

function availableCommonLoad(computedAt = computedAsOf) {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-20T10:00:00.000Z",
      valid_at: "2026-07-20T10:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "ftp-test-v1",
      evidence_fingerprint: "ftp-evidence-1",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-20T10:00:00.000Z",
      validAt: "2026-07-20T10:00:00.000Z",
      freshness: "current",
      calculationVersion: "ftp-test-v1",
      sourceFingerprint: "ftp-evidence-1",
    },
    evidenceFingerprint: "segment-load-evidence-1",
    computedAsOf: computedAt,
    estimated: false,
    contributingDurationSeconds: 3_300,
    intensity: 0.8,
  });
}

function input(computedAt = computedAsOf) {
  return completedActivityObservationInputSchema.parse({
    activityCategory: "bike",
    source: {
      activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      segmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      provider: "wahoo",
      externalId: "provider-activity-1",
      artifactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      capability: "activity_file",
      parserVersion: "canonical-submission-v1",
      decodedContractVersion: "decoded-activity-artifact-v1",
      materializerVersion: "activity-segments-v2",
      segmentsRevision: 2,
      segmentRevision: 2,
      summaryVersion: 1,
      sourceSessionIndex: 0,
      sourceMessageIndex: null,
      rawType: null,
      rawSport: "cycling",
      rawSubSport: "road",
    },
    timing: {
      coverage: "partial",
      source: "unknown",
      basis: "unknown",
      startedAt: "2026-07-30T10:00:00.000Z",
      finishedAt: "2026-07-30T11:00:00.000Z",
      elapsedSeconds: 3_600,
      activeSeconds: 3_300,
      movingSeconds: null,
    },
    distance: {
      meters: 40_000,
      source: "activity_file",
      basis: "session_summary",
    },
    intensity: {
      averageHeartRateBpm: 150,
      averagePowerWatts: 200,
      averageSpeedMetersPerSecond: 11.1,
      normalizedSpeedMetersPerSecond: null,
    },
    commonLoad: availableCommonLoad(computedAt),
  });
}

describe("completed activity observation quantification", () => {
  it("preserves distinct timing, measured distance, native intensity, and Common Load adaptation", () => {
    const result = quantifyCompletedActivityObservation(input());

    expect(result).toMatchObject({
      kind: "observation",
      stage: "final",
      subjectIdentity: {
        subjectType: "segment",
        segmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        parentSubjectIdentity: {
          subjectType: "activity",
          activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      },
      evidenceIdentity: { evidenceType: "activity_artifact" },
      calculationIdentity: {
        model: COMMON_RELATIVE_LOAD_MODEL,
        version: COMMON_RELATIVE_LOAD_VERSION,
        computedAt: computedAsOf,
      },
      activity_category: "bike",
      duration: {
        elapsed: { status: "available", evidenceRole: "measured", value: 3_600 },
        active: {
          status: "partial",
          evidenceRole: "measured",
          value: 3_300,
          reason: "source_incomplete",
        },
        moving: {
          status: "unavailable",
          evidenceRole: "measured",
          value: null,
          reason: "source_missing",
        },
      },
      distance: { status: "available", evidenceRole: "measured", value: 40_000 },
      intensity: {
        observed: {
          status: "available",
          evidenceRole: "measured",
          values: [
            { metric: "power", magnitude: { kind: "point", value: 200 } },
            { metric: "speed", magnitude: { kind: "point", value: 11.1 } },
            { metric: "heart_rate", magnitude: { kind: "point", value: 150 } },
          ],
        },
      },
      completedProvenance: {
        activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        segmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        source: "activity_file",
        artifactIdentity: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        providerIdentity: { provider: "wahoo", externalId: "provider-activity-1" },
        segmentRevision: 2,
        observedAt: "2026-07-30T11:00:00.000Z",
        computedAt: computedAsOf,
        calculationVersion: "completed_activity_segment_v1",
      },
      commonLoad: { status: "available", method: "power_threshold", intensity: 0.8 },
    });
    expect(getNormalizedIntensity(result.commonLoad)).toBe(0.8);
  });

  it("separates stable subject, source evidence, and recalculation identities", () => {
    const first = quantifyCompletedActivityObservation(input());
    const recomputed = quantifyCompletedActivityObservation(input("2026-08-01T12:00:00.000Z"));
    const changedVersion = input();
    changedVersion.source.segmentRevision = 3;
    const changedDistanceBasis = input();
    changedDistanceBasis.distance.basis = "artifact_summary";
    const changedProvider = input();
    changedProvider.source.provider = "garmin";
    const changedTimestamps = input();
    changedTimestamps.timing.startedAt = "2026-07-31T10:00:00.000Z";
    changedTimestamps.timing.finishedAt = "2026-07-31T11:00:00.000Z";

    expect(recomputed.commonLoad.computedAsOf).not.toBe(first.commonLoad.computedAsOf);
    expect(recomputed.subjectIdentity).toEqual(first.subjectIdentity);
    expect(recomputed.evidenceIdentity).toEqual(first.evidenceIdentity);
    expect(recomputed.calculationIdentity).not.toEqual(first.calculationIdentity);
    for (const changed of [
      changedVersion,
      changedDistanceBasis,
      changedProvider,
      changedTimestamps,
    ]) {
      const quantified = quantifyCompletedActivityObservation(changed);
      expect(quantified.subjectIdentity).toEqual(first.subjectIdentity);
      expect(quantified.evidenceIdentity).not.toEqual(first.evidenceIdentity);
    }
  });

  it("propagates unavailable source and Common Load evidence without numeric fallbacks", () => {
    const unavailable = input();
    unavailable.timing.coverage = "unavailable";
    unavailable.timing.activeSeconds = null;
    unavailable.timing.movingSeconds = null;
    unavailable.distance.meters = null;
    unavailable.distance.source = "provider_summary";
    unavailable.distance.basis = "provider_summary";
    unavailable.intensity.averageHeartRateBpm = null;
    unavailable.intensity.averagePowerWatts = null;
    unavailable.intensity.averageSpeedMetersPerSecond = null;
    unavailable.commonLoad = commonLoadResultSchema.parse({
      status: "unavailable",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      activity_category: "bike",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf,
      contributingDurationSeconds: null,
      reason: "activity_data_missing",
    });

    const result = quantifyCompletedActivityObservation(unavailable);
    expect(result.duration.active).toMatchObject({ status: "unavailable", value: null });
    expect(result.distance).toMatchObject({ status: "unavailable", value: null });
    expect(result.intensity.observed).toMatchObject({ status: "unavailable", values: [] });
    expect(getNormalizedIntensity(result.commonLoad)).toBeNull();
    expect(result.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "activity_data_missing",
    });
  });

  it("preserves measured zero power and speed instead of treating them as absent", () => {
    const zeroIntensity = input();
    zeroIntensity.intensity.averageHeartRateBpm = null;
    zeroIntensity.intensity.averagePowerWatts = 0;
    zeroIntensity.intensity.averageSpeedMetersPerSecond = 0;

    expect(quantifyCompletedActivityObservation(zeroIntensity).intensity.observed).toMatchObject({
      status: "available",
      values: [
        { metric: "power", magnitude: { kind: "point", value: 0 } },
        { metric: "speed", magnitude: { kind: "point", value: 0 } },
      ],
    });
  });

  it("rejects a distance basis that overclaims its source provenance", () => {
    const incompatible = input();
    incompatible.distance.source = "provider_summary";

    expect(completedActivityObservationInputSchema.safeParse(incompatible).success).toBe(false);
  });

  it("rejects historical Common Load model or version identities and cannot parse as a prescription", () => {
    const current = quantifyCompletedActivityObservation(input());
    const incompatible = input();
    const incompatibleCommonLoad = { ...incompatible.commonLoad, version: "0" };

    expect(
      completedActivityObservationInputSchema.safeParse({
        ...incompatible,
        commonLoad: incompatibleCommonLoad,
      }).success,
    ).toBe(false);
    expect(current.kind).toBe("observation");
    expect(current.stage).toBe("final");
    expect(activityPrescriptionQuantificationSchema.safeParse(current).success).toBe(false);
  });
});
