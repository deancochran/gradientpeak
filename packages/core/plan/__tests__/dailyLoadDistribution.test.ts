import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildDailyLoadDistribution } from "../dailyLoadDistribution";

describe("buildDailyLoadDistribution", () => {
  it("returns no points for inverted date ranges", () => {
    expect(
      buildDailyLoadDistribution({
        startDate: "2026-01-12",
        endDate: "2026-01-05",
        weeklyTargets: [{ weekStartDate: "2026-01-12", targetTss: 300 }],
        preferenceProfile: defaultAthletePreferenceProfile,
      }),
    ).toEqual([]);
  });

  it("distributes derived weekly load across available training days", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300, phase: "ramp" }],
      preferenceProfile: defaultAthletePreferenceProfile,
    });

    const loads = points.map((point) => point.recommended_load_tss);
    expect(loads.reduce((sum, load) => sum + load, 0)).toBe(300);
    expect(loads.filter((load) => load > 0).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...loads)).toBeLessThan(300);
    expect(Math.max(...loads)).toBeLessThanOrEqual(135);
  });

  it("honors hard rest days from profile preferences", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 210 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          ...defaultAthletePreferenceProfile.availability,
          hard_rest_days: ["wednesday", "friday", "sunday"],
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-07")?.recommended_load_tss).toBe(0);
    expect(points.find((point) => point.date === "2026-01-09")?.recommended_load_tss).toBe(0);
    expect(points.find((point) => point.date === "2026-01-11")?.recommended_load_tss).toBe(0);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(210);
  });

  it("prorates weekly targets across partial weeks while keeping the date range contiguous", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-14",
      weeklyTargets: [
        { weekStartDate: "2026-01-05", targetTss: 210 },
        { weekStartDate: "2026-01-12", targetTss: 280 },
      ],
      preferenceProfile: defaultAthletePreferenceProfile,
    });

    expect(points.map((point) => point.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      "2026-01-11",
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
    ]);
    expect(points.slice(0, 7).reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(
      210,
    );
    expect(points.slice(7).reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(120);
  });

  it("uses profile dose limits when preferences are unadjusted elsewhere", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 280 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 4,
          max_sessions_per_week: 4,
        },
      },
    });

    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(4);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(280);
  });
});
