import { describe, expect, it } from "vitest";
import { resolveActivityContextAsOf, resolveActivityContextFromEvidence } from "../context";

describe("activity analysis context", () => {
  it("retains supported context metrics and leaves calibration unselected", () => {
    const context = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: "female" },
        profileMetrics: [
          {
            metric_type: "weight_kg",
            recorded_at: new Date("2026-05-01T11:00:00.000Z"),
            unit: "kg",
            value: 64,
          },
        ],
        recentEfforts: [],
      },
    });

    expect(context.profileMetrics).toEqual({ weight_kg: 64 });
    expect(context.performanceTargets).toBeUndefined();
    expect(context.profile.gender).toBe("female");
  });

  it("excludes the parent activity's direct and referenced context evidence", () => {
    const context = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      activityId: "current-activity",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [
          {
            metric_type: "weight_kg",
            recorded_at: new Date("2026-05-01T11:00:00.000Z"),
            unit: "kg",
            value: 99,
            reference_activity_id: "current-activity",
          },
        ],
        recentEfforts: [
          {
            activity_id: "current-activity",
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-05-01T11:00:00.000Z"),
            unit: "watts",
            value: 300,
          },
        ],
      },
    });

    expect(context.profileMetrics.weight_kg).toBeUndefined();
    expect(context.recentEfforts).toEqual([]);
  });

  it("loads evidence at the explicit activity start without calibration selection", async () => {
    const asOf = new Date("2026-05-01T12:00:00.000Z");
    const getContextSnapshot = async (input: unknown) => {
      expect(input).toEqual({ profileId: "profile-1", asOf, effortLookbackAsOf: asOf });
      return { profile: { dob: null, gender: null }, profileMetrics: [], recentEfforts: [] };
    };
    await expect(
      resolveActivityContextAsOf({
        store: { getContextSnapshot },
        profileId: "profile-1",
        activityTimestamp: asOf,
      }),
    ).resolves.toMatchObject({ profileMetrics: {} });
  });
});
