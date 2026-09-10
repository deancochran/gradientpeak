import { ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES } from "@repo/core";
import {
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core/activity-quantification";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  commonLoadResultSchema,
} from "@repo/core/load";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://storage.example.test/storage/v1/object/public/profile-avatars/${path}`,
          },
        }),
      }),
    },
  }),
}));

import { toActivityCardEffortProfile, toActivityDisplayModel } from "./activity-display";

const activitySource = {
  id: "activity-1",
  name: "Morning run",
  profile_id: "owner-1",
  started_at: "2026-08-18T08:00:00.000Z",
  content_visibility: "private" as const,
};

describe("activity display effort profile", () => {
  it("maps a partial load with no numeric result to explicit unavailable metrics", () => {
    const computedAt = "2026-08-18T09:00:00.000Z";
    const commonLoad = commonLoadResultSchema.parse({
      status: "partial",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      activity_category: "run",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: computedAt,
      load: null,
      intensity: null,
      contributingDurationSeconds: 0,
      eligibleDurationSeconds: 3_600,
      sourceTimeCoverage: 0,
      reason: "activity_data_partial",
    });
    const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
      activityId: activitySource.id,
    });
    const observation = activityObservationQuantificationSchema.parse({
      kind: "observation",
      stage: "final",
      subjectIdentity,
      evidenceIdentity: createActivityQuantificationEvidenceIdentity({
        evidenceType: "segment_facts",
        sourceIds: [activitySource.id, "segment-1"],
        revisionFingerprint: "revision-1",
        details: { kind: "activity-display-test" },
      }),
      calculationIdentity: createActivityQuantificationCalculationIdentity({
        model: commonLoad.model,
        version: commonLoad.version,
        computedAt,
        calibrationEvidenceFingerprint: null,
      }),
      activity_category: "run",
      duration: {
        elapsed: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
        active: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
        moving: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
      },
      distance: {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        reason: "not_observed",
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
        activityId: activitySource.id,
        segmentId: "segment-1",
        source: "unknown",
        artifactIdentity: null,
        providerIdentity: null,
        segmentRevision: null,
        observedAt: computedAt,
        computedAt,
        calculationVersion: "activity-display-test-v1",
      },
      commonLoad,
    });
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        derived: {
          observationQuantification: createObservationQuantificationBundle({
            members: [observation],
          }),
        },
      },
      viewerId: "owner-1",
    });

    expect(
      display.metrics.filter(
        (metric) => metric.key.includes("load") || metric.key.includes("intensity"),
      ),
    ).toEqual([
      expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
      expect.objectContaining({ key: "normalized_intensity", status: "unavailable", value: null }),
    ]);
  });

  it("maps known partial Load and Intensity as partial metrics", () => {
    const computedAt = "2026-08-18T09:00:00.000Z";
    const commonLoad = commonLoadResultSchema.parse({
      status: "partial",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      activity_category: "run",
      method: "run_pace_threshold",
      quality: {
        source: "validated_test",
        observed_at: computedAt,
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "threshold-v1",
        evidence_fingerprint: "quality-run",
      },
      thresholdEvidence: {
        type: "threshold_speed_mps",
        value: 4,
        unit: "meters_per_second",
        source: "validated_test",
        observedAt: computedAt,
        validAt: computedAt,
        freshness: "current",
        calculationVersion: "threshold-v1",
        sourceFingerprint: "threshold-run",
      },
      evidenceFingerprint: "activity-run",
      computedAsOf: computedAt,
      load: 12.5,
      intensity: 0.5,
      contributingDurationSeconds: 1_800,
      eligibleDurationSeconds: 3_600,
      sourceTimeCoverage: 0.5,
      reason: "activity_data_partial",
    });
    const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
      activityId: activitySource.id,
    });
    const observation = activityObservationQuantificationSchema.parse({
      kind: "observation",
      stage: "final",
      subjectIdentity,
      evidenceIdentity: createActivityQuantificationEvidenceIdentity({
        evidenceType: "segment_facts",
        sourceIds: [activitySource.id, "segment-1"],
        revisionFingerprint: "revision-1",
        details: { kind: "activity-display-test" },
      }),
      calculationIdentity: createActivityQuantificationCalculationIdentity({
        model: commonLoad.model,
        version: commonLoad.version,
        computedAt,
        calibrationEvidenceFingerprint: "activity-run",
      }),
      activity_category: "run",
      duration: {
        elapsed: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
        active: {
          status: "partial",
          evidenceRole: "measured",
          value: 1_800,
          unit: "seconds",
          reason: "source_incomplete",
        },
        moving: {
          status: "partial",
          evidenceRole: "measured",
          value: 1_800,
          unit: "seconds",
          reason: "source_incomplete",
        },
      },
      distance: {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        reason: "not_observed",
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
        activityId: activitySource.id,
        segmentId: "segment-1",
        source: "unknown",
        artifactIdentity: null,
        providerIdentity: null,
        segmentRevision: null,
        observedAt: computedAt,
        computedAt,
        calculationVersion: "activity-display-test-v1",
      },
      commonLoad,
    });
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        derived: {
          observationQuantification: createObservationQuantificationBundle({
            members: [observation],
          }),
        },
      },
      viewerId: "owner-1",
    });

    expect(display.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "common_load", status: "partial", value: 12.5 }),
        expect.objectContaining({ key: "normalized_intensity", status: "partial", value: 0.5 }),
      ]),
    );
  });

  it("omits the profile when no explicit time series is supplied", () => {
    const display = toActivityDisplayModel({ activity: activitySource, viewerId: "owner-1" });

    expect(display).not.toHaveProperty("effortProfile");
    expect(display.metrics.find((metric) => metric.key === "normalized_intensity")).toMatchObject({
      status: "unavailable",
    });
  });

  it("carries the activity owner profile into the shared display model", () => {
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        profile: {
          username: "alex-runner",
          avatar_url: "https://cdn.example.com/profiles/alex.png",
        },
      },
      viewerId: "owner-1",
    });

    expect(display.owner).toEqual({
      id: "owner-1",
      username: "alex-runner",
      avatarUrl: "https://cdn.example.com/profiles/alex.png",
    });
  });

  it("upgrades a legacy owner avatar path for historical activity cards", () => {
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        profile: { username: "alex-runner", avatar_url: "owner-1/123.jpg" },
      },
      viewerId: "owner-1",
    });

    expect(display.owner.avatarUrl).toBe(
      "https://storage.example.test/storage/v1/object/public/profile-avatars/owner-1/123.jpg",
    );
  });

  it("projects an explicit ordinal series and does not derive one from summary metrics", () => {
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        effort_profile: [
          { elapsedSeconds: 0, effortLevel: "lowest" },
          { elapsedSeconds: 60, effortLevel: "highest" },
          { elapsedSeconds: 120, effortLevel: "lower" },
        ],
      },
      viewerId: "owner-1",
    });

    expect(display.effortProfile).toEqual({
      basis: "activity_wide_signal_ordinal",
      samples: [
        { elapsedSeconds: 0, effortLevel: "lowest" },
        { elapsedSeconds: 60, effortLevel: "highest" },
        { elapsedSeconds: 120, effortLevel: "lower" },
      ],
    });
  });

  it("exposes only the threshold-free ordinal profile to authorized nonowners", () => {
    const display = toActivityDisplayModel({
      activity: {
        ...activitySource,
        content_visibility: "public",
        effort_profile: [
          { elapsedSeconds: 0, effortLevel: "lowest" },
          { elapsedSeconds: 60, effortLevel: "highest" },
        ],
      },
      viewerId: "viewer-2",
    });

    expect(display.effortProfile).toEqual({
      basis: "activity_wide_signal_ordinal",
      samples: [
        { elapsedSeconds: 0, effortLevel: "lowest" },
        { elapsedSeconds: 60, effortLevel: "highest" },
      ],
    });
    expect(JSON.stringify(display.effortProfile)).not.toMatch(
      /threshold|target|raw|stream|provenance|watts|pace|heart.?rate|normalized|intensity/i,
    );
  });

  it("downsamples deterministically within the card payload limit while preserving a peak", () => {
    const samples = Array.from({ length: 20_000 }, (_, index) => ({
      elapsedSeconds: index,
      effortLevel: index === 503 ? ("highest" as const) : ("lowest" as const),
    }));

    const first = toActivityCardEffortProfile(samples);
    const second = toActivityCardEffortProfile(samples);

    expect(first).toEqual(second);
    expect(first?.samples.length).toBeLessThanOrEqual(ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES);
    expect(first?.samples[0]).toEqual(samples[0]);
    expect(first?.samples.at(-1)).toEqual(samples.at(-1));
    expect(first?.samples).toContainEqual({ elapsedSeconds: 503, effortLevel: "highest" });
  });

  it("rejects an unordered source instead of repairing or fabricating a profile", () => {
    expect(
      toActivityCardEffortProfile([
        { elapsedSeconds: 60, effortLevel: "lower" },
        { elapsedSeconds: 30, effortLevel: "higher" },
      ]),
    ).toBeNull();
  });
});
