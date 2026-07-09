import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildDailyLoadDistribution } from "../dailyLoadDistribution";

describe("buildDailyLoadDistribution", () => {
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

  it("uses explicit scheduling constraints before profile defaults", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 200 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          ...defaultAthletePreferenceProfile.availability,
          hard_rest_days: ["monday"],
        },
      },
      schedulingConstraints: {
        preferredWeekdays: [0, 2], // Numeric convention is Monday = 0, Wednesday = 2.
        hardRestDays: ["tuesday"],
        minSessionsPerWeek: 2,
        maxSessionsPerWeek: 2,
      },
    });

    expect(
      points.find((point) => point.date === "2026-01-05")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(
      points.find((point) => point.date === "2026-01-07")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(2);
  });

  it("anchors generated load on planned session dates", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      plannedSessions: [{ date: "2026-01-11", estimatedTss: 90 }],
      schedulingConstraints: {
        preferredWeekdays: [0, 2],
        minSessionsPerWeek: 2,
        maxSessionsPerWeek: 2,
      },
    });

    const sunday = points.find((point) => point.date === "2026-01-11");
    expect(sunday?.recommended_load_tss).toBeGreaterThan(0);
    expect(sunday?.reason_codes).toContain("planned_session_date_applied");
    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(2);
  });
});
