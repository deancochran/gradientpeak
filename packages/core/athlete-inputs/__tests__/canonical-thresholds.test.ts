import { describe, expect, it } from "vitest";
import { resolveCanonicalThresholds } from "../canonical-thresholds";

const now = "2026-07-12T12:00:00.000Z";
const freshnessWindowMs = 7 * 24 * 60 * 60 * 1000;

describe("resolveCanonicalThresholds", () => {
  it("prefers a fresh locked manual metric over an eligible effort", () => {
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
        },
        {
          sport: "run",
          metric: "speed",
          value: 4,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
        },
        {
          sport: "swim",
          metric: "speed",
          value: 1.25,
          durationSeconds: 1200,
          observedAt: now,
          observationKind: "actual",
        },
      ],
    });

    expect(result.cycling_ftp.value).toBe(285);
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

  it("uses unlocked manual, provider, then modeled or estimated direct values when no observed effort is eligible", () => {
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
        },
        {
          sport: "bike",
          metric: "power",
          value: 320,
          durationSeconds: 1199,
          observedAt: now,
          observationKind: "actual",
        },
      ],
    });

    expect(result.cycling_ftp.source).toBe("unknown");
    expect(result.running_threshold_pace.source).toBe("unknown");
    expect(result.swimming_css.source).toBe("unknown");
  });
});
