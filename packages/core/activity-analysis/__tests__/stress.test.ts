import { describe, expect, it } from "vitest";
import {
  activityDerivedMetricsSchema,
  activityListDerivedSummarySchema,
  activityTssIdentitySchema,
  analyzeActivityDerivedMetrics,
  completedActivityCalculationPolicy,
} from "..";

const timestamps = {
  started_at: "2026-03-01T10:00:00.000Z",
  finished_at: "2026-03-01T11:00:00.000Z",
} as const;

const emptyContext = {
  profileMetrics: {},
  recentEfforts: [],
  profile: {},
};

describe("activity analysis", () => {
  it.each([
    {
      sport: "bike",
      activity: { normalized_power: 200, avg_heart_rate: 150 },
      profileMetrics: { ftp: 250, lthr: 150 },
      method: "power_threshold",
      intensityFactor: 0.8,
    },
    {
      sport: "run",
      activity: { normalized_graded_speed_mps: 4, avg_heart_rate: 150 },
      profileMetrics: { threshold_speed_mps: 5, lthr: 150 },
      method: "run_pace_threshold",
      intensityFactor: 0.8,
    },
    {
      sport: "swim",
      activity: { normalized_speed_mps: 1.2, avg_heart_rate: 150 },
      profileMetrics: { swim_threshold_speed_mps: 1.5, lthr: 150 },
      method: "swim_pace_threshold",
      intensityFactor: 0.8,
    },
    {
      sport: "strength",
      activity: { avg_heart_rate: 150 },
      profileMetrics: { lthr: 150 },
      method: "heart_rate_threshold",
      intensityFactor: 1,
    },
    {
      sport: "other",
      activity: { avg_heart_rate: 150 },
      profileMetrics: { lthr: 150 },
      method: "heart_rate_threshold",
      intensityFactor: 1,
    },
  ] as const)("uses the ordered stress policy for $sport", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: `activity-${example.sport}`,
        type: example.sport,
        ...timestamps,
        duration_seconds: 3600,
        ...example.activity,
      },
      context: {
        profileMetrics: example.profileMetrics,
        recentEfforts: [],
        profile: {},
      },
    });

    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
    expect(derived.stress).toMatchObject({
      tss: Math.round(example.intensityFactor ** 2 * 100),
      intensity_factor: example.intensityFactor,
      method: example.method,
      unavailable_reason: null,
    });
    expect(derived.stress.tss_identity?.method).toBe(example.method);
    expect(derived.computed_as_of).toBe(timestamps.started_at);
  });

  it("uses generic LTHR when a sport-specific threshold is absent", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "generic-lthr",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 180 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: 69,
      intensity_factor: 0.83,
      method: "heart_rate_threshold",
      unavailable_reason: null,
      tss_identity: {
        calibration: { type: "lthr_bpm", value: 180 },
      },
    });
  });

  it("prefers sport-specific LTHR over generic LTHR", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "sport-lthr",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: {
          lthr: 180,
          lthr_by_sport: { bike: 150 },
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.intensity_factor).toBe(1);
    expect(derived.stress.tss_identity?.calibration).toEqual({
      type: "lthr_bpm",
      value: 150,
    });
  });

  it("bounds threshold-relative heart-rate IF to 1.5", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "bounded-hr-if",
        type: "other",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 250,
      },
      context: {
        profileMetrics: { lthr: 80 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.intensity_factor).toBe(1.5);
    expect(derived.stress.tss).toBe(225);
  });

  it("uses valid power and FTP despite invalid heart-rate inputs", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "power-with-invalid-hr",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
        avg_heart_rate: Number.NaN,
      },
      context: {
        profileMetrics: { ftp: 250, lthr: 170 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      method: "power_threshold",
      intensity_factor: 0.8,
      tss: 64,
      unavailable_reason: null,
    });
  });

  it("falls back to valid HR and LTHR when power inputs are invalid", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "hr-with-invalid-power",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: -1,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { ftp: -1, lthr: 150 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      method: "heart_rate_threshold",
      intensity_factor: 1,
      tss: 100,
      unavailable_reason: null,
    });
  });

  it("uses average power when normalized power is invalid", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "average-power-fallback",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: Number.NaN,
        avg_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      method: "power_threshold",
      intensity_factor: 0.8,
      tss: 64,
    });
  });

  it("uses the greater valid normalized or average speed for conservative swim IF", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "conservative-swim-if",
        type: "swim",
        ...timestamps,
        duration_seconds: 3600,
        normalized_speed_mps: 1.2,
        avg_speed_mps: 1.35,
      },
      context: {
        profileMetrics: { swim_threshold_speed_mps: 1.5 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      method: "swim_pace_threshold",
      intensity_factor: 0.9,
      tss: 81,
    });
  });

  it("carries estimate, source, and staleness without calling an effort estimate tested", () => {
    const calibrationQuality = {
      source: "observed_effort" as const,
      observed_at: "2026-01-01T00:00:00.000Z",
      confidence: "medium" as const,
      stale: true,
      estimate: true,
    };
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "estimated-threshold",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: calibrationQuality },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.calibration_quality).toEqual(calibrationQuality);
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it("uses full-precision IF for TSS before rounding returned IF", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "full-precision-if",
        type: "other",
        ...timestamps,
        duration_seconds: 36_000,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 180 },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.intensity_factor).toBe(0.83);
    expect(derived.stress.tss).toBe(694);
  });

  it.each([
    {
      name: "non-positive duration",
      duration_seconds: 0,
      avg_heart_rate: 150,
      profileMetrics: { lthr: 170 },
    },
    {
      name: "non-finite activity measurement",
      duration_seconds: 3600,
      avg_heart_rate: Number.NaN,
      profileMetrics: { lthr: 170 },
    },
    {
      name: "implausible LTHR",
      duration_seconds: 3600,
      avg_heart_rate: 150,
      profileMetrics: { lthr: 250 },
    },
    {
      name: "impossible primary measurement without a valid fallback",
      duration_seconds: 3600,
      normalized_power: -1,
      avg_heart_rate: undefined,
      profileMetrics: { ftp: 250 },
    },
  ])("returns invalid_data for $name", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "invalid",
        type: "bike",
        ...timestamps,
        duration_seconds: example.duration_seconds,
        avg_heart_rate: example.avg_heart_rate,
        normalized_power: example.normalized_power,
      },
      context: {
        profileMetrics: example.profileMetrics,
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: null,
      intensity_factor: null,
      method: null,
      unavailable_reason: "invalid_data",
      tss_identity: null,
    });
  });

  it.each([
    {
      name: "no compatible threshold",
      profileMetrics: {},
      activity: { normalized_power: 200 },
      reason: "threshold_missing",
    },
    {
      name: "a threshold without an activity measurement",
      profileMetrics: { ftp: 250 },
      activity: {},
      reason: "activity_data_missing",
    },
  ] as const)("reports $reason for $name", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "missing",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        ...example.activity,
      },
      context: {
        profileMetrics: example.profileMetrics,
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: null,
      intensity_factor: null,
      method: null,
      unavailable_reason: example.reason,
    });
  });

  it.each([
    [3600, "activity_data_missing"],
    [Number.POSITIVE_INFINITY, "invalid_data"],
  ] as const)("handles unknown runtime sports conservatively", (duration, reason) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "unknown-sport",
        type: "ride",
        ...timestamps,
        duration_seconds: duration,
        normalized_power: 250,
      },
      context: {
        ...emptyContext,
        profileMetrics: { ftp: 250 },
      },
    });

    expect(derived.stress).toMatchObject({
      tss: null,
      intensity_factor: null,
      method: null,
      unavailable_reason: reason,
    });
  });

  it("enforces method-aware stress and list invariants", () => {
    const identity = {
      sport: "bike",
      method: "heart_rate_threshold",
      source: "activity_analysis",
      version: "1",
      calibration: { type: "lthr_bpm", value: 170 },
    } as const;
    const available = {
      tss: 100,
      tss_identity: identity,
      intensity_factor: 1,
      method: "heart_rate_threshold",
      unavailable_reason: null,
      computed_as_of: timestamps.started_at,
    } as const;
    const unavailable = {
      tss: null,
      tss_identity: null,
      intensity_factor: null,
      method: null,
      unavailable_reason: "threshold_missing",
      computed_as_of: timestamps.started_at,
    } as const;

    expect(activityListDerivedSummarySchema.safeParse(available).success).toBe(true);
    expect(activityListDerivedSummarySchema.safeParse(unavailable).success).toBe(true);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...available,
        tss_identity: null,
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...available,
        method: "power_threshold",
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...unavailable,
        tss_identity: identity,
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...available,
        method: null,
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...unavailable,
        unavailable_reason: null,
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...available,
        intensity_factor: null,
      }).success,
    ).toBe(false);
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...unavailable,
        unavailable_reason: "private_data",
      }).success,
    ).toBe(true);
  });

  it("keeps historical heart-rate-reserve identities parseable but not selectable", () => {
    const historicalIdentity = {
      sport: "bike",
      method: "heart_rate_reserve",
      source: "activity_analysis",
      version: "1",
      calibration: {
        type: "heart_rate_reserve_bpm",
        resting: 50,
        maximum: 190,
      },
    } as const;

    expect(activityTssIdentitySchema.safeParse(historicalIdentity).success).toBe(true);
    expect(
      activityListDerivedSummarySchema.safeParse({
        tss: 100,
        tss_identity: historicalIdentity,
        intensity_factor: 1,
        method: "heart_rate_reserve",
        unavailable_reason: null,
        computed_as_of: timestamps.started_at,
      }).success,
    ).toBe(false);
    expect(
      Object.values(completedActivityCalculationPolicy).some((policy) =>
        (policy.tssMethods as readonly string[]).includes("heart_rate_reserve"),
      ),
    ).toBe(false);
  });

  it("returns empty zones without stream data", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "empty-zones",
        type: "run",
        ...timestamps,
        duration_seconds: 1800,
      },
      context: emptyContext,
    });

    expect(derived.zones).toEqual({ hr: [], power: [] });
    expect(derived.stress.unavailable_reason).toBe("threshold_missing");
  });
});
