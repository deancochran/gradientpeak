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

vi.mock("../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.example.test/profile-avatars/${path}` },
        }),
      }),
    },
  }),
}));

import type { ActivityQuantifiedDerivedSummary } from "../lib/activity-analysis/derived";
import { createQueryMapDbMock } from "../test/mock-query-db";
import { listFeedActivityRows, mapFeedActivity } from "./feed-read-repository";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";

function knownPartialDerived(activityId: string): ActivityQuantifiedDerivedSummary {
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
  const observation = activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity: createCompletedActivityQuantificationSubjectIdentity({ activityId }),
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [activityId, "segment-1"],
      revisionFingerprint: "revision-1",
      details: { kind: "feed-read-repository-test" },
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
      activityId,
      segmentId: "segment-1",
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: computedAt,
      computedAt,
      calculationVersion: "feed-read-repository-test-v1",
    },
    commonLoad,
  });
  return {
    common_load: commonLoad,
    computed_as_of: computedAt,
    observationQuantification: createObservationQuantificationBundle({ members: [observation] }),
  };
}

describe("feed activity projections", () => {
  it("includes private activities for their owner without exposing them to followers", async () => {
    const { db, callLog } = createQueryMapDbMock();

    await listFeedActivityRows(db as never, VIEWER_ID, { limit: 20 });

    expect(callLog).toEqual([{ table: "activities", operation: "select" }]);
  });

  it("scopes a profile activity page without weakening viewer visibility", async () => {
    const { db, callLog } = createQueryMapDbMock();
    const profileId = "22222222-2222-4222-8222-222222222222";

    await listFeedActivityRows(db as never, VIEWER_ID, { limit: 10, profileId });

    expect(callLog).toEqual([{ table: "activities", operation: "select" }]);
  });

  it("parses node-postgres bigint and timestamp values from feed rows", async () => {
    const { db } = createQueryMapDbMock({
      activities: {
        data: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            profile_id: VIEWER_ID,
            name: "Private run",
            elapsed_ms: "3600000",
            active_ms: "3500000",
            moving_ms: null,
            timing_coverage: "complete",
            distance_meters: 10_000,
            avg_heart_rate: null,
            max_heart_rate: null,
            avg_power: null,
            max_power: null,
            avg_cadence: null,
            avg_speed_mps: null,
            max_speed_mps: null,
            normalized_speed_mps: null,
            elevation_gain_meters: null,
            calories: null,
            has_route: false,
            content_visibility: "private",
            started_at: "2026-07-18T10:00:00.000Z",
            finished_at: "2026-07-18T11:00:00.000Z",
            profile_username: "athlete",
            profile_avatar_url: null,
          },
        ],
        error: null,
      },
      activity_segments: {
        data: [{ activity_id: "33333333-3333-4333-8333-333333333333", activity_category: "run" }],
        error: null,
      },
    });

    const [row] = await listFeedActivityRows(db as never, VIEWER_ID, { limit: 20 });

    expect(row).toMatchObject({
      elapsed_ms: 3_600_000,
      active_ms: 3_500_000,
      moving_ms: null,
      started_at: new Date("2026-07-18T10:00:00.000Z"),
    });
  });

  it("preserves ordered repeated and multisport category composition with modern timing", () => {
    const result = mapFeedActivity(
      {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: "22222222-2222-4222-8222-222222222222",
        name: "Run bike run",
        category_composition: ["run", "bike", "run"],
        elapsed_ms: 7_200_000,
        active_ms: 6_600_000,
        moving_ms: 6_400_000,
        timing_coverage: "complete",
        started_at: new Date("2026-07-17T08:00:00.000Z"),
        finished_at: new Date("2026-07-17T10:00:00.000Z"),
        distance_meters: 42_000,
        avg_heart_rate: 150,
        max_heart_rate: 180,
        avg_power: 210,
        avg_cadence: 86,
        elevation_gain_meters: 450,
        calories: 1_200,
        has_route: false,
        content_visibility: "public",
        profile_username: "athlete",
        profile_avatar_url: null,
      },
      {
        commentCounts: new Map(),
        derivedMap: new Map(),
        likeStats: new Map(),
        viewerId: VIEWER_ID,
      },
    );

    expect(result).toMatchObject({
      title: "Run bike run",
      activityComposition: { kind: "multisport", categories: ["run", "bike", "run"] },
      capabilities: { canEdit: false, canDelete: false, hasRoute: false },
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", value: 7_200 }),
        expect.objectContaining({ key: "active_duration", value: 6_600 }),
        expect.objectContaining({ key: "moving_duration", value: 6_400 }),
      ]),
    );
    expect(result).not.toHaveProperty("activity_file_path");
    expect(result).not.toHaveProperty("polyline");
    expect(result).not.toHaveProperty("ingestion");
    expect(result).not.toHaveProperty("segments");
  });

  it("keeps feed items available when legacy profile presentation fields are malformed", () => {
    const result = mapFeedActivity(
      {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: VIEWER_ID,
        name: "Recovery Run",
        category_composition: ["run"],
        elapsed_ms: 1_800_000,
        active_ms: null,
        moving_ms: null,
        timing_coverage: "unavailable",
        started_at: new Date("2026-07-17T08:00:00.000Z"),
        finished_at: new Date("2026-07-17T08:30:00.000Z"),
        distance_meters: 5_000,
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: null,
        has_route: false,
        content_visibility: "public",
        profile_username: "   ",
        profile_avatar_url: `${VIEWER_ID}/legacy-avatar.png`,
      },
      {
        commentCounts: new Map(),
        derivedMap: new Map(),
        likeStats: new Map(),
        viewerId: VIEWER_ID,
      },
    );

    expect(result.owner).toEqual({
      id: VIEWER_ID,
      username: null,
      avatarUrl: `https://storage.example.test/profile-avatars/${VIEWER_ID}/legacy-avatar.png`,
    });
  });

  it("projects known partial Load and Intensity as partial feed metrics", () => {
    const activityId = "33333333-3333-4333-8333-333333333333";
    const result = mapFeedActivity(
      {
        id: activityId,
        profile_id: VIEWER_ID,
        name: "Partial run",
        category_composition: ["run"],
        elapsed_ms: 3_600_000,
        active_ms: 1_800_000,
        moving_ms: 1_800_000,
        timing_coverage: "partial",
        started_at: new Date("2026-07-17T08:00:00.000Z"),
        finished_at: new Date("2026-07-17T09:00:00.000Z"),
        distance_meters: 5_000,
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: null,
        has_route: false,
        content_visibility: "private",
        profile_username: "athlete",
        profile_avatar_url: null,
      },
      {
        commentCounts: new Map(),
        derivedMap: new Map([[activityId, knownPartialDerived(activityId)]]),
        likeStats: new Map(),
        viewerId: VIEWER_ID,
      },
    );

    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "common_load", status: "partial", value: 12.5 }),
        expect.objectContaining({ key: "normalized_intensity", status: "partial", value: 0.5 }),
      ]),
    );
  });
});
