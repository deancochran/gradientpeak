import { describe, expect, it } from "vitest";
import {
  activityDerivedMetricsSchema,
  activityDerivedStressSchema,
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

function completeQuality(fingerprint: string) {
  return {
    source: "validated_test" as const,
    observed_at: "2026-02-28T10:00:00.000Z",
    valid_at: "2026-02-28T12:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "threshold-v1",
    evidence_fingerprint: fingerprint,
  };
}

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

  it("keeps Critical Power load distinct from FTP-based TSS", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "critical-power-bike",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: {
          ftp: 240,
          cycling_power_watts: 250,
          cycling_power_method: "critical_power_threshold",
        },
        calibrationQuality: {
          cyclingPower: {
            source: "observed_effort",
            observed_at: "2026-02-28T10:00:00.000Z",
            confidence: "medium",
            stale: false,
            estimate: true,
            calculation_version: "critical-power-curve-fit-v1",
            evidence_fingerprint: "cp:curve",
          },
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: 64,
      intensity_factor: 0.8,
      method: "critical_power_threshold",
      calibration_quality: {
        calculation_version: "critical-power-curve-fit-v1",
      },
      tss_identity: {
        method: "critical_power_threshold",
        calibration: { type: "critical_power_watts", value: 250 },
      },
    });
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
      common_load: {
        status: "unavailable",
        sport: "other",
        reason: Number.isFinite(duration) ? "unsupported_modality" : "invalid_data",
      },
    });
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
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

  it("parses a pre-common-Load detail fixture during additive rollout", () => {
    const preTrancheDetail = {
      tss: 64,
      tss_identity: {
        sport: "bike",
        method: "power_threshold",
        source: "activity_analysis",
        version: "1",
        calibration: { type: "ftp_watts", value: 250 },
      },
      intensity_factor: 0.8,
      method: "power_threshold",
      unavailable_reason: null,
      calibration_quality: null,
      trimp: null,
      trimp_source: null,
      training_effect: "tempo",
    } as const;

    expect(activityDerivedStressSchema.parse(preTrancheDetail)).toEqual(preTrancheDetail);
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

  it.each([
    {
      name: "FTP power",
      sport: "bike",
      activity: { normalized_power: 200 },
      profileMetrics: { ftp: 250 },
      calibrationQuality: { ftp: completeQuality("ftp-evidence") },
      method: "power_threshold",
      thresholdType: "ftp_watts",
      fingerprint: "ftp-evidence",
    },
    {
      name: "Critical Power",
      sport: "bike",
      activity: { normalized_power: 200 },
      profileMetrics: {
        cycling_power_watts: 250,
        cycling_power_method: "critical_power_threshold",
      },
      calibrationQuality: { cyclingPower: completeQuality("cp-evidence") },
      method: "critical_power_threshold",
      thresholdType: "critical_power_watts",
      fingerprint: "cp-evidence",
    },
    {
      name: "run pace",
      sport: "run",
      activity: { normalized_graded_speed_mps: 4 },
      profileMetrics: { threshold_speed_mps: 5 },
      calibrationQuality: { runThreshold: completeQuality("run-evidence") },
      method: "run_pace_threshold",
      thresholdType: "threshold_speed_mps",
      fingerprint: "run-evidence",
    },
    {
      name: "swim pace",
      sport: "swim",
      activity: { normalized_speed_mps: 1.2 },
      profileMetrics: { swim_threshold_speed_mps: 1.5 },
      calibrationQuality: { swimThreshold: completeQuality("swim-evidence") },
      method: "swim_pace_threshold",
      thresholdType: "swim_threshold_speed_mps",
      fingerprint: "swim-evidence",
    },
  ] as const)("emits evidenced common Load for $name without changing legacy fields", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: `common-${example.sport}`,
        type: example.sport,
        ...timestamps,
        duration_seconds: 3600,
        ...example.activity,
      },
      context: {
        profileMetrics: example.profileMetrics,
        calibrationQuality: example.calibrationQuality,
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: 64,
      intensity_factor: 0.8,
      method: example.method,
      common_load: {
        status: "available",
        method: example.method,
        evidenceFingerprint: example.fingerprint,
        computedAsOf: timestamps.started_at,
        thresholdEvidence: {
          type: example.thresholdType,
          observedAt: "2026-02-28T10:00:00.000Z",
          validAt: "2026-02-28T12:00:00.000Z",
          sourceFingerprint: example.fingerprint,
        },
      },
    });
    if (derived.stress.common_load?.status !== "available") {
      throw new Error("Expected available common Load");
    }
    expect(derived.stress.common_load.intensity).toBeCloseTo(0.8, 12);
    expect(derived.stress.common_load.load).toBeCloseTo(64, 12);
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it.each([
    { observed_at: null, evidence_fingerprint: "quality-evidence" },
    { observed_at: "2026-02-28T10:00:00.000Z", evidence_fingerprint: null },
    { valid_at: undefined },
    { valid_at: "2026-03-02T10:00:00.000Z" },
  ])("does not fabricate incomplete common Load provenance", (missingEvidence) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "incomplete-provenance",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: {
          ftp: { ...completeQuality("quality-evidence"), ...missingEvidence },
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({ tss: 64, intensity_factor: 0.8 });
    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      reason: "invalid_data",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
    });
  });

  it("uses an unclamped direct threshold ratio to reject common intensity above 1.5", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "raw-intensity",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 400,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: completeQuality("raw-intensity-evidence") },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: 225,
      intensity_factor: 1.5,
      common_load: {
        status: "unavailable",
        reason: "intensity_out_of_range",
        method: "power_threshold",
      },
    });
  });

  it("selects cycling threshold value and quality from the same source", () => {
    const baseInput = {
      activity: {
        id: "atomic-cycling-threshold",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: {
          ftp: 240,
          cycling_power_watts: 250,
          cycling_power_method: "power_threshold" as const,
        },
        recentEfforts: [],
        profile: {},
      },
    };
    const mismatched = analyzeActivityDerivedMetrics({
      ...baseInput,
      context: {
        ...baseInput.context,
        calibrationQuality: { ftp: completeQuality("ftp-only") },
      },
    });
    const matched = analyzeActivityDerivedMetrics({
      ...baseInput,
      context: {
        ...baseInput.context,
        calibrationQuality: {
          ftp: completeQuality("ftp-unused"),
          cyclingPower: completeQuality("cycling-selected"),
        },
      },
    });

    expect(mismatched.stress).toMatchObject({
      tss: 64,
      calibration_quality: null,
      common_load: { status: "unavailable", reason: "invalid_data" },
    });
    expect(matched.stress).toMatchObject({
      calibration_quality: { evidence_fingerprint: "cycling-selected" },
      common_load: {
        status: "available",
        evidenceFingerprint: "cycling-selected",
        thresholdEvidence: { value: 250 },
      },
    });
  });

  it.each([
    {
      name: "sport-specific threshold with only generic quality",
      profileMetrics: { lthr: 160, lthr_by_sport: { run: 150 } },
      calibrationQuality: { lthr: completeQuality("generic-mismatch") },
    },
    {
      name: "generic threshold with only sport-specific quality",
      profileMetrics: { lthr: 150 },
      calibrationQuality: {
        lthrBySport: { run: completeQuality("sport-mismatch") },
      },
    },
  ] as const)("does not cross-fallback LTHR quality for $name", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "atomic-lthr",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: example.profileMetrics,
        calibrationQuality: example.calibrationQuality,
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 3600,
        buckets: [{ bpm: 150, seconds: 3600 }],
      },
    });

    expect(derived.stress.tss).not.toBeNull();
    expect(derived.stress.calibration_quality).toBeNull();
    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      reason: "invalid_data",
      quality: null,
    });
  });

  it("uses valid moving duration for direct common Load without changing legacy TSS", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "paused-direct-load",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        moving_seconds: 1800,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: completeQuality("paused-direct") },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.tss).toBe(64);
    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      contributingDurationSeconds: 1800,
    });
    expect(
      derived.stress.common_load?.status === "available" && derived.stress.common_load.load,
    ).toBeCloseTo(32, 12);
  });

  it.each([
    ["omitted", {}],
    ["null", { moving_seconds: null }],
  ] as const)("uses elapsed duration when moving_seconds is %s", (_name, movingInput) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "absent-moving-duration",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
        ...movingInput,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: completeQuality("absent-moving") },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      contributingDurationSeconds: 3600,
    });
  });

  it.each([
    0,
    3601,
    Number.NaN,
  ])("rejects explicitly invalid moving duration %s for common Load", (movingSeconds) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "invalid-moving-duration",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        moving_seconds: movingSeconds,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: completeQuality("invalid-moving") },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress).toMatchObject({
      tss: 64,
      intensity_factor: 0.8,
      common_load: {
        status: "unavailable",
        reason: "invalid_data",
        contributingDurationSeconds: null,
      },
    });
  });

  it("accepts RFC3339 offsets consistently across common provenance timestamps", () => {
    const startedAt = "2026-03-01T12:00:00+02:00";
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "offset-provenance",
        type: "bike",
        started_at: startedAt,
        finished_at: "2026-03-01T13:00:00+02:00",
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: {
          ftp: {
            ...completeQuality("offset-evidence"),
            observed_at: "2026-02-28T12:00:00+02:00",
            valid_at: "2026-03-01T09:30:00+00:00",
          },
        },
        recentEfforts: [],
        profile: {},
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      computedAsOf: startedAt,
      thresholdEvidence: {
        observedAt: "2026-02-28T12:00:00+02:00",
        validAt: "2026-03-01T09:30:00+00:00",
      },
    });
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it("uses a full HR distribution for common Load while preserving legacy average-HR TSS", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "full-hr-distribution",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("lthr-evidence") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 3600,
        buckets: [
          { bpm: 110, seconds: 1800 },
          { bpm: 150, seconds: 1800 },
        ],
      },
    });

    expect(derived.stress.tss).toBe(100);
    expect(derived.stress.intensity_factor).toBe(1);
    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 3600,
      evidenceFingerprint: "lthr-evidence",
    });
    expect(
      derived.stress.common_load?.status === "available" && derived.stress.common_load.load,
    ).toBeCloseTo(79.625, 12);
  });

  it("emits coherent partial common Load for qualifying partial HR coverage", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "partial-hr-distribution",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("partial-lthr-evidence") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 1800,
        buckets: [{ bpm: 150, seconds: 1800 }],
      },
    });

    expect(derived.stress.common_load).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      contributingDurationSeconds: 1800,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 0.5,
      reason: "duration_partial",
    });
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it("accepts active-duration HR coverage that exceeds moving time during pauses", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "paused-hr-distribution",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        moving_seconds: 0,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("paused-lthr") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 3600,
        buckets: [{ bpm: 150, seconds: 3600 }],
      },
    });

    expect(derived.stress.tss).toBe(100);
    expect(derived.stress.common_load).toMatchObject({
      status: "available",
      method: "heart_rate_zones",
      contributingDurationSeconds: 3600,
    });
  });

  it("keeps partial HR coverage relative to active duration for a paused segment", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "paused-partial-hr-distribution",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        moving_seconds: 1800,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("paused-partial-lthr") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 2700,
        buckets: [{ bpm: 150, seconds: 2700 }],
      },
    });

    expect(derived.stress.tss).toBe(100);
    expect(derived.stress.common_load).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      contributingDurationSeconds: 2700,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 0.75,
      reason: "duration_partial",
    });
    if (derived.stress.common_load?.status !== "partial") {
      throw new Error("Expected partial HR common Load");
    }
    expect(derived.stress.common_load.intensity).toBeCloseTo(1.05, 12);
    expect(derived.stress.common_load.load).toBeCloseTo(82.6875, 12);
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it("preserves partial HR load and legacy TSS at sixty-percent active coverage", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "paused-sixty-percent-hr-distribution",
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        moving_seconds: 1200,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("paused-sixty-percent-lthr") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: {
        coverageSeconds: 2160,
        buckets: [{ bpm: 150, seconds: 2160 }],
      },
    });

    expect(derived.stress.tss).toBe(100);
    expect(derived.stress.intensity_factor).toBe(1);
    expect(derived.stress.common_load).toMatchObject({
      status: "partial",
      method: "heart_rate_zones",
      contributingDurationSeconds: 2160,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 0.6,
      reason: "duration_partial",
    });
    if (derived.stress.common_load?.status !== "partial") {
      throw new Error("Expected partial HR common Load");
    }
    expect(derived.stress.common_load.intensity).toBeCloseTo(1.05, 12);
    expect(derived.stress.common_load.load).toBeCloseTo(66.15, 12);
    expect(activityDerivedMetricsSchema.parse(derived)).toEqual(derived);
  });

  it.each([
    { name: "missing", distribution: undefined, reason: "activity_data_missing" },
    {
      name: "insufficient",
      distribution: { coverageSeconds: 1200, buckets: [{ bpm: 150, seconds: 1200 }] },
      reason: "insufficient_coverage",
    },
  ] as const)("keeps common HR Load unavailable for $name distribution", (example) => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: `${example.name}-hr-distribution`,
        type: "run",
        ...timestamps,
        duration_seconds: 3600,
        avg_heart_rate: 150,
      },
      context: {
        profileMetrics: { lthr: 150 },
        calibrationQuality: { lthr: completeQuality("lthr-evidence") },
        recentEfforts: [],
        profile: {},
      },
      heartRateDistribution: example.distribution
        ? {
            coverageSeconds: example.distribution.coverageSeconds,
            buckets: example.distribution.buckets.map((bucket) => ({ ...bucket })),
          }
        : undefined,
    });

    expect(derived.stress).toMatchObject({ tss: 100, intensity_factor: 1 });
    expect(derived.stress.common_load).toMatchObject({
      status: "unavailable",
      method: "heart_rate_zones",
      reason: example.reason,
    });
  });

  it("adds common Load to list summaries without breaking compatibility fixtures", () => {
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: "list-common-load",
        type: "bike",
        ...timestamps,
        duration_seconds: 3600,
        normalized_power: 200,
      },
      context: {
        profileMetrics: { ftp: 250 },
        calibrationQuality: { ftp: completeQuality("list-evidence") },
        recentEfforts: [],
        profile: {},
      },
    });
    const summary = { ...derived.stress, computed_as_of: derived.computed_as_of };

    expect(activityListDerivedSummarySchema.parse(summary).common_load).toEqual(
      derived.stress.common_load,
    );
    expect(
      activityListDerivedSummarySchema.safeParse({
        ...summary,
        common_load: { ...summary.common_load, status: "partial" },
      }).success,
    ).toBe(false);
  });
});
