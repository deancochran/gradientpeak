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
  });
});
