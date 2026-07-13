import { describe, expect, it } from "vitest";
import { resolveActivityContextAsOf, resolveActivityContextFromEvidence } from "../context";

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

  it("honors append-only override tombstones across historical as-of reconstruction", () => {
    const active = { input: "profile_update", override_state: "active" };
    const cleared = { input: "profile_update", override_state: "cleared" };
    const evidence = {
      profile: { dob: null, gender: null },
      profileMetrics: [
        {
          id: "weight-reactivated",
          metric_type: "weight_kg" as const,
          recorded_at: new Date("2026-05-03T00:00:00.000Z"),
          unit: "kg",
          value: 72,
          method: "profile_update_override",
          provenance: active,
        },
        {
          id: "weight-cleared",
          metric_type: "weight_kg" as const,
          recorded_at: new Date("2026-05-02T00:00:00.000Z"),
          unit: "kg",
          value: 0,
          method: "profile_update_override",
          provenance: cleared,
        },
        {
          id: "weight-active",
          metric_type: "weight_kg" as const,
          recorded_at: new Date("2026-05-01T00:00:00.000Z"),
          unit: "kg",
          value: 70,
          method: "profile_update_override",
          provenance: active,
        },
      ],
      recentEfforts: [
        {
          id: "ftp-reactivated",
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-03T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 320 / 0.95,
          method: "profile_update_override",
          provenance: active,
        },
        {
          id: "ftp-cleared",
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-02T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 0,
          method: "profile_update_override",
          provenance: cleared,
        },
        {
          id: "ftp-active",
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-01T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 300 / 0.95,
          method: "profile_update_override",
          provenance: active,
        },
      ],
    };

    expect(
      resolveActivityContextFromEvidence({
        evidence,
        activityTimestamp: "2026-05-01T12:00:00.000Z",
      }).profileMetrics,
    ).toMatchObject({ weight_kg: 70, ftp: 300 });
    expect(
      resolveActivityContextFromEvidence({
        evidence,
        activityTimestamp: "2026-05-02T12:00:00.000Z",
      }).profileMetrics,
    ).toMatchObject({ weight_kg: null, ftp: null });
    expect(
      resolveActivityContextFromEvidence({
        evidence,
        activityTimestamp: "2026-05-03T12:00:00.000Z",
      }).profileMetrics,
    ).toMatchObject({ weight_kg: 72, ftp: 320 });
  });
});
