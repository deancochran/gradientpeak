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

  it("caps daily load by explicit availability duration", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [
            { day: "monday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
            { day: "wednesday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
            { day: "friday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
          ],
          hard_rest_days: [],
        },
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 120,
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      40.5,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(300);
    expect(
      points.some((point) =>
        point.reason_codes.includes("weekly_target_under_allocated_daily_caps"),
      ),
    ).toBe(true);
  });

  it("caps daily load by max single session duration", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 250 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 30,
        },
      },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      40.5,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(250);
  });

  it("keeps hard rest days at zero and under-allocates instead of spilling above caps", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 400 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [
            { day: "monday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }] },
            { day: "tuesday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }] },
          ],
          hard_rest_days: ["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 1,
          max_sessions_per_week: 1,
          max_single_session_duration_minutes: 60,
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThanOrEqual(
      60,
    );
    expect(points.find((point) => point.date === "2026-01-06")?.reason_codes).toContain(
      "hard_rest_day_cap",
    );
  });

  it("caps daily load for low CTL and low readiness", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 220 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 120,
        },
      },
      capacityContext: { startingCtl: 12, startingAtl: 20, startingTsb: -8, readinessScore: 30 },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(20);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(220);
    expect(
      points.some((point) => point.reason_codes.includes("athlete_capacity_cap_applied")),
    ).toBe(true);
  });

  it("does not add rounding remainder above a binding daily cap", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 100.1 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 2,
          max_sessions_per_week: 2,
          max_single_session_duration_minutes: 50,
        },
      },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      60.1,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThanOrEqual(
      100.1,
    );
  });

  it("returns zero load when every profiled day is unavailable", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [],
          hard_rest_days: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      },
    });

    expect(points.map((point) => point.recommended_load_tss)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(
      points.every((point) => point.reason_codes.includes("all_training_days_unavailable")),
    ).toBe(true);
  });
});
