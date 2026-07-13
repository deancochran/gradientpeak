import { describe, expect, it, vi } from "vitest";
import { buildActivityDerivedSummaryMap } from "../derived";

function createStoreMock() {
  const efforts = [
    {
      recorded_at: "2025-01-01T00:00:00.000Z",
      effort_type: "power",
      duration_seconds: 1200,
      value: 200,
      activity_category: "bike",
    },
    {
      recorded_at: "2025-03-01T00:00:00.000Z",
      effort_type: "power",
      duration_seconds: 1200,
      value: 300,
      activity_category: "bike",
    },
  ];

  return {
    loadContextEvidence: vi.fn(
      async (input: { requests: Array<{ profileId: string }> }) =>
        new Map(
          [...new Set(input.requests.map((request) => request.profileId))].map((profileId) => [
            profileId,
            {
              profile: { dob: null, gender: null },
              profileMetrics: [],
              recentEfforts: efforts.map((effort) => ({
                ...effort,
                recorded_at: new Date(effort.recorded_at),
              })),
            },
          ]),
        ),
    ),
  };
}

function buildBikeActivity(id: string, finishedAt: string, profileId?: string) {
  return {
    id,
    profile_id: profileId,
    type: "bike" as const,
    started_at: new Date(new Date(finishedAt).getTime() - 3_600_000),
    finished_at: new Date(finishedAt),
    duration_seconds: 3600,
    moving_seconds: 3600,
    distance_meters: 40000,
    avg_heart_rate: null,
    max_heart_rate: null,
    avg_power: null,
    max_power: null,
    avg_speed_mps: null,
    max_speed_mps: null,
    normalized_power: 250,
    normalized_speed_mps: null,
    normalized_graded_speed_mps: null,
  };
}

describe("buildActivityDerivedSummaryMap", () => {
  it("uses only as-of efforts for each activity", async () => {
    const derivedMap = await buildActivityDerivedSummaryMap({
      store: createStoreMock() as any,
      profileId: "profile-1",
      activities: [
        {
          id: "older-activity",
          type: "bike",
          started_at: new Date("2025-02-01T09:00:00.000Z"),
          finished_at: new Date("2025-02-01T10:00:00.000Z"),
          duration_seconds: 3600,
          moving_seconds: 3600,
          distance_meters: 40000,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_power: 250,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
        },
        {
          id: "later-activity",
          type: "bike",
          started_at: new Date("2025-04-01T09:00:00.000Z"),
          finished_at: new Date("2025-04-01T10:00:00.000Z"),
          duration_seconds: 3600,
          moving_seconds: 3600,
          distance_meters: 40000,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_power: 250,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
        },
      ],
    });

    expect(derivedMap.get("older-activity")).toMatchObject({
      intensity_factor: 1.32,
      tss: 174,
      computed_as_of: "2025-02-01T10:00:00.000Z",
      tss_identity: { sport: "bike", method: "power_threshold" },
    });
    expect(derivedMap.get("later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: "2025-04-01T10:00:00.000Z",
    });
  });

  it.each([
    1, 20, 100, 525,
  ])("loads context evidence once for %i activities without queuing per-activity reads", async (activityCount) => {
    const store = createStoreMock();
    const activities = Array.from({ length: activityCount }, (_, index) =>
      buildBikeActivity(`activity-${index}`, "2025-04-01T10:00:00.000Z"),
    );
    const startedAt = performance.now();

    const result = await buildActivityDerivedSummaryMap({
      store: store as any,
      profileId: "profile-1",
      activities,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result).toHaveLength(activityCount);
    expect(store.loadContextEvidence).toHaveBeenCalledTimes(1);
    expect(store.loadContextEvidence).toHaveBeenCalledWith({
      requests: expect.arrayContaining([expect.objectContaining({ profileId: "profile-1" })]),
    });
    expect(
      elapsedMs,
      `${activityCount}-activity derivation=${elapsedMs.toFixed(2)}ms`,
    ).toBeLessThan(500);
  });

  it("isolates each activity owner's evidence instead of using the feed viewer context", async () => {
    const ownerA = "owner-a";
    const ownerB = "owner-b";
    const store = {
      loadContextEvidence: vi.fn(
        async () =>
          new Map([
            [
              ownerA,
              {
                profile: { dob: null, gender: null },
                profileMetrics: [
                  {
                    metric_type: "ftp",
                    recorded_at: new Date("2025-01-01T00:00:00.000Z"),
                    unit: "W",
                    value: 200,
                  },
                ],
                recentEfforts: [],
              },
            ],
            [
              ownerB,
              {
                profile: { dob: null, gender: null },
                profileMetrics: [
                  {
                    metric_type: "ftp",
                    recorded_at: new Date("2025-01-01T00:00:00.000Z"),
                    unit: "W",
                    value: 300,
                  },
                ],
                recentEfforts: [],
              },
            ],
          ]),
      ),
    };

    const result = await buildActivityDerivedSummaryMap({
      store: store as any,
      profileId: "feed-viewer",
      activities: [
        buildBikeActivity("owner-a-activity", "2025-01-02T10:00:00.000Z", ownerA),
        buildBikeActivity("owner-b-activity", "2025-01-02T10:00:00.000Z", ownerB),
      ],
    });

    expect(store.loadContextEvidence).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({ profileId: ownerA }),
        expect.objectContaining({ profileId: ownerB }),
      ],
    });
    expect(result.get("owner-a-activity")?.tss).toBe(156);
    expect(result.get("owner-b-activity")?.tss).toBe(69);
  });

  it("lets later dynamic reads incorporate older backfilled history without rewriting later rows", async () => {
    const derivedMap = await buildActivityDerivedSummaryMap({
      store: createStoreMock() as any,
      profileId: "profile-1",
      activities: [
        {
          id: "historical-import",
          type: "bike",
          started_at: new Date("2025-02-01T09:00:00.000Z"),
          finished_at: new Date("2025-02-01T10:00:00.000Z"),
          duration_seconds: 3600,
          moving_seconds: 3600,
          distance_meters: 40000,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_power: 250,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
        },
        {
          id: "existing-later-activity",
          type: "bike",
          started_at: new Date("2025-04-01T09:00:00.000Z"),
          finished_at: new Date("2025-04-01T10:00:00.000Z"),
          duration_seconds: 3600,
          moving_seconds: 3600,
          distance_meters: 40000,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_power: null,
          max_power: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          normalized_power: 250,
          normalized_speed_mps: null,
          normalized_graded_speed_mps: null,
        },
      ],
    });

    expect(derivedMap.get("historical-import")).toMatchObject({
      intensity_factor: 1.32,
      tss: 174,
      computed_as_of: "2025-02-01T10:00:00.000Z",
    });
    expect(derivedMap.get("existing-later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: "2025-04-01T10:00:00.000Z",
    });
  });
});
