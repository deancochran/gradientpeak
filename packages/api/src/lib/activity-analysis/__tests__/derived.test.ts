import { describe, expect, it, vi } from "vitest";
import { buildActivityDerivedSummaryMap, buildDynamicStressSeries } from "../derived";

function createStoreMock() {
  const efforts = [
    {
      activity_id: "january-bike",
      recorded_at: "2025-01-01T00:00:00.000Z",
      effort_type: "power",
      duration_seconds: 1200,
      value: 200,
      unit: "watts",
      activity_category: "bike",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: {
        activity_id: "january-bike",
        derived_from: "activity_file_stream",
      },
    },
    {
      activity_id: "march-bike",
      recorded_at: "2025-03-01T00:00:00.000Z",
      effort_type: "power",
      duration_seconds: 1200,
      value: 300,
      unit: "watts",
      activity_category: "bike",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: {
        activity_id: "march-bike",
        derived_from: "activity_file_stream",
      },
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
  it("keeps a stable series when the threshold calibration changes", async () => {
    const result = await buildDynamicStressSeries({
      store: createStoreMock() as any,
      profileId: "profile-1",
      activities: [
        buildBikeActivity("older-activity", "2025-02-01T10:00:00.000Z"),
        buildBikeActivity("later-activity", "2025-04-01T10:00:00.000Z"),
      ],
    });

    expect(result.complete).toBe(true);
    expect(result.seriesIdentity).toMatchObject({ sport: "bike", method: "power_threshold" });
    expect(result.byDate.size).toBe(2);
  });

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
      tss: 173,
      method: "power_threshold",
      unavailable_reason: null,
      computed_as_of: "2025-02-01T09:00:00.000Z",
      tss_identity: { sport: "bike", method: "power_threshold" },
    });
    expect(derivedMap.get("later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: "2025-04-01T09:00:00.000Z",
    });
  });

  it("uses activity start as the evidence cutoff so an activity cannot calibrate itself", async () => {
    const store = {
      loadContextEvidence: vi.fn(
        async () =>
          new Map([
            [
              "profile-1",
              {
                profile: { dob: null, gender: null },
                profileMetrics: [],
                recentEfforts: [
                  {
                    activity_id: "activity-under-analysis",
                    activity_category: "bike",
                    duration_seconds: 1200,
                    effort_type: "power",
                    recorded_at: new Date("2025-04-01T09:00:00.000Z"),
                    unit: "watts",
                    value: 300,
                    source: "imported",
                    method: "activity_file_best_effort",
                    provenance: {
                      activity_id: "activity-under-analysis",
                      derived_from: "activity_file_stream",
                    },
                  },
                ],
              },
            ],
          ]),
      ),
    };

    const result = await buildActivityDerivedSummaryMap({
      store: store as any,
      profileId: "profile-1",
      activities: [
        {
          ...buildBikeActivity("activity-under-analysis", "2025-04-01T10:00:00.000Z"),
          started_at: new Date("2025-04-01T09:00:00.000Z"),
        },
      ],
    });

    expect(store.loadContextEvidence).toHaveBeenCalledWith({
      requests: [
        {
          profileId: "profile-1",
          asOf: new Date("2025-04-01T09:00:00.000Z"),
        },
      ],
    });
    expect(result.get("activity-under-analysis")).toMatchObject({
      intensity_factor: null,
      tss: null,
      method: null,
      unavailable_reason: "threshold_missing",
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
      tss: 173,
      computed_as_of: "2025-02-01T09:00:00.000Z",
    });
    expect(derivedMap.get("existing-later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: "2025-04-01T09:00:00.000Z",
    });
  });
});
