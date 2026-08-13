import {
  calculateAvailableCommonLoad,
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analysisMocks = vi.hoisted(() => ({
  buildActivityDerivedSummaryMap: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
  loadActivitySegmentsByActivityId: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: analysisMocks.buildActivityDerivedSummaryMap,
  loadActivitySegmentsByActivityId: analysisMocks.loadActivitySegmentsByActivityId,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: analysisMocks.createActivityAnalysisStore,
}));

import { feedRouter } from "../feed";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";

function createOwnedQuantifiedSummary() {
  const computedAsOf = "2026-04-03T11:00:00.000Z";
  const commonLoad = calculateAvailableCommonLoad({
    activity_category: "run",
    method: "run_pace_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-03-01T09:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "feed-parity-test-v1",
      evidence_fingerprint: "feed-parity-quality",
    },
    thresholdEvidence: {
      type: "threshold_speed_mps",
      value: 4.2,
      unit: "meters_per_second",
      source: "validated_test",
      observedAt: "2026-03-01T09:00:00.000Z",
      validAt: "2026-03-01T09:00:00.000Z",
      freshness: "current",
      calculationVersion: "feed-parity-test-v1",
      sourceFingerprint: "feed-parity-threshold",
    },
    evidenceFingerprint: "feed-parity-activity",
    computedAsOf,
    estimated: false,
    contributingDurationSeconds: 1800,
    intensity: 0.9,
  });
  const observation = quantifyCompletedActivityObservation({
    activityCategory: "run",
    source: {
      activityId: ACTIVITY_ID_2,
      segmentId: `${ACTIVITY_ID_2}-segment`,
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
      startedAt: "2026-04-03T10:30:00.000Z",
      finishedAt: computedAsOf,
      elapsedSeconds: 1800,
      activeSeconds: 1800,
      movingSeconds: 1750,
    },
    distance: { meters: 5000, source: "unknown", basis: "unknown" },
    intensity: {
      averageHeartRateBpm: 145,
      averagePowerWatts: null,
      averageSpeedMetersPerSecond: 2.78,
      normalizedSpeedMetersPerSecond: 3.1,
    },
    commonLoad,
  });
  const observationQuantification = createObservationQuantificationBundle({
    members: [observation],
  });

  return {
    common_load: observationQuantification.summary.commonLoad,
    computed_as_of: computedAsOf,
    observationQuantification,
  };
}

type DbPlan = {
  execute?: Array<Array<Record<string, unknown>>>;
  likeStatsRows?: Array<{ entity_id: string; likes_count: number; has_liked: boolean }>;
};

function createDbMock(plan: DbPlan = {}) {
  const executeQueue = [...(plan.execute ?? [])];

  return {
    execute: vi.fn(async () => ({ rows: executeQueue.shift() ?? [] })),
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn(() => Promise.resolve(plan.likeStatsRows ?? [])),
            })),
          })),
        };
      }

      throw new Error(`Unhandled select fields: ${Object.keys(fields ?? {}).join(",")}`);
    }),
  };
}

function createCaller(plan: DbPlan = {}, userId = VIEWER_ID) {
  const db = createDbMock(plan);
  const caller = feedRouter.createCaller({
    db: db as never,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);

  return { caller, db };
}

describe("feedRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
    analysisMocks.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
  });

  it("getFeed maps likes, comments, derived summaries, and pagination metadata", async () => {
    const firstStartedAt = new Date("2026-04-03T10:00:00.000Z");
    const secondStartedAt = new Date("2026-04-02T10:00:00.000Z");
    const thirdStartedAt = new Date("2026-04-01T10:00:00.000Z");

    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [
          ACTIVITY_ID,
          { tss: 82, intensity_factor: 0.91, computed_as_of: "2026-04-03T11:00:00.000Z" },
        ],
      ]),
    );

    const activityRows = [
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Morning Ride",
        category_composition: ["bike"],
        started_at: firstStartedAt,
        finished_at: new Date("2026-04-03T11:00:00.000Z"),
        distance_meters: 32000,
        elapsed_ms: 3_600_000,
        active_ms: 3_600_000,
        moving_ms: 3_500_000,
        timing_coverage: "complete",
        avg_heart_rate: 150,
        max_heart_rate: 178,
        avg_power: 220,
        avg_cadence: 88,
        elevation_gain_meters: "450.25",
        calories: 900,
        has_route: false,
        content_visibility: "public",
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
      {
        id: ACTIVITY_ID_2,
        profile_id: VIEWER_ID,
        name: "Lunch Run",
        category_composition: ["run"],
        started_at: secondStartedAt,
        finished_at: new Date("2026-04-02T10:30:00.000Z"),
        distance_meters: 5000,
        elapsed_ms: 1_800_000,
        active_ms: 1_800_000,
        moving_ms: 1_750_000,
        timing_coverage: "complete",
        avg_heart_rate: 145,
        max_heart_rate: 170,
        avg_power: null,
        avg_cadence: 84,
        elevation_gain_meters: 55,
        calories: 420,
        has_route: false,
        content_visibility: "public",
        profile_username: "viewer",
        profile_avatar_url: null,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        profile_id: OWNER_ID,
        name: "Older Swim",
        category_composition: ["swim"],
        started_at: thirdStartedAt,
        finished_at: new Date("2026-04-01T10:20:00.000Z"),
        distance_meters: 1000,
        elapsed_ms: 1_200_000,
        active_ms: 1_200_000,
        moving_ms: 1_100_000,
        timing_coverage: "complete",
        avg_heart_rate: null,
        max_heart_rate: null,
        avg_power: null,
        avg_cadence: null,
        elevation_gain_meters: null,
        calories: 200,
        has_route: false,
        content_visibility: "public",
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
    ];

    const { caller, db } = createCaller({
      execute: [activityRows, [{ entity_id: ACTIVITY_ID, comments_count: 2 }]],
      likeStatsRows: [{ entity_id: ACTIVITY_ID, likes_count: 4, has_liked: true }],
    });

    const result = await caller.getFeed({ limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(`${secondStartedAt.toISOString()}|${ACTIVITY_ID_2}`);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      contractVersion: "activity-display-v1",
      id: ACTIVITY_ID,
      title: "Morning Ride",
      engagement: { likes: 4, comments: 2, viewerHasLiked: true },
      capabilities: expect.objectContaining({ canEdit: false, canDelete: false }),
    });
    const firstItem = result.items[0];
    if (!firstItem) throw new Error("Expected the first feed item");
    expect(Object.keys(firstItem).sort()).toEqual([
      "activityComposition",
      "capabilities",
      "contractVersion",
      "engagement",
      "href",
      "id",
      "metrics",
      "notes",
      "owner",
      "time",
      "title",
      "visibility",
    ]);
    for (const sensitiveField of [
      "polyline",
      "ingestion",
      "segments",
      "derived",
      "profile_id",
      "created_at",
      "avg_heart_rate",
      "calories",
    ]) {
      expect(firstItem).not.toHaveProperty(sensitiveField);
    }
    expect(analysisMocks.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: VIEWER_ID,
        activities: [
          expect.objectContaining({
            id: ACTIVITY_ID_2,
            profile_id: VIEWER_ID,
          }),
        ],
      }),
    );
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("getFeed uses a stable composite cursor for activities with matching timestamps", async () => {
    const sharedStartedAt = new Date("2026-04-03T10:00:00.000Z");
    const activityRows = [
      {
        id: ACTIVITY_ID_2,
        profile_id: VIEWER_ID,
        name: "Lunch Run",
        category_composition: ["run"],
        started_at: sharedStartedAt,
        finished_at: new Date("2026-04-03T10:30:00.000Z"),
        distance_meters: 5000,
        elapsed_ms: 1_800_000,
        active_ms: 1_800_000,
        moving_ms: 1_750_000,
        timing_coverage: "complete",
        avg_heart_rate: 145,
        max_heart_rate: 170,
        avg_power: null,
        avg_cadence: 84,
        elevation_gain_meters: 55,
        calories: 420,
        has_route: false,
        content_visibility: "public",
        profile_username: "viewer",
        profile_avatar_url: null,
      },
      {
        id: ACTIVITY_ID,
        profile_id: OWNER_ID,
        name: "Morning Ride",
        category_composition: ["bike"],
        started_at: sharedStartedAt,
        finished_at: new Date("2026-04-03T11:00:00.000Z"),
        distance_meters: 32000,
        elapsed_ms: 3_600_000,
        active_ms: 3_600_000,
        moving_ms: 3_500_000,
        timing_coverage: "complete",
        avg_heart_rate: 150,
        max_heart_rate: 178,
        avg_power: 220,
        avg_cadence: 88,
        elevation_gain_meters: 450,
        calories: 900,
        has_route: false,
        content_visibility: "public",
        profile_username: "owner",
        profile_avatar_url: "https://example.com/owner.png",
      },
    ];

    const { caller } = createCaller({ execute: [activityRows, []] });

    const result = await caller.getFeed({ limit: 1 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(`${sharedStartedAt.toISOString()}|${ACTIVITY_ID_2}`);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(ACTIVITY_ID_2);
  });

  it("getFeed preserves the same quantification as My Activities for an owned activity", async () => {
    const derived = createOwnedQuantifiedSummary();
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID_2, derived]]),
    );
    const activity = {
      id: ACTIVITY_ID_2,
      profile_id: VIEWER_ID,
      name: "Lunch Run",
      category_composition: ["run"],
      started_at: new Date("2026-04-03T10:30:00.000Z"),
      finished_at: new Date("2026-04-03T11:00:00.000Z"),
      distance_meters: 5000,
      elapsed_ms: 1_800_000,
      active_ms: 1_800_000,
      moving_ms: 1_750_000,
      timing_coverage: "complete",
      avg_heart_rate: 145,
      max_heart_rate: 170,
      avg_power: null,
      avg_cadence: 84,
      elevation_gain_meters: 55,
      calories: 420,
      has_route: false,
      content_visibility: "public",
      profile_username: "viewer",
      profile_avatar_url: null,
    };
    const { caller } = createCaller({ execute: [[activity], []] });

    const result = await caller.getFeed({ limit: 1 });
    const expectedCommonLoad = derived.observationQuantification.summary.commonLoad;
    if (expectedCommonLoad.status === "unavailable") {
      throw new Error("Expected available common load");
    }

    expect(result.items[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "common_load",
          value: expectedCommonLoad.load,
        }),
      ]),
    );
  });

  it("getFeed rejects malformed SQL activity rows", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: "not-a-uuid",
            profile_id: OWNER_ID,
            name: "Broken Ride",
            category_composition: ["bike"],
            started_at: new Date("2026-04-03T10:00:00.000Z"),
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            elapsed_ms: 3_600_000,
            active_ms: 3_600_000,
            moving_ms: 3_500_000,
            timing_coverage: "complete",
            avg_heart_rate: 150,
            max_heart_rate: 178,
            avg_power: 220,
            avg_cadence: 88,
            elevation_gain_meters: "450.25",
            calories: 900,
            has_route: false,
            content_visibility: "public",
            profile_username: "owner",
            profile_avatar_url: "https://example.com/owner.png",
          },
        ],
      ],
    });

    await expect(caller.getFeed({ limit: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch feed",
    });
  });

  it("getFeed keeps the canonical feed available when an owned derived summary is malformed", async () => {
    analysisMocks.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, { tss: 82, intensity_factor: 0.91, computed_as_of: 123 }]]),
    );

    const { caller } = createCaller({
      execute: [
        [
          {
            id: ACTIVITY_ID,
            profile_id: VIEWER_ID,
            name: "Morning Ride",
            category_composition: ["bike"],
            started_at: new Date("2026-04-03T10:00:00.000Z"),
            finished_at: new Date("2026-04-03T11:00:00.000Z"),
            distance_meters: 32000,
            elapsed_ms: 3_600_000,
            active_ms: 3_600_000,
            moving_ms: 3_500_000,
            timing_coverage: "complete",
            avg_heart_rate: 150,
            max_heart_rate: 178,
            avg_power: 220,
            avg_cadence: 88,
            elevation_gain_meters: 450,
            calories: 900,
            has_route: false,
            content_visibility: "public",
            profile_username: "viewer",
            profile_avatar_url: "https://example.com/owner.png",
          },
        ],
        [],
      ],
      likeStatsRows: [{ entity_id: ACTIVITY_ID, likes_count: 4, has_liked: true }],
    });

    await expect(caller.getFeed({ limit: 1 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: ACTIVITY_ID,
          metrics: expect.arrayContaining([
            expect.objectContaining({
              key: "common_load",
              status: "unavailable",
              reason: "quantification_unavailable",
            }),
            expect.objectContaining({
              key: "normalized_intensity",
              status: "unavailable",
              reason: "quantification_unavailable",
            }),
          ]),
        }),
      ],
    });
  });
});
