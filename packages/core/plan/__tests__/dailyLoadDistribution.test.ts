import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildDailyLoadDistribution } from "../dailyLoadDistribution";

function profileWithSessionCount(sessionCount: number) {
  return {
    ...defaultAthletePreferenceProfile,
    dose_limits: {
      ...defaultAthletePreferenceProfile.dose_limits,
      min_sessions_per_week: sessionCount,
      max_sessions_per_week: sessionCount,
    },
  };
}

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

  it("uses build templates by session count while preserving weekly load", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300, phase: "build" }],
      preferenceProfile: profileWithSessionCount(3),
    });

    const trainingPoints = points.filter((point) => point.recommended_load_tss > 0);
    expect(trainingPoints.map((point) => point.primary_focus)).toEqual([
      "endurance",
      "threshold",
      "long_endurance",
    ]);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(300);
  });

  it("uses explicit deload templates without hard workout focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180, phase: "deload" }],
      preferenceProfile: profileWithSessionCount(4),
    });

    const trainingFocuses = points
      .filter((point) => point.recommended_load_tss > 0)
      .map((point) => point.primary_focus);
    expect(trainingFocuses).toEqual(["recovery", "endurance", "mobility", "recovery"]);
    expect(trainingFocuses).not.toContain("threshold");
    expect(trainingFocuses).not.toContain("tempo");
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(180);
  });

  it("protects race day and degrades adjacent hard taper focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 140,
          phase: "event",
          eventDate: "2026-01-07",
        },
      ],
      preferenceProfile: profileWithSessionCount(2),
    });

    expect(points.find((point) => point.date === "2026-01-06")?.primary_focus).toBe("endurance");
    expect(points.find((point) => point.date === "2026-01-07")?.primary_focus).toBe(
      "race_specific",
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(140);
  });

  it("keeps event day in event weeks and assigns post-event recovery", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 210,
          phase: "event",
          eventDate: "2026-01-11",
          recoveryRanges: [{ startDate: "2026-01-12", endDate: "2026-01-14" }],
        },
      ],
      preferenceProfile: profileWithSessionCount(3),
    });

    expect(points.find((point) => point.date === "2026-01-11")?.primary_focus).toBe(
      "race_specific",
    );
    expect(
      points.find((point) => point.date === "2026-01-11")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(210);
  });

  it("assigns post-event recovery later in the same event week", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 200,
          phase: "event",
          eventDate: "2026-01-07",
        },
      ],
      preferenceProfile: profileWithSessionCount(4),
    });

    expect(points.find((point) => point.date === "2026-01-07")?.primary_focus).toBe(
      "race_specific",
    );
    expect(points.find((point) => point.date === "2026-01-09")?.primary_focus).toBe("recovery");
    expect(points.find((point) => point.date === "2026-01-11")?.primary_focus).toBe("mobility");
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(200);
  });

  it("marks recovery overlap ranges when projection metadata provides them", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-12",
      endDate: "2026-01-18",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-12",
          targetTss: 120,
          phase: "recovery",
          recoveryRanges: [{ startDate: "2026-01-12", endDate: "2026-01-18" }],
        },
      ],
      preferenceProfile: profileWithSessionCount(3),
    });

    const trainingFocuses = points
      .filter((point) => point.recommended_load_tss > 0)
      .map((point) => point.primary_focus);
    expect(trainingFocuses).toEqual(["recovery", "mobility", "recovery"]);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(120);
  });
});
