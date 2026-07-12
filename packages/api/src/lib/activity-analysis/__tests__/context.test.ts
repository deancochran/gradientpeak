import { describe, expect, it } from "vitest";
import { resolveActivityContextAsOf } from "../context";

describe("resolveActivityContextAsOf", () => {
  it("resolves canonical FTP and running threshold pace from fresh 20-minute efforts", async () => {
    const result = await resolveActivityContextAsOf({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      profileId: "profile-1",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [
            {
              activity_category: "bike",
              duration_seconds: 1200,
              effort_type: "power",
              recorded_at: new Date("2026-05-01T10:00:00.000Z"),
              unit: "watts",
              value: 250,
            },
            {
              activity_category: "run",
              duration_seconds: 1200,
              effort_type: "speed",
              recorded_at: new Date("2026-05-01T11:00:00.000Z"),
              unit: "km_per_hour",
              value: 18,
            },
          ],
        }),
      } as any,
    });

    expect(result.profileMetrics).toMatchObject({
      ftp: 238,
      threshold_speed_mps: 5,
    });
  });

  it("does not use stale efforts as threshold inputs", async () => {
    const result = await resolveActivityContextAsOf({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      profileId: "profile-1",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [
            {
              activity_category: "bike",
              duration_seconds: 1200,
              effort_type: "power",
              recorded_at: new Date("2025-01-01T10:00:00.000Z"),
              unit: "watts",
              value: 250,
            },
          ],
        }),
      } as any,
    });

    expect(result.profileMetrics.ftp).toBeNull();
  });
});
