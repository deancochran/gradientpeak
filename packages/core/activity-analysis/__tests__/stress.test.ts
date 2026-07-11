import { describe, expect, it } from "vitest";
import { activityDerivedMetricsSchema, analyzeActivityDerivedMetrics } from "..";

describe("activity analysis", () => {
  it("derives stress metrics from activity-local facts", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "activity-1",
        type: "bike",
        started_at: "2026-03-01T10:00:00.000Z",
        finished_at: "2026-03-01T11:00:00.000Z",
        duration_seconds: 3600,
        avg_power: 240,
        normalized_power: 250,
        avg_heart_rate: 160,
      },
      context: {
        profileMetrics: {
          ftp: 250,
          lthr: 165,
          max_hr: 190,
          resting_hr: 50,
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
    expect(derived.stress.tss).toBe(100);
    expect(derived.stress.tss_identity).toEqual({
      sport: "bike",
      method: "power_threshold",
      source: "activity_analysis",
      version: "1",
      calibration: { type: "ftp_watts", value: 250 },
    });
    expect(derived.stress.intensity_factor).toBe(1);
    expect(derived.stress.trimp).toBeGreaterThan(0);
    expect(derived.stress.trimp_source).toBe("hr");
    expect(derived.stress.training_effect).toBe("vo2max");
    expect(derived.computed_as_of).toBe("2026-03-01T11:00:00.000Z");
  });

  it("returns empty zones without stream data", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "activity-2",
        type: "run",
        started_at: "2026-03-01T10:00:00.000Z",
        finished_at: "2026-03-01T10:30:00.000Z",
        duration_seconds: 1800,
      },
      context: {
        profileMetrics: {},
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.zones.hr).toEqual([]);
    expect(derived.zones.power).toEqual([]);
    expect(derived.stress.tss).toBeNull();
    expect(derived.stress.trimp).toBeNull();
  });

  it("estimates TSS and IF from heart-rate reserve when power threshold data is unavailable", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "activity-hr-only",
        type: "run",
        started_at: "2026-03-01T10:00:00.000Z",
        finished_at: "2026-03-01T11:00:00.000Z",
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: {
          max_hr: 190,
          resting_hr: 50,
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.intensity_factor).toBe(0.71);
    expect(derived.stress.tss).toBe(50);
    expect(derived.stress.tss_identity?.method).toBe("heart_rate_reserve");
    expect(derived.stress.tss_identity?.calibration).toEqual({
      type: "heart_rate_reserve_bpm",
      resting: 50,
      maximum: 190,
    });
    expect(derived.stress.trimp).toBeGreaterThan(0);
    expect(derived.stress.training_effect).toBe("base");
  });

  it("derives running TSS and IF from effort-based threshold speed before heart-rate fallback", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "activity-run-speed",
        type: "run",
        started_at: "2026-03-01T10:00:00.000Z",
        finished_at: "2026-03-01T11:00:00.000Z",
        duration_seconds: 3600,
        avg_heart_rate: 120,
        normalized_graded_speed_mps: 4,
      },
      context: {
        profileMetrics: {
          max_hr: 190,
          resting_hr: 50,
          threshold_speed_mps: 5,
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.intensity_factor).toBe(0.8);
    expect(derived.stress.tss).toBe(64);
    expect(derived.stress.tss_identity?.method).toBe("run_pace_threshold");
    expect(derived.stress.tss_identity?.calibration).toEqual({
      type: "threshold_speed_mps",
      value: 5,
    });
    expect(derived.stress.training_effect).toBe("tempo");
  });

  it("derives TSS and IF from as-of threshold context", () => {
    const activity = {
      id: "activity-3",
      type: "bike",
      started_at: "2026-03-01T10:00:00.000Z",
      finished_at: "2026-03-01T11:00:00.000Z",
      duration_seconds: 3600,
      normalized_power: 250,
    } as const;

    const lowerFtpDerived = analyzeActivityDerivedMetrics({
      activity,
      context: {
        profileMetrics: { ftp: 200 },
        recentEfforts: [],
        profile: {},
      },
    });

    const higherFtpDerived = analyzeActivityDerivedMetrics({
      activity,
      context: {
        profileMetrics: { ftp: 250 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(lowerFtpDerived.stress.intensity_factor).toBe(1.25);
    expect(lowerFtpDerived.stress.tss).toBe(156);
    expect(higherFtpDerived.stress.intensity_factor).toBe(1);
    expect(higherFtpDerived.stress.tss).toBe(100);
    expect(lowerFtpDerived.stress.tss_identity?.calibration).toEqual({
      type: "ftp_watts",
      value: 200,
    });
    expect(higherFtpDerived.stress.tss_identity?.calibration).toEqual({
      type: "ftp_watts",
      value: 250,
    });
  });

  it("does not derive TSS or a proxy TRIMP source for a non-canonical sport", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "unknown-sport",
        type: "ride",
        started_at: "2026-03-01T10:00:00.000Z",
        finished_at: "2026-03-01T11:00:00.000Z",
        duration_seconds: 3600,
        normalized_power: 250,
      },
      context: {
        profileMetrics: { ftp: 250 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: null,
      tss_identity: null,
      intensity_factor: null,
      trimp: null,
      trimp_source: null,
    });
  });
});
