import { describe, expect, it } from "vitest";
import { resolveActivityContextAsOf, resolveActivityContextFromEvidence } from "../context";

describe("resolveActivityContextAsOf", () => {
  it("resolves canonical cycling, running, and swimming thresholds from fresh efforts", async () => {
    const result = await resolveActivityContextAsOf({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      profileId: "profile-1",
      store: {
        getContextSnapshot: async () => ({
          profile: { dob: null, gender: null },
          profileMetrics: [],
          recentEfforts: [
            {
              activity_id: "bike-activity",
              activity_category: "bike",
              duration_seconds: 1200,
              effort_type: "power",
              recorded_at: new Date("2026-05-01T10:00:00.000Z"),
              unit: "watts",
              value: 250,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "bike-activity",
                derived_from: "activity_file_stream",
              },
            },
            {
              activity_id: "run-activity",
              activity_category: "run",
              duration_seconds: 1200,
              effort_type: "speed",
              recorded_at: new Date("2026-05-01T11:00:00.000Z"),
              unit: "meters_per_second",
              value: 5,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "run-activity",
                derived_from: "activity_file_stream",
              },
            },
            {
              activity_id: "swim-activity",
              activity_category: "swim",
              duration_seconds: 1200,
              effort_type: "speed",
              recorded_at: new Date("2026-05-01T11:30:00.000Z"),
              unit: "meters_per_second",
              value: 1.5,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "swim-activity",
                derived_from: "activity_file_stream",
              },
            },
          ],
        }),
      } as any,
    });

    expect(result.profileMetrics).toMatchObject({
      ftp: 238,
      threshold_speed_mps: 5,
      swim_threshold_speed_mps: 1.5,
    });
    expect(result.calibrationQuality).toMatchObject({
      ftp: { source: "observed_effort", estimate: true, confidence: "medium", stale: false },
      runThreshold: { source: "observed_effort", estimate: true, stale: false },
      swimThreshold: { source: "observed_effort", estimate: true, stale: false },
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
              activity_id: "stale-bike-activity",
              activity_category: "bike",
              duration_seconds: 1200,
              effort_type: "power",
              recorded_at: new Date("2025-01-01T10:00:00.000Z"),
              unit: "watts",
              value: 250,
              source: "imported",
              method: "activity_file_best_effort",
              provenance: {
                activity_id: "stale-bike-activity",
                derived_from: "activity_file_stream",
              },
            },
          ],
        }),
      } as any,
    });

    expect(result.profileMetrics.ftp).toBeNull();
  });

  it("retains stale direct threshold age and source for presentation", () => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [
          {
            metric_type: "ftp",
            recorded_at: new Date("2025-12-01T00:00:00.000Z"),
            unit: "W",
            value: 250,
            source: "manual",
          },
        ],
        recentEfforts: [],
      },
    });

    expect(result.profileMetrics.ftp).toBe(250);
    expect(result.calibrationQuality?.ftp).toEqual({
      source: "manual",
      observed_at: "2025-12-01T00:00:00.000Z",
      confidence: "high",
      stale: true,
      estimate: false,
      calculation_version: null,
    });
  });

  it("identifies a validated CSS test without treating it as provider data", () => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-07-14T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [
          {
            metric_type: "css_seconds_per_100m",
            recorded_at: new Date("2026-07-14T09:00:00.000Z"),
            unit: "seconds_per_100m",
            value: 96,
            source: "test",
            calculation_version: "css_400m_200m_v1",
          },
        ],
        recentEfforts: [],
      },
    });

    expect(result.calibrationQuality?.swimThreshold).toEqual({
      source: "validated_test",
      observed_at: "2026-07-14T09:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "css_400m_200m_v1",
    });
  });

  it.each([
    ["W", 250],
    ["kilowatts", 0.25],
  ])("normalizes recognized bike power unit %s to watts", (unit, value) => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: [
          {
            activity_id: `bike-${unit}`,
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit,
            value,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: `bike-${unit}`,
              derived_from: "activity_file_stream",
            },
          },
        ],
      },
    });

    expect(result.profileMetrics.ftp).toBe(238);
  });

  it("skips wrong-unit bike power instead of treating its raw value as watts", () => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: [
          {
            activity_id: "wrong-unit-bike",
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "bpm",
            value: 900,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: "wrong-unit-bike",
              derived_from: "activity_file_stream",
            },
          },
          {
            activity_id: "valid-bike-fallback",
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-04-20T00:00:00.000Z"),
            unit: "watts",
            value: 250,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: "valid-bike-fallback",
              derived_from: "activity_file_stream",
            },
          },
        ],
      },
    });

    expect(result.profileMetrics.ftp).toBe(238);
  });

  it("prefers a locked manual threshold while allowing fresh effort to supersede provider data", () => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [
          {
            metric_type: "threshold_pace_seconds_per_km",
            recorded_at: new Date("2026-04-01T00:00:00.000Z"),
            unit: "s/km",
            value: 250,
            source: "manual",
            provenance: { manual_override: { locked: true } },
          },
          {
            metric_type: "css_seconds_per_100m",
            recorded_at: new Date("2026-04-01T00:00:00.000Z"),
            unit: "s/100m",
            value: 80,
            source: "provider",
          },
        ],
        recentEfforts: [
          {
            activity_id: "run-effort",
            activity_category: "run",
            duration_seconds: 1200,
            effort_type: "speed",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "meters_per_second",
            value: 5,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: "run-effort",
              derived_from: "activity_file_stream",
            },
          },
          {
            activity_id: "swim-effort",
            activity_category: "swim",
            duration_seconds: 1200,
            effort_type: "speed",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "meters_per_second",
            value: 1.5,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: "swim-effort",
              derived_from: "activity_file_stream",
            },
          },
        ],
      },
    });

    expect(result.profileMetrics).toMatchObject({
      threshold_speed_mps: 4,
      swim_threshold_speed_mps: 1.5,
    });
  });

  it("prefers fresh observed 20-minute efforts over stale direct thresholds for each sport", () => {
    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [
          {
            metric_type: "ftp",
            recorded_at: new Date("2026-01-01T00:00:00.000Z"),
            unit: "W",
            value: 220,
            source: "provider",
          },
          {
            metric_type: "threshold_pace_seconds_per_km",
            recorded_at: new Date("2026-01-01T00:00:00.000Z"),
            unit: "s/km",
            value: 250,
            source: "provider",
          },
          {
            metric_type: "css_seconds_per_100m",
            recorded_at: new Date("2026-01-01T00:00:00.000Z"),
            unit: "s/100m",
            value: 80,
            source: "provider",
          },
        ],
        recentEfforts: [
          {
            activity_id: "fresh-bike",
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "watts",
            value: 300,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: { activity_id: "fresh-bike", derived_from: "activity_file_stream" },
          },
          {
            activity_id: "fresh-run",
            activity_category: "run",
            duration_seconds: 1200,
            effort_type: "speed",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "meters_per_second",
            value: 5,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: { activity_id: "fresh-run", derived_from: "activity_file_stream" },
          },
          {
            activity_id: "fresh-swim",
            activity_category: "swim",
            duration_seconds: 1200,
            effort_type: "speed",
            recorded_at: new Date("2026-04-30T00:00:00.000Z"),
            unit: "meters_per_second",
            value: 1.5,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: { activity_id: "fresh-swim", derived_from: "activity_file_stream" },
          },
        ],
      },
    });

    expect(result.profileMetrics).toMatchObject({
      ftp: 285,
      threshold_speed_mps: 5,
      swim_threshold_speed_mps: 1.5,
    });
  });

  it("resolves latest linked LTHR by sport and keeps unlinked or manual LTHR generic", () => {
    const evidence = {
      profile: { dob: null, gender: null },
      profileMetrics: [
        {
          id: "self-bike-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-30T00:00:00.000Z"),
          unit: "bpm",
          value: 180,
          source: "derived" as const,
          reference_activity_id: "activity-under-analysis",
          reference_activity_category: "bike",
        },
        {
          id: "latest-prior-bike-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-20T00:00:00.000Z"),
          unit: "beats_per_minute",
          value: 172,
          source: "derived" as const,
          reference_activity_id: "prior-bike",
          reference_activity_category: "bike",
        },
        {
          id: "older-bike-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-10T00:00:00.000Z"),
          unit: "bpm",
          value: 170,
          source: "derived" as const,
          reference_activity_id: "older-bike",
          reference_activity_category: "bike",
        },
        {
          id: "run-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-15T00:00:00.000Z"),
          unit: "beats per minute",
          value: 168,
          source: "test" as const,
          reference_activity_id: "run-test",
          reference_activity_category: "run",
        },
        {
          id: "wrong-unit-generic-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-28T00:00:00.000Z"),
          unit: "watts",
          value: 200,
          source: "provider" as const,
          reference_activity_id: null,
          reference_activity_category: null,
        },
        {
          id: "manual-generic-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-25T00:00:00.000Z"),
          unit: "bpm",
          value: 160,
          source: "manual" as const,
          reference_activity_id: "manual-reference",
          reference_activity_category: "swim",
        },
        {
          id: "wrong-unit-swim-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-27T00:00:00.000Z"),
          unit: "seconds_per_100m",
          value: 90,
          source: "test" as const,
          reference_activity_id: "swim-test",
          reference_activity_category: "swim",
        },
        {
          id: "older-unlinked-lthr",
          metric_type: "lthr" as const,
          recorded_at: new Date("2026-04-05T00:00:00.000Z"),
          unit: "bpm",
          value: 155,
          source: "provider" as const,
          reference_activity_id: null,
          reference_activity_category: null,
        },
      ],
      recentEfforts: [],
    };

    const withoutSelf = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      activityId: "activity-under-analysis",
      evidence,
    }).profileMetrics;
    expect(withoutSelf).toMatchObject({
      lthr: 160,
      lthr_by_sport: { bike: 172, run: 168 },
    });
    expect(withoutSelf.lthr_by_sport).not.toHaveProperty("swim");
    expect(
      resolveActivityContextFromEvidence({
        activityTimestamp: "2026-05-01T12:00:00.000Z",
        evidence,
      }).profileMetrics.lthr_by_sport,
    ).toMatchObject({ bike: 180, run: 168 });
  });

  it("finds a valid threshold observation after more than 50 unrelated recent efforts", () => {
    const recentEfforts = Array.from({ length: 60 }, (_, index) => ({
      activity_id: `recent-sprint-${index}`,
      activity_category: "bike" as const,
      duration_seconds: 5,
      effort_type: "power" as const,
      recorded_at: new Date(`2026-05-01T11:${String(59 - index).padStart(2, "0")}:00.000Z`),
      unit: "watts",
      value: 600,
      source: "imported",
      method: "activity_file_best_effort",
      provenance: {
        activity_id: `recent-sprint-${index}`,
        derived_from: "activity_file_stream",
      },
    }));

    const result = resolveActivityContextFromEvidence({
      activityTimestamp: "2026-05-01T12:00:00.000Z",
      evidence: {
        profile: { dob: null, gender: null },
        profileMetrics: [],
        recentEfforts: [
          ...recentEfforts,
          {
            activity_id: "older-threshold",
            activity_category: "bike",
            duration_seconds: 1200,
            effort_type: "power",
            recorded_at: new Date("2026-04-20T10:00:00.000Z"),
            unit: "watts",
            value: 250,
            source: "imported",
            method: "activity_file_best_effort",
            provenance: {
              activity_id: "older-threshold",
              derived_from: "activity_file_stream",
            },
          },
        ],
      },
    });

    expect(result.profileMetrics.ftp).toBe(238);
    expect(result.recentEfforts).toHaveLength(50);
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
          activity_id: null,
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-03T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 320 / 0.95,
          method: "profile_update_override",
          provenance: active,
          source: "manual",
        },
        {
          id: "ftp-cleared",
          activity_id: null,
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-02T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 0,
          method: "profile_update_override",
          provenance: cleared,
          source: "manual",
        },
        {
          id: "ftp-active",
          activity_id: null,
          activity_category: "bike" as const,
          duration_seconds: 1200,
          effort_type: "power" as const,
          recorded_at: new Date("2026-05-01T00:00:00.000Z"),
          unit: "ftp_manual",
          value: 300 / 0.95,
          method: "profile_update_override",
          provenance: active,
          source: "manual",
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
