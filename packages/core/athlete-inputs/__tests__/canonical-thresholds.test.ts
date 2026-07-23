import { describe, expect, it } from "vitest";
import { getEligibleThresholdValue, resolveCanonicalThresholds } from "../canonical-thresholds";

const now = "2026-07-12T12:00:00.000Z";
const freshnessWindowMs = 7 * 24 * 60 * 60 * 1000;

describe("resolveCanonicalThresholds", () => {
  it("exposes a single eligibility boundary for numeric threshold consumers", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 250,
          observedAt: "2026-06-01T12:00:00.000Z",
          source: "manual",
        },
      ],
    });

    expect(result.cycling_ftp.value).toBe(250);
    expect(result.cycling_ftp.stale).toBe(true);
    expect(getEligibleThresholdValue(result.cycling_ftp)).toBeNull();
  });

  it("prioritizes a fresh locked manual threshold over trusted activity effort", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 250,
          observedAt: "2026-07-11T12:00:00.000Z",
          source: "manual",
          locked: true,
        },
      ],
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({
      value: 250,
      unit: "W",
      source: "manual",
      confidence: "high",
      stale: false,
      eligibilityReason: "eligible",
    });
  });

  it("calculates canonical thresholds from fresh actual 20-minute efforts", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
        {
          sport: "run",
          metric: "speed",
          value: 4,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
        {
          sport: "swim",
          metric: "speed",
          value: 1.25,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp.value).toBe(285);
    expect(result.cycling_ftp).toMatchObject({ confidence: "medium", estimate: true });
    expect(result.running_threshold_pace).toMatchObject({
      value: 250,
      unit: "seconds_per_km",
      source: "observed_effort",
    });
    expect(result.swimming_css).toMatchObject({
      value: 80,
      unit: "seconds_per_100m",
      source: "observed_effort",
    });
  });

  it("uses direct threshold seeds in manual, provider, then modeled precedence", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 245,
          observedAt: "2026-07-01T12:00:00.000Z",
          source: "provider",
        },
        {
          threshold: "cycling_ftp",
          value: 240,
          observedAt: "2026-06-01T12:00:00.000Z",
          source: "manual",
        },
        { threshold: "running_threshold_pace", value: 260, observedAt: now, source: "modeled" },
        { threshold: "swimming_css", value: 90, observedAt: now, source: "estimated" },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({
      value: 240,
      source: "manual",
      stale: true,
      eligibilityReason: "stale",
    });
    expect(result.running_threshold_pace).toMatchObject({
      value: 260,
      source: "modeled",
      confidence: "low",
    });
    expect(result.swimming_css).toMatchObject({
      value: 90,
      source: "estimated",
      confidence: "low",
    });
  });

  it("uses a fresh effort ahead of unlocked manual, provider, and modeled seeds", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        { threshold: "cycling_ftp", value: 290, observedAt: now, source: "manual" },
        { threshold: "cycling_ftp", value: 295, observedAt: now, source: "provider" },
        { threshold: "cycling_ftp", value: 300, observedAt: now, source: "modeled" },
      ],
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({ value: 285, source: "observed_effort" });
  });

  it("does not let a stale locked manual threshold outrank a fresh observed effort", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 250,
          observedAt: "2026-06-01T12:00:00.000Z",
          source: "manual",
          locked: true,
        },
      ],
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({ value: 285, source: "observed_effort" });
  });

  it("excludes modeled and derived efforts, stale efforts, and unsupported durations", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "modeled",
        },
        {
          sport: "run",
          metric: "speed",
          value: 4,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "derived",
        },
        {
          sport: "swim",
          metric: "speed",
          value: 1.25,
          durationSeconds: 1200,
          observedAt: "2026-06-01T12:00:00.000Z",
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
        {
          sport: "bike",
          metric: "power",
          value: 320,
          durationSeconds: 1199,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp.source).toBe("unknown");
    expect(result.running_threshold_pace.source).toBe("unknown");
    expect(result.swimming_css.source).toBe("unknown");
  });

  it("does not trust an actual flag without provenance-backed evidence", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
        },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({ value: null, source: "unknown" });
  });

  it("prioritizes a fresh validated threshold test after a locked manual override", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      directMetrics: [
        {
          threshold: "swimming_css",
          value: 95,
          observedAt: now,
          source: "validated_test",
          calculationVersion: "css_400m_200m_v1",
        },
        {
          threshold: "cycling_ftp",
          value: 250,
          observedAt: now,
          source: "validated_test",
          calculationVersion: "bike_test_v1",
        },
      ],
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.swimming_css).toMatchObject({
      value: 95,
      source: "validated_test",
      confidence: "high",
      estimate: false,
      calculationVersion: "css_400m_200m_v1",
    });
    expect(result.cycling_ftp).toMatchObject({
      value: 250,
      source: "validated_test",
      calculationVersion: "bike_test_v1",
    });
  });

  it("keeps an eligible FTP ahead of guarded critical power", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      criticalPower: {
        valueWatts: 255,
        observedAt: now,
        evidenceFingerprint: "cp:activity-a:activity-b",
        calculationVersion: "critical-power-curve-fit-v1",
      },
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp.value).toBe(285);
    expect(result.cycling_power).toMatchObject({
      kind: "ftp",
      value: 285,
      source: "observed_effort",
      calculationVersion: "twenty_minute_effort_v1",
      evidenceFingerprint: null,
    });
  });

  it("does not let guarded Critical Power replace locked manual or validated FTP", () => {
    const criticalPower = {
      valueWatts: 255,
      observedAt: now,
      evidenceFingerprint: "cp:fit",
      calculationVersion: "critical-power-curve-fit-v1",
    };
    const locked = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      criticalPower,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 250,
          observedAt: now,
          source: "manual",
          locked: true,
        },
      ],
    });
    const validated = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      criticalPower,
      directMetrics: [
        {
          threshold: "cycling_ftp",
          value: 248,
          observedAt: now,
          source: "validated_test",
        },
      ],
    });

    expect(locked.cycling_power).toMatchObject({
      kind: "ftp",
      value: 250,
      source: "manual",
    });
    expect(validated.cycling_power).toMatchObject({
      kind: "ftp",
      value: 248,
      source: "validated_test",
    });
  });

  it("uses guarded critical power when FTP is unavailable", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      criticalPower: {
        valueWatts: 255,
        observedAt: now,
        evidenceFingerprint: "cp:activity-a:activity-b",
        calculationVersion: "critical-power-curve-fit-v1",
      },
    });

    expect(result.cycling_ftp.source).toBe("unknown");
    expect(result.cycling_power).toMatchObject({
      kind: "critical_power",
      value: 255,
      evidenceFingerprint: "cp:activity-a:activity-b",
    });
  });

  it("selects the strongest eligible recent activity effort, not merely the latest", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: "2026-07-08T12:00:00.000Z",
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
        {
          sport: "bike",
          metric: "power",
          value: 280,
          durationSeconds: 1200,
          observedAt: "2026-07-12T11:00:00.000Z",
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_ftp).toMatchObject({
      value: 285,
      observedAt: "2026-07-08T12:00:00.000Z",
    });
  });

  it("falls back when critical power is stale or invalid", () => {
    const result = resolveCanonicalThresholds({
      now,
      freshnessWindowMs,
      criticalPower: {
        valueWatts: 260,
        observedAt: "2026-06-01T00:00:00.000Z",
        evidenceFingerprint: "cp:stale",
        calculationVersion: "critical-power-curve-fit-v1",
      },
      activityEfforts: [
        {
          sport: "bike",
          metric: "power",
          value: 300,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
          evidence: "imported_activity_stream",
        },
      ],
    });

    expect(result.cycling_power).toMatchObject({
      kind: "ftp",
      value: 285,
      calculationVersion: "twenty_minute_effort_v1",
    });
  });
});
