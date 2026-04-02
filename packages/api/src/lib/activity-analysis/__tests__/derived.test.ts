import { describe, expect, it } from "vitest";
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
    async getContextSnapshot(input: { asOf: Date }) {
      const cutoff = input.asOf.toISOString();
      return {
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: efforts
          .filter((effort) => effort.recorded_at <= cutoff)
          .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
          .map((effort) => ({
            ...effort,
            recorded_at: new Date(effort.recorded_at),
          })),
      };
    },
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
      computed_as_of: new Date("2025-02-01T10:00:00.000Z"),
    });
    expect(derivedMap.get("later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: new Date("2025-04-01T10:00:00.000Z"),
    });
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
      computed_as_of: new Date("2025-02-01T10:00:00.000Z"),
    });
    expect(derivedMap.get("existing-later-activity")).toMatchObject({
      intensity_factor: 0.88,
      tss: 77,
      computed_as_of: new Date("2025-04-01T10:00:00.000Z"),
    });
  });
});
