import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildDailyLoadDistribution } from "../dailyLoadDistribution";
import type { WeeklyAllocation } from "../weeklyAllocation";

type CategoryConfig = {
  role?: "primary" | "secondary" | "support" | "recovery" | "optional";
  sessions: number;
  duration?: number;
  unit?: "minutes" | "sets";
  exposure?:
    | "long_session"
    | "threshold_interval"
    | "vo2_interval"
    | "race_specific"
    | "strength_heavy"
    | "strength_hypertrophy"
    | "strength_power"
    | "durability"
    | "mobility"
    | "technique"
    | "recovery";
  loadMultiplier?: number;
};

function weeklyAllocationFor(
  categories: Partial<Record<"run" | "bike" | "swim" | "strength", CategoryConfig>>,
): WeeklyAllocation {
  const activity_categories = Object.fromEntries(
    Object.entries(categories).map(([activityCategory, config]) => {
      const duration = config.duration ?? (activityCategory === "strength" ? 12 : 60);
      const unit = config.unit ?? (activityCategory === "strength" ? "sets" : "minutes");
      return [
        activityCategory,
        {
          role: config.role ?? (activityCategory === "run" ? "primary" : "secondary"),
          volume: {
            unit,
            minimum_effective: duration,
            target: duration,
            maximum_recoverable: duration,
            duration_minutes: {
              minimum_effective: unit === "sets" ? duration * 6 : duration,
              target: unit === "sets" ? duration * 6 : duration,
              maximum_recoverable: unit === "sets" ? duration * 6 : duration,
            },
          },
          sessions: { min: 0, target: config.sessions, max: Math.max(config.sessions, 1) },
          key_exposures: config.exposure
            ? [
                {
                  type: config.exposure,
                  activity_category: activityCategory,
                  min_frequency_per_week: 0,
                  target_frequency_per_week: 1,
                  max_frequency_per_week: 1,
                },
              ]
            : [],
          intensity_distribution: { aerobic_endurance: 1 },
          load_model: {
            load_method:
              activityCategory === "strength"
                ? "strength_volume"
                : activityCategory === "bike"
                  ? "bike_power"
                  : activityCategory === "swim"
                    ? "swim_threshold_speed"
                    : "run_pace",
            fatigue_cost_multiplier: config.loadMultiplier ?? 1,
            mechanical_load_multiplier: 1,
          },
        },
      ];
    }),
  ) as WeeklyAllocation["activity_categories"];

  return {
    version: 1,
    activity_categories,
    totals: {
      target_duration_minutes: Object.values(activity_categories).reduce(
        (sum, category) => sum + (category?.volume.duration_minutes?.target ?? 0),
        0,
      ),
      target_sessions: Object.values(activity_categories).reduce(
        (sum, category) => sum + (category?.sessions.target ?? 0),
        0,
      ),
      estimated_fatigue_cost: 0,
    },
  };
}

function sumRecommendedLoad(points: ReturnType<typeof buildDailyLoadDistribution>) {
  return Math.round(points.reduce((sum, point) => sum + point.recommended_load_tss, 0) * 10) / 10;
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

  it("distributes triathlon weekly allocation across run, bike, and swim days", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 420, phase: "build" }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 2, duration: 120, exposure: "long_session" },
        bike: { role: "secondary", sessions: 2, duration: 150, exposure: "threshold_interval" },
        swim: { role: "secondary", sessions: 1, duration: 45, exposure: "technique" },
      }),
    });

    const trainingPoints = points.filter((point) => point.recommended_load_tss > 0);
    expect(trainingPoints).toHaveLength(5);
    expect(trainingPoints.map((point) => point.activity_category)).toEqual([
      "run",
      "bike",
      "swim",
      "run",
      "bike",
    ]);
    expect(new Set(trainingPoints.map((point) => point.activity_category))).toEqual(
      new Set(["run", "bike", "swim"]),
    );
    expect(sumRecommendedLoad(points)).toBe(420);
  });

  it("treats strength as a first-class allocation with strength focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 3, duration: 150 },
        strength: {
          role: "support",
          sessions: 2,
          duration: 10,
          unit: "sets",
          exposure: "strength_heavy",
          loadMultiplier: 0.6,
        },
      }),
    });

    const strengthPoints = points.filter((point) => point.activity_category === "strength");
    expect(strengthPoints).toHaveLength(2);
    expect(strengthPoints.every((point) => point.primary_focus === "max_strength")).toBe(true);
    expect(sumRecommendedLoad(points)).toBe(300);
  });

  it("falls back to the primary allocation category when no planned session pin exists", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180 }],
      weeklyAllocation: weeklyAllocationFor({
        bike: { role: "primary", sessions: 3, duration: 180 },
      }),
    });

    expect(
      points
        .filter((point) => point.recommended_load_tss > 0)
        .every((point) => point.activity_category === "bike"),
    ).toBe(true);
    expect(sumRecommendedLoad(points)).toBe(180);
  });

  it("pins planned session category and focus when the session is selected", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 240 }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 2, duration: 120 },
        swim: { role: "secondary", sessions: 1, duration: 45 },
      }),
      plannedSessions: [
        {
          date: "2026-01-07",
          activityCategory: "swim",
          primaryFocus: "recovery",
        },
      ],
    });

    const pinned = points.find((point) => point.date === "2026-01-07");
    expect(pinned?.recommended_load_tss).toBeGreaterThan(0);
    expect(pinned?.activity_category).toBe("swim");
    expect(pinned?.primary_focus).toBe("recovery");
    expect(pinned?.reason_codes).toContain("planned_session_category_pin");
    expect(sumRecommendedLoad(points)).toBe(240);
  });
});
