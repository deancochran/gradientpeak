import { describe, expect, it } from "vitest";
import { resolveCanonicalThresholds } from "../canonical-thresholds";

const now = "2026-07-12T12:00:00.000Z";
const freshnessWindowMs = 7 * 24 * 60 * 60 * 1000;

describe("resolveCanonicalThresholds", () => {
  it("ignores locked manual thresholds when trusted activity effort exists", () => {
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
      value: 285,
      unit: "W",
      source: "observed_effort",
      confidence: "medium",
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
      unit: "s/1000m",
      source: "observed_effort",
    });
    expect(result.swimming_css).toMatchObject({
      value: 80,
      unit: "s/100m",
      source: "observed_effort",
    });
  });

  it("does not use manual, provider, modeled, or estimated direct thresholds", () => {
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
      value: null,
      source: "unknown",
      stale: false,
      eligibilityReason: "unknown",
    });
    expect(result.running_threshold_pace).toMatchObject({
      value: null,
      source: "unknown",
      confidence: "unknown",
    });
    expect(result.swimming_css).toMatchObject({
      value: null,
      source: "unknown",
      confidence: "unknown",
    });
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

  it("retains validated tests as history without using them as threshold calibration", () => {
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
      source: "unknown",
      confidence: "unknown",
      estimate: false,
      calculationVersion: null,
    });
    expect(result.cycling_ftp).toMatchObject({
      source: "observed_effort",
      calculationVersion: "twenty_minute_effort_v1",
    });
  });

  it("selects guarded critical power ahead of a 20-minute FTP estimate", () => {
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
      kind: "critical_power",
      value: 255,
      source: "observed_effort",
      calculationVersion: "critical-power-curve-fit-v1",
      evidenceFingerprint: "cp:activity-a:activity-b",
    });
  });

  it("ignores locked manual and validated FTP when guarded Critical Power exists", () => {
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
      kind: "critical_power",
      value: 255,
      source: "observed_effort",
    });
    expect(validated.cycling_power).toMatchObject({
      kind: "critical_power",
      value: 255,
      source: "observed_effort",
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
